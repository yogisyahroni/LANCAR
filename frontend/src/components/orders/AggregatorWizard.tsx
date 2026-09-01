"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { 
  Loader2, 
  MapPin, 
  ArrowRight, 
  Check, 
  Info, 
  TrendingDown, 
  Package,
  CalendarDays,
  Clock,
  Sparkles,
  ChevronRight,
  ChevronLeft
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AddressPicker } from "./AddressPicker";
import { useLogisticsProviders } from "@/hooks/useLogisticsProviders";
import { PaymentModal } from "./PaymentModal";
import {
  AggregatorOrder,
  AggregatorPayment,
  AggregatorQuote,
  buildAggregatorOrderPayload,
  createIdempotencyKey,
  requestAggregatorOrder,
  requestAggregatorPaymentSession,
} from "@/hooks/useCreateAggregatorOrder";

// ─── Types & Constants ──────────────────────────────────────────────────
// Step 1: Pick Up — provider location code is explicit until the backend
// location-normalization flow supplies a canonical mapping.
const step1Schema = z.object({
  provider: z.string().min(1, "Pilih Ekspedisi"),
  origin_code: z.string().min(1, "Isi kode lokasi pickup provider"),
  pickup_address: z.string().min(5, "Alamat pickup minimal 5 karakter"),
  pickup_location: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
  schedule_type: z.enum(["now", "scheduled"]).default("now"),
  scheduled_at: z.string().optional(),
  vehicle_type: z.enum(["Motor", "Mobil", "Truk"]).default("Motor"),
}).superRefine((data, ctx) => {
  if (data.schedule_type === "scheduled" && !data.scheduled_at) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scheduled_at"],
      message: "Pilih tanggal dan waktu pickup",
    });
  }
  if (!data.pickup_location) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pickup_location"],
      message: "Tentukan titik pickup agar lokasi dapat divalidasi",
    });
  }
});


// Step 2: Order Details — full Mengantar style
const step2Schema = z.object({
  destination_code: z.string().min(1, "Pilih kota tujuan"),
  dropoff_address: z.string().min(5, "Alamat tujuan minimal 5 karakter"),
  dropoff_location: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
  recipient_name: z.string().min(3, "Nama penerima wajib diisi"),
  recipient_phone: z.string().regex(/^(08|628|\+628)[0-9]{8,11}$/, "Nomor HP tidak valid"),
  payment_type: z.enum(["COD", "NON_COD"]).default("NON_COD"),
  item_value: z.number().min(0).default(0),
  weight_kg: z.number().min(0.1, "Berat minimal 0.1 kg"),
  length_cm: z.number().min(0).default(0),
  width_cm: z.number().min(0).default(0),
  height_cm: z.number().min(0).default(0),
  quantity: z.number().min(1).default(1),
  item_description: z.string().min(3, "Isi parcel wajib diisi"),
  category: z.string().optional(),
  dangerous_goods: z.boolean().default(false),
  insurance: z.boolean().default(false),
  delivery_notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!data.dropoff_location) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dropoff_location"],
      message: "Pilih alamat tujuan dari hasil pencarian agar koordinat tersimpan",
    });
  }
});


// Step 3: Review & Service
const step3Schema = z.object({
  service_code: z.string().min(1, "Pilih layanan pengiriman"),
  tariff_idr: z.number(),
  aggregator_quote_id: z.string().uuid("Quote tarif tidak valid"),
});

type Step1Values = z.infer<typeof step1Schema>;
type Step2Values = z.infer<typeof step2Schema>;
type Step3Values = z.infer<typeof step3Schema>;

type WizardValues = Step1Values & Step2Values & Step3Values;

const PENDING_AGGREGATOR_STORAGE_KEY = "tembus.aggregator.pending-transaction";
const PENDING_TRANSACTION_TTL_MS = 30 * 60 * 1000;

function formatPrice(price: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);
}

