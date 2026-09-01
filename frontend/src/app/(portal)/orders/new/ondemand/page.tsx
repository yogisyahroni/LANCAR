"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { clearCustomerOrderDraft, DeliveryService, isValidLocation, OrderFormValues } from "@/components/orders/OrderSchemas";
import { OnDemandOrderForm } from "@/components/orders/OnDemandOrderForm";
import { OrderSummary } from "@/components/orders/OrderSummary";
import Link from "next/link";
import { PaymentModal } from "@/components/orders/PaymentModal";
import { api } from "@/lib/api";
import { clientLog } from "@/lib/clientLogger";
import { useRouter } from "next/navigation";
import { useNotificationStore } from "@/store/useNotificationStore";
import { Info } from "lucide-react";
import {
  createIdempotencyKey,
  isRetryableTransactionError,
  requestCustomerPaymentSession,
  requestPersistedCustomerOrder,
  type PersistedCustomerOrder,
} from "@/lib/orderTransaction";

interface RoutePreviewSnapshot {
  active_provider?: string;
  provider?: string;
  route_profile?: string;
  vehicle_type?: string;
  distance_km?: number;
  distance_meters?: number;
  duration_seconds?: number;
  eta?: string;
  eta_minutes?: number;
  route_polyline?: string;
  fallback_reason?: string | null;
}

interface PromoQuote {
  eligible: boolean;
  reason?: string | null;
  discount_idr?: number;
  campaign?: {
    id?: string;
    code?: string;
    name?: string;
  } | null;
}

interface EligiblePromo {
  id: string;
  code: string;
  name: string;
  description?: string | null;
}

const deriveRouteVehicleType = (service?: DeliveryService) => {
  const vehicleTypes = service?.vehicle_types?.map((vehicleType) => vehicleType.toLowerCase()) || [];
  if (vehicleTypes.some((vehicleType) => vehicleType.includes("car") || vehicleType.includes("mobil"))) {
    return "car";
  }
  return "motorcycle";
};

const PENDING_ON_DEMAND_TRANSACTION_KEY = "tembus.ondemand.pending-transaction";
const PENDING_TRANSACTION_TTL_MS = 60 * 60 * 1000;

type PendingOnDemandTransaction = {
  fingerprint: string;
  idempotency_key: string;
  order_id?: string;
  created_at: number;
};

