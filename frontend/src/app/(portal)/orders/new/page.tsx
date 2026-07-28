"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { clearCustomerOrderDraft, DeliveryService, OrderForm, OrderFormValues } from "@/components/orders/OrderForm";
import { OrderSummary } from "@/components/orders/OrderSummary";
import { PaymentModal } from "@/components/orders/PaymentModal";
import { api } from "@/lib/api";
import { clientLog } from "@/lib/clientLogger";
import { useRouter } from "next/navigation";
import { useNotificationStore } from "@/store/useNotificationStore";
import { Info } from "lucide-react";

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
  const previousFormDataRef = useRef<string>("");

  const router = useRouter();
  const { addNotification } = useNotificationStore();
  const routePreviewRequestRef = useRef(0);
  const promoRequestRef = useRef(0);

  const calculateRoutePreview = useCallback(async (data: Partial<OrderFormValues>, service?: DeliveryService) => {
    const pickup = data.pickup_location;
    const dropoff = data.dropoff_location;
    if (!pickup || !dropoff) {
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
        dimension_scan_verified: data.package_details?.dimensions_scanned,
        has_insurance: data.has_insurance,
        item_value: data.item_value
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
          service_name: 'TEMBUS Aggregator',
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
    setIsSubmitting(true);
    try {
      let currentOrderId = orderDataRef.current?.id || orderData?.id;

      if (!currentOrderId) {
        const appliedPromoCode = promoQuote?.eligible ? promoCode.trim().toUpperCase() : undefined;
        const payload = {
          ...data,
          price_breakdown: pricing,
          promo_code: appliedPromoCode
        };
        
        const res = await api.post('/auth/web/orders', payload);
        const order = res.data.order;
        currentOrderId = order.id;
        setOrderData(order);
        orderDataRef.current = order;
      }

      if (orderDataRef.current?.status !== 'pending_payment') {
        clearCustomerOrderDraft();
        addNotification({
          title: "Order Berhasil",
          message: `Order ${orderDataRef.current?.order_number} sedang diproses.`,
          type: "success"
        });
        router.push('/dashboard');
        return;
      }
      
      const sessionRes = await api.post(`/auth/web/orders/${currentOrderId}/payment/session`, 
        { method: 'midtrans' },
        { headers: { 'X-Idempotency-Key': crypto.randomUUID() } }
      );
      
      setPaymentData(sessionRes.data.payment);
      setShowPayment(true);
      clearCustomerOrderDraft();
      
    } catch (error: any) {
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
    setShowPayment(false);
    addNotification({
      title: "Pembayaran Berhasil",
      message: `Order ${orderData?.order_number} sedang diproses.`,
      type: "success"
    });
    router.push('/dashboard');
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Kirim Paket Baru</h1>
        <p className="mt-2 text-muted-foreground">Isi detail pengambilan dan tujuan dengan lengkap.</p>
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

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left Col - Form (takes 2/3 space) */}
        <div className="lg:col-span-2">
          <OrderForm 
            onFormChange={handleFormChange}
            onSubmit={handleSubmit}
          />
        </div>

        {/* Right Col - Summary (takes 1/3 space) */}
        <div className="relative">
          <OrderSummary 
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