// ─── Main Component ─────────────────────────────────────────────────────
export function AggregatorWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [orderMode, setOrderMode] = useState<"manual" | "upload" | null>(null);
  const { providers, isLoading: isLoadingProviders, error: providerError } = useLogisticsProviders();
  const [tariffs, setTariffs] = useState<any[]>([]);
  const [isLoadingTariff, setIsLoadingTariff] = useState(false);
  const [tariffError, setTariffError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [bulkRows, setBulkRows] = useState<any[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<AggregatorOrder | null>(null);
  const [payment, setPayment] = useState<AggregatorPayment | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const createTransactionRef = useRef<{ fingerprint: string; key: string }>({ fingerprint: "", key: "" });
  const paymentKeyRef = useRef<{ orderId: string; key: string }>({ orderId: "", key: "" });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const values = methods.getValues();
    if (!values.pickup_address || !values.pickup_location) {
      alert("Alamat penjemputan belum lengkap di Step 1. Silakan kembali ke Step 1.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(0);
    setBulkRows([]);
    setJobId(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('pickup_lat', String(values.pickup_location.lat));
      formData.append('pickup_lng', String(values.pickup_location.lng));
      formData.append('pickup_address', values.pickup_address);
      formData.append('service_code', values.provider || 'tembus_instant');

      const uploadRes = await api.post("/auth/web/orders/bulk/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      const job_id = uploadRes.data?.job_id;
      if (!job_id) throw new Error("Job ID tidak ditemukan dari server");
      setJobId(job_id);

      // Start polling
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await api.get(`/auth/web/orders/bulk/status/${job_id}`);
          const jobData = statusRes.data;

          setUploadProgress(jobData.progress || 0);

          if (jobData.status === 'completed') {
            clearInterval(pollInterval);
            setUploadProgress(100);
            setBulkRows(jobData.rows || []);
            setIsUploading(false);
            setStep(3); // Auto-advance to review step
          } else if (jobData.status === 'failed') {
            clearInterval(pollInterval);
            setIsUploading(false);
            setUploadError("Gagal memproses file di server.");
          }
        } catch (pollErr: any) {
          console.error("Polling error:", pollErr);
          clearInterval(pollInterval);
          setIsUploading(false);
          setUploadError(pollErr.response?.data?.error || "Gagal mengambil status job.");
        }
      }, 2000);

    } catch (err: any) {
      setIsUploading(false);
      setUploadError(err.response?.data?.error || err.message || "Gagal mengunggah file.");
    }
  };

  // Initialize unified form — NO global resolver; we validate per-step manually
  // to avoid Zod v4 ↔ @hookform/resolvers incompatibility (uncaught ZodError).
  const methods = useForm<WizardValues>({
    defaultValues: {
      provider: "",
      origin_code: "",
      pickup_address: "",
      schedule_type: "now",
      destination_code: "",
      dropoff_address: "",
      dropoff_location: null,
      recipient_name: "",
      recipient_phone: "",
      payment_type: "NON_COD",
      item_value: 0,
      weight_kg: 1,
      length_cm: 10,
      width_cm: 10,
      height_cm: 10,
      quantity: 1,
      item_description: "",
      category: "",
      dangerous_goods: false,
      insurance: false,
      delivery_notes: "",
      vehicle_type: "Motor",
      aggregator_quote_id: "",
    },
    mode: "onChange",
  });


  const { register, watch, setValue, formState: { errors } } = methods;

  const currentProvider = watch("provider");
  const scheduleType = watch("schedule_type");
  const pickup_address = watch("pickup_address");
  const pickup_location = watch("pickup_location");
  const rateInputKey = JSON.stringify([
    watch("provider"), watch("origin_code"), watch("destination_code"), watch("weight_kg"),
    watch("length_cm"), watch("width_cm"), watch("height_cm"), watch("item_value"),
    watch("category"), watch("insurance"), watch("payment_type"),
  ]);
  const dropoff_address = watch("dropoff_address");
  const dropoff_location = watch("dropoff_location");

  const clearPendingTransaction = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(PENDING_AGGREGATOR_STORAGE_KEY);
    }
  };

  const startPaymentForOrder = useCallback(async (order: AggregatorOrder) => {
    if (!order.id) throw new Error("Referensi order tidak valid");

    if (order.status && order.status !== "pending_payment") {
      clearPendingTransaction();
      router.push(`/orders/${order.id}`);
      return;
    }

    if (paymentKeyRef.current.orderId !== order.id) {
      paymentKeyRef.current = { orderId: order.id, key: createIdempotencyKey() };
    }

    const paymentSession = await requestAggregatorPaymentSession(
      api,
      order.id,
      paymentKeyRef.current.key,
    );

    if (!paymentSession) {
      clearPendingTransaction();
      router.push(`/orders/${order.id}`);
      return;
    }

    if (paymentSession.payment_status === "paid" || paymentSession.order_status !== "pending_payment") {
      clearPendingTransaction();
      router.push(`/orders/${order.id}`);
      return;
    }

    setPayment(paymentSession);
    setIsPaymentOpen(true);
  }, [router]);

  // Recovery is server-backed: a refresh can restore the persisted order reference
  // and continue payment without creating a second order.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(PENDING_AGGREGATOR_STORAGE_KEY);
    if (!raw) return;

    let transaction: { order_id?: string; created_at?: number };
    try {
      transaction = JSON.parse(raw);
    } catch {
      clearPendingTransaction();
      return;
    }

    if (!transaction.order_id || !transaction.created_at || Date.now() - transaction.created_at > PENDING_TRANSACTION_TTL_MS) {
      clearPendingTransaction();
      return;
    }

    let active = true;
    setSubmitError(null);
    api.get(`/auth/web/orders/${transaction.order_id}`)
      .then((response) => {
        const order = response.data?.order;
        if (!active || !order?.id) throw new Error("Order transaksi tidak ditemukan");
        setCreatedOrder(order);
        setOrderMode("manual");
        setStep(3);
        setRecoveryNotice(`Order ${order.order_number || order.id} dipulihkan. Lanjutkan pembayaran untuk order ini.`);
      })
      .catch((error: any) => {
        if (!active) return;
        setSubmitError(error.response?.data?.error || "Transaksi tersimpan belum dapat dipulihkan. Coba lagi.");
      });

    return () => {
      active = false;
    };
  }, []);


  // Load tariffs when entering Step 3
  useEffect(() => {
    if (step !== 3) return;

    const fetchTariffs = async () => {
      setIsLoadingTariff(true);
      setTariffError(null);
      
      const values = methods.getValues();
      if (!values.origin_code) {
        setTariffError("Kode lokasi pickup provider belum diisi.");
        setIsLoadingTariff(false);
        return;
      }

      try {
        const res = await api.get("/logistics/tariff", {
          params: {
            provider: values.provider,
            origin_code: values.origin_code,
            destination_code: values.destination_code,
            weight_kg: values.weight_kg,
            length_cm: values.length_cm,
            width_cm: values.width_cm,
            height_cm: values.height_cm,
            item_value_idr: values.item_value,
            category: values.category,
            insurance: values.insurance,
            cod: values.payment_type === "COD",
          } as any,
        });
        
        const data = res.data?.data?.services || res.data?.tariffs || [];
        const items = Array.isArray(data) ? data : [data];
        
        const allTariffs = items.map((item: any) => ({
          service: item.service_code || item.service || "reg",
          service_name: item.service_name || item.service || "Reguler",
          price: Number(item.customer_tariff_idr || item.tariff_gross || item.price || item.total_price_idr || 0),
          net_price: Number(item.tariff_net || 0),
          etd: item.etd || item.estimated_days || "",
          etd_source: item.etd_source || item.eta_source || "",
          quote_id: item.quote_id || "",
        }));

        allTariffs.sort((a, b) => a.price - b.price);

        if (allTariffs.length === 0) {
          setTariffError(`Layanan ${values.provider.toUpperCase()} belum tersedia untuk rute ini.`);
        }
        setTariffs(allTariffs);
        
        // Auto-select cheapest if available
        if (allTariffs.length > 0) {
           setValue("service_code", allTariffs[0].service);
           setValue("tariff_idr", allTariffs[0].price);
           setValue("aggregator_quote_id", allTariffs[0].quote_id);
        }
      } catch (err: any) {
        setTariffError(err.response?.data?.error || err.response?.data?.message || "Gagal memuat tarif.");
      } finally {
        setIsLoadingTariff(false);
      }
    };

    fetchTariffs();
  }, [step, methods, setValue, rateInputKey]);

  const validateStep = async (stepNum: number): Promise<boolean> => {
    // ALWAYS clear stale errors from previous validation first
    methods.clearErrors();

    const values = methods.getValues();
    const schema = stepNum === 1 ? step1Schema : stepNum === 2 ? step2Schema : step3Schema;
    try {
      await schema.parseAsync(values);
      return true;
    } catch (err: any) {
      // Support both Zod v4 (.issues) and older alias (.errors)
      const issues: any[] = err?.issues ?? err?.errors ?? [];
      issues.forEach((issue: any) => {
        const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
        if (path) {
          methods.setError(path as any, { type: "manual", message: issue.message });
        }
      });
      return false;
    }
  };

  const onNextStep = async () => {
    const isStepValid = await validateStep(step);
    if (isStepValid) {
      setStep((prev) => prev + 1);
      if (step === 1) setOrderMode(null); // reset mode selection when entering step 2
    }
  };

  const onPrevStep = () => {
    if (step === 2) setOrderMode(null); // back to mode selection if on manual/upload
    setStep((prev) => prev - 1);
  };

  const onSubmitFinal = async () => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      if (orderMode === "upload") {
        if (!jobId || bulkRows.length === 0) {
          setSubmitError("Data upload tidak valid.");
          return;
        }
        const response = await api.post("/auth/web/orders/bulk/process", { job_id: jobId });
        if (response.data?.success !== true || Number(response.data?.processed_count || 0) < 1) {
          throw new Error("Server belum mengonfirmasi order bulk tersimpan");
        }
        router.push("/orders");
      } else {
        if (createdOrder) {
          await startPaymentForOrder(createdOrder);
          return;
        }

        const isValid = await validateStep(3);
        if (!isValid) return;

        const values = methods.getValues();
        const selectedTariff = tariffs.find((tariff) => tariff.service === values.service_code);
        if (!selectedTariff || !values.pickup_location || !values.dropoff_location) {
          throw new Error("Kutipan tarif dan koordinat pickup/dropoff wajib tersedia");
        }

        const destinationCity = cities.find((city) => city.code === values.destination_code)?.name || values.destination_code;
        const payload = buildAggregatorOrderPayload({
          provider: values.provider,
          pickup_address: values.pickup_address,
          pickup_location: values.pickup_location,
          dropoff_address: values.dropoff_address,
          dropoff_location: values.dropoff_location,
          recipient_name: values.recipient_name,
          recipient_phone: values.recipient_phone,
          destination_code: values.destination_code,
          pickup_city: cities.find((city) => city.code === ORIGIN_CODE)?.name || ORIGIN_CODE,
          dropoff_city: destinationCity,
          payment_type: values.payment_type,
          item_value: values.item_value,
          weight_kg: values.weight_kg,
          quantity: values.quantity,
          item_description: values.item_description,
          category: values.category,
          dangerous_goods: values.dangerous_goods,
          delivery_notes: values.delivery_notes,
          schedule_type: values.schedule_type,
          scheduled_at: values.scheduled_at,
          vehicle_type: values.vehicle_type,
        }, selectedTariff as AggregatorQuote);

        const fingerprint = JSON.stringify(payload);
        if (createTransactionRef.current.fingerprint !== fingerprint) {
          createTransactionRef.current = { fingerprint, key: createIdempotencyKey() };
        }

        const order = await requestAggregatorOrder(
          api,
          payload,
          createTransactionRef.current.key,
        );
        setCreatedOrder(order);
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(PENDING_AGGREGATOR_STORAGE_KEY, JSON.stringify({
            order_id: order.id,
            idempotency_key: createTransactionRef.current.key,
            created_at: Date.now(),
          }));
        }
        await startPaymentForOrder(order);
      }
    } catch (error: any) {
      console.error(error);
      setSubmitError(error.response?.data?.error || error.response?.data?.message || error.message || "Gagal membuat pesanan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentSuccess = () => {
    const orderId = createdOrder?.id;
    if (!orderId) {
      setSubmitError("Pembayaran terkonfirmasi tetapi referensi order tidak tersedia. Buka Riwayat Pesanan untuk memeriksa status.");
      return;
    }
    clearPendingTransaction();
    setIsPaymentOpen(false);
    router.push(`/orders/${orderId}`);
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Stepper Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-white/10" />
          <div 
            className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-indigo-500 transition-all duration-300" 
            style={{ width: `${((step - 1) / 2) * 100}%` }} 
          />
          
          {[
            { num: 1, label: "Pick Up" },
            { num: 2, label: "Order" },
            { num: 3, label: "Review" },
          ].map((s) => (
            <div key={s.num} className="relative z-10 flex flex-col items-center gap-2 bg-background px-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 font-bold text-sm transition-colors ${step >= s.num ? "border-indigo-500 bg-indigo-500 text-white" : "border-white/20 bg-background text-muted-foreground"}`}>
                {step > s.num ? <Check className="h-4 w-4" /> : s.num}
              </div>
              <span className={`text-xs font-medium ${step >= s.num ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {(recoveryNotice || submitError) && (
        <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${submitError
          ? "border-red-500/30 bg-red-500/10 text-red-200"
          : "border-indigo-500/30 bg-indigo-500/10 text-indigo-200"}`} role="status">
          {submitError || recoveryNotice}
        </div>
      )}

      <FormProvider {...methods}>
        <form onSubmit={(e) => { e.preventDefault(); onSubmitFinal(); }} className="space-y-6">
          
          {/* STEP 1: PICK UP */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              {/* Ekspedisi */}
              <div>
                <label className="mb-3 block text-base font-semibold text-foreground">1. Pilih Ekspedisi</label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {providers.map((provider) => (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => setValue("provider", provider.id, { shouldValidate: true })}
                      className={[
                        "rounded-xl border-2 px-4 py-4 text-center transition-all",
                        currentProvider === provider.id
                          ? "border-indigo-400 bg-white/10 shadow-lg shadow-white/5"
                          : "border-white/10 bg-background/40 hover:bg-white/5 hover:border-white/20",
                      ].join(" ")}
                    >
                      <span className="block font-bold text-foreground">{provider.name}</span>
                    </button>
                  ))}
                </div>
                {isLoadingProviders && <p className="mt-2 text-xs text-muted-foreground">Memuat ekspedisi yang tersedia...</p>}
                {!isLoadingProviders && providers.length === 0 && (
                  <p className="mt-2 text-xs text-destructive">{providerError || "Belum ada ekspedisi yang tersedia dari server."}</p>
                )}
                {errors.provider && <p className="mt-2 text-xs text-destructive">{errors.provider.message}</p>}
              </div>

              <div className="h-px bg-white/10" />

              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Kode lokasi pickup provider</label>
                <input
                  {...register("origin_code")}
                  placeholder="Diisi dari mapping lokasi provider"
                  className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2.5 text-sm uppercase focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                {errors.origin_code && <p className="mt-1 text-xs text-destructive">{errors.origin_code.message}</p>}
              </div>

              <div className="h-px bg-white/10" />

              {/* 2. Detail Pengirim — only AddressPicker, Kota Asal removed */}
              <div>
                <label className="mb-3 block text-base font-semibold text-foreground">2. Detail Pengirim</label>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Alamat Lengkap (Pickup)</label>
                    <AddressPicker
                      mode="pickup"
                      address={pickup_address}
                      location={pickup_location as any}
                      setValue={setValue as any}
                      error={errors.pickup_address?.message}
                      locationError={undefined}
                      cardPicker={true}
                    />
                  </div>
                </div>
              </div>

              <div className="h-px bg-white/10" />

              {/* 3. Jadwal Penjemputan */}
              <div>
                <label className="mb-3 block text-base font-semibold text-foreground">3. Jadwal Penjemputan</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`cursor-pointer rounded-xl border px-4 py-3 transition-colors ${scheduleType === "now" ? "border-indigo-500 bg-indigo-500/10 text-indigo-100" : "border-white/10 bg-background/50 hover:bg-white/5 text-muted-foreground"}`}>
                    <div className="flex items-center gap-2">
                      <input type="radio" value="now" {...register("schedule_type")} className="hidden" />
                      <Clock className="h-4 w-4" />
                      <span className="font-semibold text-sm">Sekarang</span>
                    </div>
                  </label>
                  <label className={`cursor-pointer rounded-xl border px-4 py-3 transition-colors ${scheduleType === "scheduled" ? "border-indigo-500 bg-indigo-500/10 text-indigo-100" : "border-white/10 bg-background/50 hover:bg-white/5 text-muted-foreground"}`}>
                    <div className="flex items-center gap-2">
                      <input type="radio" value="scheduled" {...register("schedule_type")} className="hidden" />
                      <CalendarDays className="h-4 w-4" />
                      <span className="font-semibold text-sm">Terjadwal</span>
                    </div>
                  </label>
                </div>
                {scheduleType === "scheduled" && (
                  <div className="mt-3">
                    <input
                      type="datetime-local"
                      {...register("scheduled_at")}
                      className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 [color-scheme:dark]"
                    />
                    {errors.scheduled_at && <p className="mt-1 text-xs text-destructive">{errors.scheduled_at.message}</p>}
                  </div>
                )}
              </div>

              <div className="h-px bg-white/10" />

              {/* 4. Volume / Kendaraan */}
              <div>
                <label className="mb-1 block text-base font-semibold text-foreground">4. Volume</label>
                <p className="mb-4 text-sm text-muted-foreground">Pilih kendaraan yang muat dengan semua parcelmu</p>
                <div className="grid grid-cols-3 gap-3">
                  {(["Motor", "Mobil", "Truk"] as const).map(vt => (
                    <button
                      key={vt}
                      type="button"
                      onClick={() => setValue("vehicle_type", vt, { shouldValidate: true })}
                      className={[
                        "relative flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                        watch("vehicle_type") === vt
                          ? "border-indigo-500 bg-indigo-500/10 text-indigo-100"
                          : "border-white/10 bg-background/50 hover:bg-white/5 text-muted-foreground",
                      ].join(" ")}
                    >
                      {watch("vehicle_type") === vt && (
                        <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-brand-emerald-500 flex items-center justify-center">
                          <Check className="h-2.5 w-2.5 text-white" />
                        </span>
                      )}
                      <span>{vt === "Motor" ? "🏍️" : vt === "Mobil" ? "🚗" : "🚚"}</span>
                      {vt}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}


          {/* STEP 2: ORDER — Pick Up Summary + Mode Selector */}
          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-4">

              {/* ── Pick Up Summary Card (always visible in Step 2) ── */}
              <div className="rounded-xl border border-white/10 bg-white/5">
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20">
                    <Package className="h-4 w-4 text-indigo-400" />
                  </div>
                  <span className="font-bold">Pick Up</span>
                </div>

                {/* Courier row */}
                <div className="flex items-start gap-4 border-b border-white/10 px-5 py-3">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                    <span className="text-base">🔄</span> Select Courier
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {providers.filter(p => p.id === watch("provider")).map(p => (
                      <span
                        key={p.id}
                        className={[
                          "relative inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
                          watch("provider") === p.id
                            ? "border-indigo-400 text-foreground bg-white/5"
                            : "border-white/10 text-muted-foreground",
                        ].join(" ")}
                      >
                        {watch("provider") === p.id && (
                          <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-brand-emerald-500 flex items-center justify-center">
                            <Check className="h-2 w-2 text-white" />
                          </span>
                        )}
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Tipe */}
                <div className="flex items-center gap-4 border-b border-white/10 px-5 py-3">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="text-base">🎁</span> Tipe
                  </span>
                  <span className="flex-1 text-sm">
                    {watch("schedule_type") === "now" ? "Penjemputan Sekarang" : "Penjemputan Terjadwal"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-5 rounded-full bg-brand-emerald-500/20 flex items-center justify-center">
                      <Check className="h-3 w-3 text-brand-emerald-400" />
                    </span>
                    <button type="button" onClick={() => setStep(1)} className="text-muted-foreground hover:text-foreground">
                      <span className="text-xs">✏️</span>
                    </button>
                  </div>
                </div>

                {/* Alamat */}
                <div className="flex items-start gap-4 border-b border-white/10 px-5 py-3">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground flex items-center gap-1.5 pt-0.5">
                    <MapPin className="h-3.5 w-3.5" /> Alamat
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-indigo-300 truncate">{watch("pickup_address") || "—"}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">📍 Belum Pinpoint</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="h-5 w-5 rounded-full bg-brand-emerald-500/20 flex items-center justify-center">
                      <Check className="h-3 w-3 text-brand-emerald-400" />
                    </span>
                    <button type="button" onClick={() => setStep(1)} className="text-muted-foreground hover:text-foreground">
                      <span className="text-xs">✏️</span>
                    </button>
                  </div>
                </div>

                {/* Waktu */}
                {watch("schedule_type") === "scheduled" && (
                  <div className="flex items-center gap-4 border-b border-white/10 px-5 py-3">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> Waktu
                    </span>
                    <span className="flex-1 text-sm">{watch("scheduled_at") || "—"}</span>
                    <span className="h-5 w-5 rounded-full bg-brand-emerald-500/20 flex items-center justify-center">
                      <Check className="h-3 w-3 text-brand-emerald-400" />
                    </span>
                  </div>
                )}

                {/* Volume */}
                <div className="flex items-center gap-4 px-5 py-3">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5" /> Volume
                  </span>
                  <span className="flex-1 text-sm text-muted-foreground">
                    Parcel dapat diangkut dengan {watch("vehicle_type") === "Motor" ? "sepeda" : watch("vehicle_type") === "Mobil" ? "mobil" : "truk"}
                  </span>
                  <span className="h-5 w-5 rounded-full bg-brand-emerald-500/20 flex items-center justify-center">
                    <Check className="h-3 w-3 text-brand-emerald-400" />
                  </span>
                </div>
              </div>

              {/* ── Mode: PILIHAN (null) ── */}
              {orderMode === null && (
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setOrderMode("manual")}
                    className="group flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 p-8 transition-all hover:border-indigo-500/50 hover:bg-indigo-500/5"
                  >
                    <div className="h-14 w-14 rounded-xl bg-amber-500/20 flex items-center justify-center transition-transform group-hover:scale-110">
                      <span className="text-3xl">📋</span>
                    </div>
                    <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground">Membuat orderan secara manual</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderMode("upload")}
                    className="group flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 p-8 transition-all hover:border-indigo-500/50 hover:bg-indigo-500/5"
                  >
                    <div className="h-14 w-14 rounded-xl bg-primary/20 flex items-center justify-center transition-transform group-hover:scale-110">
                      <span className="text-3xl">📤</span>
                    </div>
                    <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground">Upload file orderan</span>
                  </button>
                </div>
              )}

              {/* ── Mode: MANUAL ── */}
              {orderMode === "manual" && (
                <div className="flex gap-5 items-start">

                  {/* LEFT: Main Order Form */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 rounded-t-xl border border-white/10 bg-white/5 px-5 pt-5 pb-4">
                      <div className="h-9 w-9 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                        <Package className="h-5 w-5 text-amber-400" />
                      </div>
                      <h3 className="font-bold text-base">Pesanan 1</h3>
                    </div>

                    <div className="border-x border-b border-white/10 rounded-b-xl bg-white/[0.03] p-5 space-y-5">

                      {/* 1. Nama + HP */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Nama Pelanggan</label>
                          <input
                            {...register("recipient_name")}
                            placeholder="Contoh: Budi Santoso"
                            className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                          {errors.recipient_name && <p className="mt-1 text-xs text-destructive">{errors.recipient_name.message}</p>}
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Nomor Telepon</label>
                          <input
                            {...register("recipient_phone")}
                            type="tel"
                            placeholder="08123456789"
                            className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                          {errors.recipient_phone && <p className="mt-1 text-xs text-destructive">{errors.recipient_phone.message}</p>}
                        </div>
                      </div>

                      {/* 2. Alamat + koordinat tujuan */}
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Alamat</label>
                        <AddressPicker
                          mode="dropoff"
                          address={dropoff_address}
                          location={dropoff_location as any}
                          setValue={setValue as any}
                          error={errors.dropoff_address?.message}
                          locationError={errors.dropoff_location?.message as string | undefined}
                          cardPicker={true}
                        />
                      </div>

                      {/* 3. Provinsi / Kota */}
                      <div>
                        <label className="mb-1 block text-sm font-medium text-muted-foreground">Provinsi / Kota / Kecamatan / Kelurahan / Kode Pos</label>
                        <p className="mb-2 text-xs text-muted-foreground/70">Masukkan nama kota / kecamatan (setidaknya 4 karakter)</p>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-emerald-400" />
                          <input
                            {...register("destination_code")}
                            placeholder="Kode lokasi tujuan provider"
                            className="w-full rounded-lg border border-white/10 bg-background/50 pl-10 pr-3 py-2.5 text-sm uppercase focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        </div>
                        {errors.destination_code && <p className="mt-1 text-xs text-destructive">{errors.destination_code.message}</p>}
                      </div>

                      <div className="h-px bg-white/10" />

                      {/* 4. Payment + Nilai Barang */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Payment</label>
                          <div className="flex gap-2">
                            {(["COD", "NON_COD"] as const).map(pt => (
                              <button
                                key={pt}
                                type="button"
                                disabled={pt === "COD"}
                                onClick={() => {
                                  if (pt !== "COD") setValue("payment_type", pt, { shouldValidate: true });
                                }}
                                className={[
                                  "relative flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium transition-all",
                                  watch("payment_type") === pt
                                    ? "border-indigo-500 bg-indigo-500/15 text-indigo-300"
                                    : pt === "COD"
                                      ? "cursor-not-allowed border-white/10 bg-background/20 text-muted-foreground/50"
                                      : "border-white/10 bg-background/40 text-muted-foreground hover:bg-white/5",
                                ].join(" ")}
                                title={pt === "COD" ? "COD aggregator belum tersedia" : undefined}
                              >
                                {watch("payment_type") === pt && (
                                  <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-indigo-500 flex items-center justify-center">
                                    <Check className="h-2 w-2 text-white" />
                                  </span>
                                )}
                                <span className="text-xs">{pt === "COD" ? "💸" : "💳"}</span>
                                {pt === "COD" ? "COD (segera hadir)" : "Non - COD"}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                            {watch("payment_type") === "COD" ? "Nilai COD" : "Nilai Barang"} <Info className="h-3.5 w-3.5" />
                          </label>
                          <input
                            {...register("item_value", { valueAsNumber: true })}
                            type="number"
                            min="0"
                            placeholder="1000"
                            className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        </div>
                      </div>

                      {/* 5. Berat + Dimensi + Jumlah */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Berat (kg)</label>
                          <input
                            {...register("weight_kg", { valueAsNumber: true })}
                            type="number"
                            min="0.1"
                            step="0.1"
                            className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                          {errors.weight_kg && <p className="mt-1 text-xs text-destructive">{errors.weight_kg.message}</p>}
                        </div>
                        <div>
                          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                            Jumlah (Quantity) <Info className="h-3.5 w-3.5" />
                          </label>
                          <input
                            {...register("quantity", { valueAsNumber: true })}
                            type="number"
                            min="1"
                            className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Dimensi paket (cm)</label>
                        <div className="grid grid-cols-3 gap-2">
                          <input {...register("length_cm", { valueAsNumber: true })} type="number" min="0" placeholder="Panjang" aria-label="Panjang paket (cm)" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                          <input {...register("width_cm", { valueAsNumber: true })} type="number" min="0" placeholder="Lebar" aria-label="Lebar paket (cm)" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                          <input {...register("height_cm", { valueAsNumber: true })} type="number" min="0" placeholder="Tinggi" aria-label="Tinggi paket (cm)" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground/70">Berat tagih memakai nilai aktual atau volumetrik provider, mana yang lebih besar.</p>
                      </div>

                      {/* 6. Isi Parcel */}
                      <div>
                        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                          Isi Parcel / Nama Produk <Info className="h-3.5 w-3.5" />
                        </label>
                        <input
                          {...register("item_description")}
                          placeholder="Con. Baju Biru, ukuran L"
                          className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                        {errors.item_description && <p className="mt-1 text-xs text-destructive">{errors.item_description.message}</p>}
                      </div>

                      {/* 7. Barang Berbahaya */}
                      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                        <input
                          type="checkbox"
                          {...register("dangerous_goods")}
                          className="h-4 w-4 rounded border-white/20 bg-background accent-indigo-500"
                        />
                        <span className="text-muted-foreground">Tandai Sebagai Barang Berbahaya</span>
                        <Info className="h-3.5 w-3.5 text-muted-foreground/60" />
                      </label>

                      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                        <input type="checkbox" {...register("insurance")} className="h-4 w-4 rounded border-white/20 bg-background accent-indigo-500" />
                        <span className="text-muted-foreground">Tambahkan asuransi (jika didukung provider)</span>
                      </label>

                      {/* 8. Instruksi Pengiriman */}
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Instruksi Pengiriman</label>
                        <textarea
                          {...register("delivery_notes")}
                          rows={2}
                          placeholder="Tolong penerima dihubungi dahulu sebelum paket dikirim."
                          className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2.5 text-sm resize-none focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                      </div>

                      {/* 9. Rincian Pembayaran */}
                      <div className="rounded-lg border border-white/10 bg-background/30 p-4">
                        <p className="mb-3 text-sm font-semibold">Rincian Pembayaran</p>
                        <div className="space-y-1.5 text-sm">
                          <div className="flex justify-between text-muted-foreground">
                            <span>Estimasi Biaya Pengiriman Normal</span>
                            <span>Rp-</span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span className="flex items-center gap-1">Estimasi Biaya Pengiriman Khusus Mengantar <Info className="h-3 w-3" /></span>
                            <span>Rp-</span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>Estimasi Jumlah Yang Akan Diterima</span>
                            <span>Rp-</span>
                          </div>
                        </div>
                      </div>

                      {/* Hapus Pesanan */}
                      <div className="border-t border-white/10 pt-4 text-right">
                        <button type="button" className="text-sm text-destructive hover:underline">Hapus Pesanan</button>
                      </div>

                    </div>
                  </div>

                  {/* RIGHT: Total Pesanan Panel */}
                  <div className="w-52 shrink-0">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 sticky top-4">
                      <div className="mb-4 flex items-center justify-between">
                        <span className="text-sm font-semibold">Total Pesanan</span>
                        <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-sm font-bold text-indigo-300">1</span>
                      </div>
                      <div className="mb-4 space-y-2">
                        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3">
                          <div className="flex items-start justify-between">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">Pesanan 1</p>
                              <p className="truncate text-xs text-muted-foreground">{watch("recipient_name") || "—"}</p>
                              <p className="truncate text-xs text-muted-foreground">{watch("recipient_phone") || "—"}</p>
                            </div>
                            <span className="ml-2 shrink-0 text-xs text-amber-400">Editing</span>
                          </div>
                        </div>
                      </div>
                      <button type="button" className="mb-4 flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300">
                        <span className="text-base font-bold">+</span> Tambah Pesanan
                      </button>
                      <div className="h-px bg-white/10 mb-4" />
                      <div className="space-y-2">
                        <button type="button" className="w-full rounded-lg border border-white/20 bg-background/40 py-2 text-sm font-medium hover:bg-white/5 transition-colors">
                          Simpan Draft
                        </button>
                        <button
                          type="button"
                          onClick={onNextStep}
                          className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
                        >
                          Simpan &amp; Lanjutkan
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Mode: UPLOAD ── */}
              {orderMode === "upload" && (
                <div className="space-y-4">
                  {/* Template Selector */}
                  <div className="rounded-xl border border-white/10 bg-white/5">
                    <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                      <div className="h-8 w-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                        <span className="text-lg">📄</span>
                      </div>
                      <span className="font-semibold">Pilih Template Pemetaan</span>
                    </div>
                    <div className="divide-y divide-white/10">
                      {[
                        { id: "default", name: "Default Template", tag: "Simple" },
                        { id: "cargo", name: "Default Template Cargo Ex", tag: "Cargo" },
                        { id: "dg", name: "Default Template DG", tag: "DG" },
                      ].map(tpl => (
                        <div key={tpl.id} className="flex items-center gap-3 px-5 py-3">
                          <input type="radio" name="template" value={tpl.id} className="accent-indigo-500" />
                          <span className="flex-1 text-sm">{tpl.name}</span>
                          <span className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-muted-foreground">{tpl.tag}</span>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <button type="button" className="hover:text-foreground">🗑️</button>
                            <button type="button" className="hover:text-foreground">✏️</button>
                            <button type="button" className="hover:text-foreground">👁️</button>
                            <button type="button" className="hover:text-foreground">⬇️</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between px-5 py-4 border-t border-white/10">
                      <span className="text-sm text-muted-foreground">Jumlah COD Dideteksi 0</span>
                      <button type="button" className="flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/5">
                        <span>+</span> Buat Template Baru
                      </button>
                    </div>
                  </div>

                  {/* Upload Drop Zone */}
                  <div className={`rounded-xl border-2 border-dashed border-white/20 bg-white/5 p-8 text-center transition-colors ${isUploading ? 'opacity-75 cursor-not-allowed' : ''}`}>
                    {isUploading ? (
                      <div className="flex flex-col items-center justify-center">
                        <Loader2 className="mb-4 h-10 w-10 animate-spin text-indigo-400" />
                        <p className="font-semibold text-sm mb-2">Memproses File ({uploadProgress}%)</p>
                        <div className="w-full max-w-xs bg-white/10 rounded-full h-2 mb-2">
                          <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                        <p className="text-xs text-muted-foreground">Mohon tunggu, jangan tutup halaman ini...</p>
                      </div>
                    ) : (
                      <>
                        <div className="mb-4 flex justify-center">
                          <div className="h-16 w-16 rounded-xl bg-orange-500/20 flex items-center justify-center">
                            <span className="text-3xl">📤</span>
                          </div>
                        </div>
                        <p className="mb-1 font-semibold">Upload a CSV or Excel</p>
                        <p className="mb-3 text-sm text-muted-foreground">
                          Drag &amp; Drop, atau{" "}
                          <label className="cursor-pointer text-indigo-400 underline hover:text-indigo-300">
                            Browse Files
                            <input 
                              type="file" 
                              accept=".csv,.xlsx,.xls" 
                              className="hidden" 
                              onChange={handleFileUpload}
                              disabled={isUploading}
                            />
                          </label>
                        </p>
                        <p className="text-xs text-muted-foreground/60">Pastikan file sesuai dengan template Ekspedisi.</p>
                      </>
                    )}
                  </div>
                  {uploadError && (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
                      <Info className="h-4 w-4 shrink-0" />
                      {uploadError}
                    </div>
                  )}

                  {/* Footer Actions */}
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setOrderMode("manual")}
                      className="text-sm text-muted-foreground hover:text-foreground underline"
                    >
                      Pindah ke metode manual
                    </button>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (bulkRows.length > 0) setStep(3);
                        }}
                        disabled={bulkRows.length === 0}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
                      >
                        Lanjut Review
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}




          {/* STEP 3: REVIEW & SERVICE */}
          {step === 3 && orderMode !== "upload" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <h3 className="mb-4 font-semibold">Ringkasan Rute</h3>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Dari</p>
                    <p className="font-medium">{watch("origin_code") || "—"}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Tujuan</p>
                    <p className="font-medium">{watch("destination_code") || "—"}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-6 border-t border-white/10 pt-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Provider</p>
                    <p className="font-medium uppercase">{watch("provider")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Berat</p>
                    <p className="font-medium">{watch("weight_kg")} kg</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-3 block text-base font-semibold text-foreground">Pilih Layanan</label>
                
                {isLoadingTariff ? (
                  <div className="space-y-3 rounded-lg border border-white/10 bg-background/40 p-4" aria-busy="true" aria-label="Menghitung ongkir">
                    <Skeleton className="h-4 w-44 bg-white/10" />
                    <Skeleton className="h-12 w-full bg-white/10" />
                    <Skeleton className="h-12 w-full bg-white/10" />
                  </div>
                ) : tariffError ? (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
                    <div className="flex items-start gap-2">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{tariffError}</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {tariffs.map((tariff, idx) => {
                      const isSelected = watch("service_code") === tariff.service;
                      return (
                        <button
                          key={tariff.service}
                          type="button"
                          onClick={() => {
                            setValue("service_code", tariff.service, { shouldValidate: true });
                            setValue("tariff_idr", tariff.price, { shouldValidate: true });
                            setValue("aggregator_quote_id", tariff.quote_id, { shouldValidate: true });
                          }}
                          className={[
                            "relative rounded-xl border p-4 text-left transition-all",
                            isSelected 
                              ? "border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10" 
                              : "border-white/10 bg-background/40 hover:bg-white/5",
                          ].join(" ")}
                        >
                          <div className="flex justify-between">
                            <p className="font-bold text-foreground">{tariff.service_name}</p>
                            {isSelected && <Check className="h-4 w-4 text-indigo-400" />}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {tariff.etd ? `Estimasi ${tariff.etd}${tariff.etd_source ? ` · sumber ${tariff.etd_source}` : ""}` : "ETA belum disediakan provider"}
                          </p>
                          <div className="mt-3 flex items-end justify-between">
                            <div className="text-[10px]">
                              {idx === 0 && (
                                <span className="rounded border border-brand-emerald-500/30 bg-brand-emerald-500/10 px-1.5 py-0.5 text-brand-emerald-300">Termurah</span>
                              )}
                            </div>
                            <p className="text-sm font-bold text-indigo-400">{formatPrice(tariff.price)}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {errors.service_code && <p className="mt-2 text-xs text-destructive">{errors.service_code.message}</p>}
              </div>
            </div>
          )}

          {step === 3 && orderMode === "upload" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <h3 className="mb-4 font-semibold flex items-center justify-between">
                  <span>Validasi Order Massal</span>
                  <span className="text-sm rounded bg-indigo-500/20 text-indigo-300 px-2 py-1">{bulkRows.length} Order</span>
                </h3>
                
                {bulkRows.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-white/10">
                    <table className="w-full text-left text-sm text-muted-foreground">
                      <thead className="bg-white/5 text-xs uppercase text-foreground">
                        <tr>
                          <th className="px-4 py-3">Penerima</th>
                          <th className="px-4 py-3">Tujuan</th>
                          <th className="px-4 py-3 text-center">Berat</th>
                          <th className="px-4 py-3">Layanan</th>
                          <th className="px-4 py-3 text-right">Tarif</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {bulkRows.slice(0, 10).map((row: any, i: number) => (
                          <tr key={i} className="hover:bg-white/5">
                            <td className="px-4 py-3">
                              <p className="font-medium text-foreground">{row.recipient_name}</p>
                              <p className="text-xs">{row.recipient_phone}</p>
                            </td>
                            <td className="px-4 py-3 truncate max-w-[150px]" title={row.dropoff_address}>{row.dropoff_address}</td>
                            <td className="px-4 py-3 text-center">{row.weight_kg} kg</td>
                            <td className="px-4 py-3 font-medium uppercase text-xs">{row.price_breakdown?.service_code || 'TBD'}</td>
                            <td className="px-4 py-3 font-medium text-indigo-400 text-right">
                              {row.price_breakdown?.total_price_idr ? formatPrice(row.price_breakdown.total_price_idr) : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Tidak ada order yang berhasil diproses.</p>
                )}
                
                {bulkRows.length > 10 && (
                  <p className="text-xs text-center text-muted-foreground mt-3 pt-3 border-t border-white/10">
                    Menampilkan 10 dari total {bulkRows.length} order.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Stepper Footer Controls */}
          <div className="flex items-center justify-between pt-6 border-t border-white/10 mt-8">
            {step > 1 ? (
              <button
                type="button"
                onClick={onPrevStep}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Kembali
              </button>
            ) : <div />}

            {step < 3 ? (
              <button
                type="button"
                onClick={onNextStep}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600 transition-colors"
              >
                Selanjutnya
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting || (orderMode === "upload" ? bulkRows.length === 0 : (!createdOrder && (isLoadingTariff || tariffs.length === 0)))}
                className="inline-flex min-w-[160px] items-center justify-center gap-2 rounded-lg bg-brand-emerald-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-emerald-600 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    {createdOrder ? "Lanjutkan Pembayaran" : "Buat Pesanan"}
                  </>
                )}
              </button>
            )}
          </div>

        </form>
      </FormProvider>

      {payment && createdOrder && (
        <PaymentModal
          isOpen={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
          orderId={createdOrder.id}
          snapToken={payment.snap_token || ""}
          snapJsUrl={payment.snap_js_url || ""}
          clientKey={payment.client_key || ""}
          redirectUrl={payment.redirect_url || undefined}
          amount={Number(payment.amount_idr || createdOrder.total_price_idr || 0)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