const stableSerialize = (value: unknown): string => {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const fingerprintPayload = (payload: unknown): string => {
  let hash = 2166136261;
  for (const character of stableSerialize(payload)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16)}`;
};

const readPendingTransaction = (): PendingOnDemandTransaction | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_ON_DEMAND_TRANSACTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingOnDemandTransaction>;
    if (
      typeof parsed.fingerprint !== "string" ||
      typeof parsed.idempotency_key !== "string" ||
      typeof parsed.created_at !== "number" ||
      Date.now() - parsed.created_at > PENDING_TRANSACTION_TTL_MS
    ) {
      window.sessionStorage.removeItem(PENDING_ON_DEMAND_TRANSACTION_KEY);
      return null;
    }
    return parsed as PendingOnDemandTransaction;
  } catch {
    window.sessionStorage.removeItem(PENDING_ON_DEMAND_TRANSACTION_KEY);
    return null;
  }
};

const persistPendingTransaction = (transaction: PendingOnDemandTransaction) => {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PENDING_ON_DEMAND_TRANSACTION_KEY, JSON.stringify(transaction));
};

const clearPendingTransaction = () => {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PENDING_ON_DEMAND_TRANSACTION_KEY);
};

export default function NewOrderPage() {
  const [formData, setFormData] = useState<Partial<OrderFormValues>>({});
  const [isValid, setIsValid] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isRoutePreviewLoading, setIsRoutePreviewLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pricing, setPricing] = useState<any>(null);
  const [routePreview, setRoutePreview] = useState<RoutePreviewSnapshot | null>(null);
  const [routePreviewError, setRoutePreviewError] = useState<string | null>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<DeliveryService | undefined>();
  const [scanRequired, setScanRequired] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoQuote, setPromoQuote] = useState<PromoQuote | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [isPromoChecking, setIsPromoChecking] = useState(false);
  const [eligiblePromos, setEligiblePromos] = useState<EligiblePromo[]>([]);
  const [isEligiblePromoLoading, setIsEligiblePromoLoading] = useState(false);
  
  const [showPayment, setShowPayment] = useState(false);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [orderData, setOrderData] = useState<any>(null);
  const orderDataRef = useRef<any>(null);
  const pendingTransactionRef = useRef<PendingOnDemandTransaction | null>(null);
  const paymentKeyRef = useRef<{ orderId: string; key: string }>({ orderId: "", key: "" });
  const [transactionPending, setTransactionPending] = useState(false);
  const [transactionNotice, setTransactionNotice] = useState<string | null>(null);
  const previousFormDataRef = useRef<string>("");

  const router = useRouter();
  const { addNotification } = useNotificationStore();
  const routePreviewRequestRef = useRef(0);
  const promoRequestRef = useRef(0);

  useEffect(() => {
    const pending = readPendingTransaction();
    pendingTransactionRef.current = pending;
    if (pending) {
      setTransactionPending(true);
      setTransactionNotice(
        pending.order_id
          ? "Order sudah tersimpan tetapi pembayaran belum selesai. Tekan Bayar Sekarang untuk melanjutkan."
          : "Permintaan order sebelumnya belum mendapat jawaban. Tekan Bayar Sekarang untuk mencoba ulang dengan referensi yang sama.",
      );
    }
  }, []);

  const calculateRoutePreview = useCallback(async (data: Partial<OrderFormValues>, service?: DeliveryService) => {
    const pickup = data.pickup_location;
    const dropoff = data.dropoff_location;
    if (!isValidLocation(pickup) || !isValidLocation(dropoff)) {
      routePreviewRequestRef.current += 1;
      setRoutePreview(null);
      setRoutePreviewError(null);
      setIsRoutePreviewLoading(false);
      return;
    }

    const requestId = routePreviewRequestRef.current + 1;
    routePreviewRequestRef.current = requestId;
    const vehicleType = deriveRouteVehicleType(service);

    setIsRoutePreviewLoading(true);
    setRoutePreviewError(null);

    try {
      const res = await api.get("/maps/route", {
        params: {
          from_lat: pickup.lat,
          from_lng: pickup.lng,
          to_lat: dropoff.lat,
          to_lng: dropoff.lng,
          scope: "web_customer",
          service_code: data.service_code || service?.code || "web_customer_route_preview",
          vehicle_type: vehicleType,
          route_profile: vehicleType
        }
      });

      if (routePreviewRequestRef.current !== requestId) return;

      setRoutePreview(res.data);
      setRoutePreviewError(null);
    } catch (error: any) {
      if (routePreviewRequestRef.current !== requestId) return;

      setRoutePreview(null);
      setRoutePreviewError(
        error.response?.data?.message ||
        error.response?.data?.error ||
        "Rute jalan belum bisa dihitung. Periksa titik pickup dan tujuan."
      );
    } finally {
      if (routePreviewRequestRef.current === requestId) {
        setIsRoutePreviewLoading(false);
      }
    }
  }, []);

  const calculatePricing = useCallback(async (data: Partial<OrderFormValues>) => {
    if (!isValidLocation(data.pickup_location) || !isValidLocation(data.dropoff_location)) {
      setPricing(null);
      setCoverageError("Pilih titik pickup dan tujuan yang valid sebelum menghitung harga.");
      return;
    }
    setIsCalculating(true);
    setCoverageError(null);
    try {
      const res = await api.post('/auth/web/orders/calculate', {
        service_code: data.service_code,
        size_tier: data.size_tier,
        pickup: data.pickup_location,
        dropoff: data.dropoff_location,
        weight_kg: data.package_details?.weight_kg,
        dimensions: data.package_details?.dimensions,
        package_details: data.package_details,
        packages: [{
          category: data.package_details?.category,
          item_description: data.package_details?.item_description,
          quantity: data.package_details?.quantity,
          weight_kg: data.package_details?.weight_kg,
          dimensions: data.package_details?.dimensions,
          dimensions_scanned: data.package_details?.dimensions_scanned,
          is_fragile: data.package_details?.is_fragile,
          is_prohibited: data.package_details?.is_prohibited,
          requires_delivery_code: data.package_details?.requires_delivery_code,
          item_value_idr: data.item_value,
          size_tier: data.size_tier,
        }],
        dimension_scan_verified: data.package_details?.dimensions_scanned,
        has_insurance: data.has_insurance,
        item_value: data.item_value,
        recipient_name: data.recipient_name,
        recipient_phone: data.recipient_phone,
      });
      setPricing(res.data);
      if (res.data?.route_snapshot) {
        setRoutePreview(res.data.route_snapshot);
        setRoutePreviewError(null);
      }
    } catch (error: any) {
      clientLog.warn("Failed to calculate pricing", {
        status: error?.response?.status,
        code: error?.response?.data?.code
      });
      setCoverageError(
        error.response?.data?.message ||
        error.response?.data?.error ||
        "Harga belum bisa dihitung. Periksa layanan, jarak, berat, dan ukuran paket."
      );
      setPricing(null);
    } finally {
      setIsCalculating(false);
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      calculateRoutePreview(formData, selectedService);
    }, 500);

    return () => clearTimeout(handler);
  }, [
    formData.pickup_location?.lat,
    formData.pickup_location?.lng,
    formData.dropoff_location?.lat,
    formData.dropoff_location?.lng,
    formData.service_code,
    selectedService?.code,
    selectedService?.vehicle_types?.join(","),
    calculateRoutePreview
  ]);

  // Debounce effect for price calculation based on individual fields
  useEffect(() => {
    const handler = setTimeout(() => {
      // Aggregator mode: use logistics tariff as pricing, skip API
      if (formData.service_code === 'tembus_aggregator' && formData.logistics_tariff_idr) {
        setCoverageError(null);
        setIsCalculating(false);
        setPricing({
          service_code: 'tembus_aggregator',
          service_name: 'Ekspedisi ' + (formData.logistics_provider || 'Aggregator').toUpperCase(),
          total_price_idr: formData.logistics_tariff_idr,
          base_price_idr: formData.logistics_tariff_idr,
          logistics_tariff_idr: formData.logistics_tariff_idr,
          logistics_provider: formData.logistics_provider,
          volumetric_surcharge_idr: 0,
          insurance_premium_idr: 0,
          dynamic_price_idr: 0,
          platform_fee_idr: 0,
          distance_km: 0,
          delivery_model: 'hub_and_spoke',
          eta_minutes: 0,
          package_count: 1,
          actual_weight_kg: formData.package_details?.weight_kg || 0,
          chargeable_weight_kg: formData.package_details?.weight_kg || 0,
        });
        return;
      }
      const needsScan = scanRequired && !formData.package_details?.dimensions_scanned;
      if (formData.service_code && formData.pickup_location && formData.dropoff_location && formData.package_details?.category) {
        if (needsScan) {
          setPricing(null);
          setCoverageError(null);
          setIsCalculating(false);
          return;
        }
        calculatePricing(formData);
      } else {
        setPricing(null);
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [
    formData.pickup_location?.lat,
    formData.pickup_location?.lng,
    formData.dropoff_location?.lat,
    formData.dropoff_location?.lng,
    formData.service_code,
    formData.size_tier,
    formData.package_details?.category,
    formData.package_details?.item_description,
    formData.package_details?.quantity,
    formData.package_details?.is_fragile,
    formData.package_details?.is_prohibited,
    formData.package_details?.requires_delivery_code,
    formData.package_details?.weight_kg,
    formData.package_details?.dimensions?.length,
    formData.package_details?.dimensions?.width,
    formData.package_details?.dimensions?.height,
    formData.package_details?.dimensions_scanned,
    formData.has_insurance,
    formData.item_value,
    selectedService?.name,
    scanRequired,
    calculatePricing
  ]);

  useEffect(() => {
    setPromoQuote(null);
    setPromoError(null);
  }, [
    pricing?.total_price_idr,
    pricing?.insurance_premium_idr,
    formData.service_code,
    selectedService?.code
  ]);

  useEffect(() => {
    let cancelled = false;
    const serviceCode = formData.service_code;
    if (!serviceCode) {
      setEligiblePromos([]);
      setIsEligiblePromoLoading(false);
      return;
    }

    setIsEligiblePromoLoading(true);
    api.get("/customer/promos/eligible", {
      params: {
        service_code: serviceCode,
        limit: 6
      }
    })
      .then((response) => {
        if (cancelled) return;
        setEligiblePromos(Array.isArray(response.data?.data) ? response.data.data : []);
      })
      .catch((error) => {
        if (cancelled) return;
        clientLog.warn("Eligible promo list unavailable", {
          status: error.response?.status,
          code: error.response?.data?.code
        });
        setEligiblePromos([]);
      })
      .finally(() => {
        if (!cancelled) setIsEligiblePromoLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [formData.service_code]);

  const handleFormChange = useCallback((data: Partial<OrderFormValues>, valid: boolean, context?: { selectedService?: DeliveryService; scanRequired: boolean }) => {
    setFormData(data);
    setIsValid(valid);
    setSelectedService(context?.selectedService);
    setScanRequired(Boolean(context?.scanRequired));
    
    // Check if form data actually changed before resetting orderData
    const currentDataStr = JSON.stringify(data);
    if (previousFormDataRef.current !== currentDataStr) {
      previousFormDataRef.current = currentDataStr;
      setOrderData(null);
      orderDataRef.current = null;
    }
  }, []);

  const handleValidatePromo = useCallback(async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code || !pricing || !formData.service_code) {
      setPromoQuote(null);
      setPromoError("Lengkapi layanan dan harga sebelum memakai promo.");
      return;
    }

    const requestId = promoRequestRef.current + 1;
    promoRequestRef.current = requestId;
    setIsPromoChecking(true);
    setPromoError(null);

    try {
      const response = await api.post("/auth/web/promos/validate", {
        code,
        service_code: formData.service_code,
        vehicle_type: deriveRouteVehicleType(selectedService),
        gross_amount_idr: pricing.total_price_idr,
        insurance_amount_idr: pricing.insurance_premium_idr || 0
      });

      if (promoRequestRef.current !== requestId) return;

      const quote = response.data?.data as PromoQuote;
      setPromoQuote(quote);
      setPromoError(quote?.eligible ? null : quote?.reason || "Promo tidak dapat digunakan.");
    } catch (error: any) {
      if (promoRequestRef.current !== requestId) return;
      setPromoQuote(null);
      setPromoError(
        error.response?.data?.message ||
        error.response?.data?.error ||
        "Promo belum bisa diverifikasi."
      );
    } finally {
      if (promoRequestRef.current === requestId) {
        setIsPromoChecking(false);
      }
    }
  }, [formData.service_code, pricing, promoCode, selectedService]);

  const handleSubmit = async (data: OrderFormValues) => {
    if (!pricing) return;
    if (!isValidLocation(data.pickup_location) || !isValidLocation(data.dropoff_location)) {
      setCoverageError("Titik pickup dan tujuan harus dipilih dari lokasi yang terverifikasi.");
      return;
    }
    setIsSubmitting(true);
    setTransactionPending(false);
    try {
      let currentOrderId = orderDataRef.current?.id || orderData?.id;
      let currentOrder: PersistedCustomerOrder | null = (orderDataRef.current || orderData) as PersistedCustomerOrder | null;

      const appliedPromoCode = promoQuote?.eligible ? promoCode.trim().toUpperCase() : undefined;
      const payload = {
        ...data,
        price_breakdown: pricing,
        promo_code: appliedPromoCode
      };
      const fingerprint = fingerprintPayload(payload);

      if (!currentOrderId) {
        const previous = pendingTransactionRef.current;
        if (previous?.fingerprint === fingerprint && previous.order_id) {
          const recoveredResponse = await api.get(`/auth/web/orders/${previous.order_id}`);
          currentOrder = recoveredResponse.data?.order as PersistedCustomerOrder;
          if (!currentOrder?.id) throw new Error("Order tersimpan belum dapat dipulihkan dari server");
        } else {
          const idempotencyKey = previous?.fingerprint === fingerprint
            ? previous.idempotency_key
            : createIdempotencyKey();
          const pending: PendingOnDemandTransaction = {
            fingerprint,
            idempotency_key: idempotencyKey,
            created_at: previous?.fingerprint === fingerprint ? previous.created_at : Date.now(),
          };
          pendingTransactionRef.current = pending;
          persistPendingTransaction(pending);
          currentOrder = await requestPersistedCustomerOrder(api, payload, idempotencyKey);
          currentOrderId = currentOrder.id;
          const completedPending = { ...pending, order_id: currentOrder.id };
          pendingTransactionRef.current = completedPending;
          persistPendingTransaction(completedPending);
        }
        currentOrderId = currentOrder.id;
        setOrderData(currentOrder);
        orderDataRef.current = currentOrder;
      }

      if (!currentOrderId || !currentOrder?.id || typeof currentOrder.status !== "string") {
        throw new Error("Referensi order tersimpan tidak tersedia");
      }

      if (currentOrder.status !== 'pending_payment') {
        clearPendingTransaction();
        pendingTransactionRef.current = null;
        setTransactionPending(false);
        setTransactionNotice(null);
        clearCustomerOrderDraft();
        addNotification({
          title: "Order Berhasil",
          message: `Order ${currentOrder.order_number || currentOrder.id} sedang diproses.`,
          type: "success"
        });
        router.push('/dashboard');
        return;
      }
      
      if (paymentKeyRef.current.orderId !== currentOrderId) {
        paymentKeyRef.current = { orderId: currentOrderId, key: createIdempotencyKey("web-payment") };
      }
      const payment = await requestCustomerPaymentSession(api, currentOrderId, paymentKeyRef.current.key);
      if (payment.payment_status === "paid" || payment.order_status !== "pending_payment") {
        clearPendingTransaction();
        pendingTransactionRef.current = null;
        setTransactionPending(false);
        setTransactionNotice(null);
        clearCustomerOrderDraft();
        router.push(`/orders/${currentOrderId}`);
        return;
      }

      setPaymentData(payment);
      setShowPayment(true);
      
    } catch (error: any) {
      if (isRetryableTransactionError(error)) {
        setTransactionPending(true);
        setTransactionNotice("Permintaan belum mendapat jawaban server. Order belum dianggap berhasil; tekan Bayar Sekarang untuk retry dengan idempotency key yang sama.");
        addNotification({
          title: "Status order belum diketahui",
          message: "Tidak ada order sukses yang ditampilkan. Coba lagi untuk memeriksa atau mengulang request yang sama.",
          type: "info"
        });
        return;
      }
      addNotification({
        title: "Gagal membuat order",
        message: error.response?.data?.error || "Terjadi kesalahan",
        type: "error"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentSuccess = () => {
    const persistedOrder = orderDataRef.current || orderData;
    if (!persistedOrder?.id) {
      setTransactionPending(true);
      setTransactionNotice("Pembayaran belum dapat dikaitkan ke order tersimpan. Periksa Riwayat Pesanan sebelum mencoba lagi.");
      return;
    }
    clearPendingTransaction();
    pendingTransactionRef.current = null;
    setTransactionPending(false);
    setTransactionNotice(null);
    setShowPayment(false);
    clearCustomerOrderDraft();
    addNotification({
      title: "Pembayaran Berhasil",
      message: `Order ${persistedOrder.order_number || persistedOrder.id} sedang diproses.`,
      type: "success"
    });
    router.push(`/orders/${persistedOrder.id}`);
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Kirim Paket Baru</h1>
          <p className="mt-2 text-muted-foreground">Isi detail pengambilan dan tujuan dengan lengkap.</p>
        </div>
        
        {/* Order Mode Selector */}
        <div className="flex bg-muted/60 p-1 rounded-xl border border-border/40 select-none shrink-0">
          <div
            className="px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-default bg-card text-foreground shadow-sm"
          >
            🚀 Instan (On-Demand)
          </div>
          <Link
            href="/orders/new/aggregator"
            className="px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer text-muted-foreground hover:text-foreground"
          >
            📦 Ekspedisi (Aggregator)
          </Link>
        </div>
      </div>

      {coverageError && (
        <div className="mb-6 p-6 rounded-2xl bg-red-500/10 border border-red-500/20 backdrop-blur-md flex items-start gap-4 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="p-3 bg-red-500/20 rounded-xl text-red-400">
            <Info className="h-6 w-6" />
          </div>
          <div>
            <h4 className="font-bold text-zinc-100 tracking-tight">Harga Belum Bisa Dihitung</h4>
            <p className="text-sm text-muted-foreground mt-1">{coverageError}</p>
          </div>
        </div>
      )}

      {transactionNotice && (
        <div role="status" className={`mb-6 flex items-start gap-3 rounded-2xl border p-4 text-sm ${transactionPending ? "border-amber-500/30 bg-amber-500/10 text-amber-100" : "border-brand-emerald-500/20 bg-brand-emerald-500/10 text-brand-emerald-100"}`}>
          <Info className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{transactionNotice}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left Col - Form (takes 2/3 space) */}
        <div className="lg:col-span-2">
          <OnDemandOrderForm 
            mode="instan"
            onFormChange={handleFormChange}
            onSubmit={handleSubmit}
          />
        </div>

        {/* Right Col - Summary (takes 1/3 space) */}
        <div className="relative">
          <OrderSummary 
            mode="instan"
            isLoading={isCalculating || isSubmitting}
            isRouteLoading={isRoutePreviewLoading}
            routePreview={routePreview}
            routeError={routePreviewError}
            pricing={pricing}
            isValid={isValid}
            promoCode={promoCode}
            promoQuote={promoQuote}
            promoError={promoError}
            isPromoChecking={isPromoChecking}
            eligiblePromos={eligiblePromos}
            isEligiblePromoLoading={isEligiblePromoLoading}
            onPromoCodeChange={setPromoCode}
            onValidatePromo={handleValidatePromo}
          />
        </div>
      </div>

      {showPayment && paymentData && (
        <PaymentModal
          isOpen={showPayment}
          onClose={() => setShowPayment(false)}
          orderId={orderData?.id}
          snapToken={paymentData.snap_token}
          snapJsUrl={paymentData.snap_js_url}
          clientKey={paymentData.client_key}
          redirectUrl={paymentData.redirect_url}
          amount={orderData?.total_price_idr || pricing?.total_price_idr || 0}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
