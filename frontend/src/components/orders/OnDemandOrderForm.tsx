"use client";
import { AggregatorForm } from "./AggregatorForm";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, UseFormSetValue } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { api } from "@/lib/api";
import { useRuntimeConfig, RuntimeConfig } from "@/hooks/useRuntimeConfig";


import {
  Box, Building2, Check, MapPin, Navigation, Plus, Search, Sparkles, Camera, CalendarDays, Copy, Info, Loader2, Maximize, RefreshCw, Clock, X, Zap
} from "lucide-react";



import { 
  OrderFormValues, DeliveryService, clearCustomerOrderDraft, OrderFormProps, createOrderSchema, CustomerOrderDraftPayload, 
  buildSafeOrderDraftForm, buildSafeReceiverLocationDraft, 
  parseCustomerOrderDraft, mergeDraftWithCurrentValues, 
  CUSTOMER_ORDER_DRAFT_KEY, LEGACY_CUSTOMER_ORDER_DRAFT_KEY,
  CUSTOMER_ORDER_DRAFT_TTL_MS, RECEIVER_LOCATION_STORAGE_KEY,
  RECEIVER_LOCATION_POLL_MS, LocationValue, ReceiverLocationLink
} from "./OrderSchemas";
import { AddressPicker, pad2, formatDateValue, formatDateLabel, buildCalendarDays, pickupTimeOptions } from "./AddressPicker";
function DimensionScanModal({
  isOpen,
  onClose,
  onApply,
}: {
  isOpen: boolean;
  onClose: () => void;
  onApply: (dimensions: { length: number; width: number; height: number; weight_kg: number }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "ready" | "blocked">("idle");
  const [scanState, setScanState] = useState<"idle" | "scanning" | "done">("idle");
  const [cameraMessage, setCameraMessage] = useState("Menyiapkan kamera...");
  const [result, setResult] = useState<{ length: number; width: number; height: number; weight_kg: number } | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("blocked");
      setCameraMessage("Browser tidak mendukung akses kamera.");
      return;
    }

    setCameraState("starting");
    setCameraMessage("Menyiapkan kamera...");
    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraState("ready");
      setCameraMessage("Kamera aktif. Jika layar tetap gelap, coba tutup dan buka scan lagi.");
    } catch {
      setCameraState("blocked");
      setCameraMessage("Kamera tidak tersedia atau sedang dipakai aplikasi lain.");
    }
  }, [stopCamera]);

  useEffect(() => {
    if (!isOpen) return;

    void startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  if (!isOpen) return null;

  const runScan = () => {
    setScanState("scanning");
    window.setTimeout(() => {
      setResult(null);
      setScanState("done");
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} aria-label="Tutup modal scan" />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-background/95 shadow-2xl">
        <div className="flex items-start justify-between border-b border-white/10 p-5">
          <div>
            <h3 className="text-lg font-semibold">Scan Dimensi via Webcam</h3>
            <p className="mt-1 text-sm text-muted-foreground">Letakkan paket dan kartu referensi di area kamera. Hasil bisa dikoreksi manual setelah diterapkan.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[1.2fr_.8fr]">
          <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={(event) => {
                void event.currentTarget.play().catch(() => undefined);
              }}
              className={`h-full w-full object-cover transition-opacity duration-300 ${cameraState === "ready" ? "opacity-100 brightness-110 contrast-110" : "opacity-0"}`}
            />
            {cameraState !== "ready" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black text-sm text-muted-foreground">
                {cameraState === "starting" ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-8 w-8" />}
                <span>{cameraMessage}</span>
                {cameraState === "blocked" && (
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    className="rounded-md bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500/90"
                  >
                    Coba Kamera Lagi
                  </button>
                )}
              </div>
            )}
            <div className="pointer-events-none absolute inset-[14%] rounded-xl border-2 border-dashed border-emerald-400/70" />
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white">
              Align paket di kotak hijau
            </div>
            {cameraState === "ready" && (
              <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-200">
                Kamera aktif
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estimasi hasil</p>
              {result ? (
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>Panjang: <b>{result.length} cm</b></div>
                  <div>Lebar: <b>{result.width} cm</b></div>
                  <div>Tinggi: <b>{result.height} cm</b></div>
                  <div>Berat: <b>{result.weight_kg} kg</b></div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Hasil dimensi otomatis belum tersedia. Isi ukuran paket secara manual di form.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={runScan}
              disabled={scanState === "scanning"}
              className="w-full rounded-lg bg-indigo-500 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500/90 disabled:opacity-60"
            >
              {scanState === "scanning" ? "Menganalisis..." : scanState === "done" ? "Scan Ulang" : "Mulai Scan"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (result) {
                  onApply(result);
                  onClose();
                }
              }}
              disabled={!result}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold hover:bg-white/10"
            >
              Terapkan ke Form
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { OnDemandOrderFormContent } from './OnDemandOrderFormContent';
export function OnDemandOrderForm({ mode = 'instan', onFormChange, onSubmit }: OrderFormProps) {
  const { config } = useRuntimeConfig();
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [services, setServices] = useState<DeliveryService[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [serviceLoadError, setServiceLoadError] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [receiverLocationLink, setReceiverLocationLink] = useState<ReceiverLocationLink | null>(null);
    const [receiverLocationBusy, setReceiverLocationBusy] = useState(false);
    const [receiverLocationMessage, setReceiverLocationMessage] = useState<string | null>(null);

    const onDemandServices = useMemo(
      () => services.filter((s) => s.service_category !== "aggregator"),
      [services]
    );
    const aggregatorServices = useMemo(
      () => services.filter((s) => s.service_category === "aggregator"),
      [services]
    );
    const defaultAggregatorService = useMemo(
      () => aggregatorServices[0],
      [aggregatorServices]
    );

    const customZodResolver = async (data: any) => {
      const schema = createOrderSchema(config, mode);
      const result = schema.safeParse(data);
    if (result.success) {
      return { values: result.data, errors: {} };
    }

    const formErrors: Record<string, any> = {};
    result.error.issues.forEach((issue) => {
      const path = issue.path.join(".");
      if (!formErrors[path]) {
        formErrors[path] = { type: issue.code, message: issue.message };
      }
    });
    return { values: {}, errors: formErrors };
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    formState: { errors, isValid }
  } = useForm<OrderFormValues>({
    resolver: customZodResolver,
    mode: "onChange",
    defaultValues: {
      service_code: "",
      size_tier: "",
      pickup_address: "",
      dropoff_address: "",
      recipient_name: "",
      recipient_phone: "",
      schedule_type: "now",
      has_insurance: false,
      package_details: {
        category: "",
        weight_kg: 1,
        dimensions: { length: "" as any, width: "" as any, height: "" as any },
        dimensions_scanned: false
      }
    }
  });

  const service_code = watch("service_code");
  const size_tier = watch("size_tier");
  const pickup_address = watch("pickup_address");
  const pickup_location = watch("pickup_location");
  const dropoff_address = watch("dropoff_address");
  const dropoff_location = watch("dropoff_location");
  const category = watch("package_details.category");
  const weight_kg = watch("package_details.weight_kg");
  const length = watch("package_details.dimensions.length");
  const width = watch("package_details.dimensions.width");
  const height = watch("package_details.dimensions.height");
  const dimensions_scanned = watch("package_details.dimensions_scanned");
  const has_insurance = watch("has_insurance");
  const item_value = watch("item_value");
  const schedule_type = watch("schedule_type");
  const scheduled_at = watch("scheduled_at");
  const logistics_tariff_idr = watch("logistics_tariff_idr");
  const logistics_provider = watch("logistics_provider");
  const receiverLocationLinkRef = useRef<ReceiverLocationLink | null>(null);
  const receiverLocationPollInFlightRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null);

  const persistOrderDraft = useCallback((link: ReceiverLocationLink | null = receiverLocationLinkRef.current) => {
    if (typeof window === "undefined" || !draftHydratedRef.current) return;
    const savedAt = new Date();
    const expiresAt = new Date(savedAt.getTime() + CUSTOMER_ORDER_DRAFT_TTL_MS);
    try {
      window.sessionStorage.setItem(
        CUSTOMER_ORDER_DRAFT_KEY,
        JSON.stringify({
          version: 2,
          saved_at: savedAt.toISOString(),
          expires_at: expiresAt.toISOString(),
          form: buildSafeOrderDraftForm(getValues()),
          receiver_location_link: buildSafeReceiverLocationDraft(link)
        } satisfies CustomerOrderDraftPayload)
      );
    } catch {
      // Session draft is a convenience layer only. Form submission remains the source of truth.
    }
  }, [getValues]);

  useEffect(() => {
    if (typeof window === "undefined" || draftHydratedRef.current) return;
    draftHydratedRef.current = true;
    try {
      window.sessionStorage.removeItem(LEGACY_CUSTOMER_ORDER_DRAFT_KEY);
      const parsedDraft = parseCustomerOrderDraft(window.sessionStorage.getItem(CUSTOMER_ORDER_DRAFT_KEY));
      if (!parsedDraft) {
        window.sessionStorage.removeItem(CUSTOMER_ORDER_DRAFT_KEY);
        return;
      }
      reset(mergeDraftWithCurrentValues(getValues(), parsedDraft.form));
      setDraftRestoredAt(parsedDraft.saved_at);
      if (parsedDraft.receiver_location_link && typeof parsedDraft.receiver_location_link === "object") {
        const draftLink = parsedDraft.receiver_location_link as ReceiverLocationLink;
        if (draftLink.id && draftLink.expires_at && Date.parse(draftLink.expires_at) > Date.now()) {
          receiverLocationLinkRef.current = draftLink;
          setReceiverLocationLink(draftLink);
        }
      }
    } catch {
      clearCustomerOrderDraft();
    }
  }, [getValues, reset]);

  useEffect(() => {
    receiverLocationLinkRef.current = receiverLocationLink;
    persistOrderDraft(receiverLocationLink);
  }, [persistOrderDraft, receiverLocationLink]);

  useEffect(() => {
    const subscription = watch(() => {
      persistOrderDraft(receiverLocationLinkRef.current);
    });
    return () => subscription.unsubscribe();
  }, [persistOrderDraft, watch]);

  const volumetricWeight = useMemo(() => {
    const l = Number(length) || 0;
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    return l && w && h ? (l * w * h) / 6000 : 0;
  }, [length, width, height]);
  const chargeableWeight = Math.max(Number(weight_kg) || 0, volumetricWeight);
  const selectedService = useMemo(
    () => services.find((service) => service.code === service_code),
    [service_code, services]
  );
  const selectedTier = useMemo(
    () => selectedService?.size_tiers?.find((tier) => tier.code === size_tier) || selectedService?.size_tiers?.[0],
    [selectedService, size_tier]
  );
  const scanRequired = Boolean(selectedService?.requires_dimension_scan);
  const todayDate = formatDateValue(new Date());
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);

  const updateScheduledAt = (date: string, time: string) => {
    const value = date && time ? `${date}T${time}` : "";
    setValue("scheduled_at", value, { shouldDirty: true, shouldValidate: true });
  };

  const pickScheduledDate = (date: Date) => {
    const nextDate = formatDateValue(date);
    setScheduledDate(nextDate);
    updateScheduledAt(nextDate, scheduledTime);
    setIsDatePickerOpen(false);
  };

  const pickScheduledTime = (time: string) => {
    setScheduledTime(time);
    updateScheduledAt(scheduledDate, time);
    setIsTimePickerOpen(false);
  };

  const loadServices = useCallback(async () => {
    setIsLoadingServices(true);
    setServiceLoadError(null);
    try {
      const res = await api.get("/auth/web/delivery-services");
      const nextServices = res.data?.services || [];
      setServices(nextServices);
      const defaultService = nextServices.find((service: DeliveryService) => service.code === "tembus_instant") || nextServices[0];
      if (defaultService && !getValues("service_code")) {
        setValue("service_code", defaultService.code, { shouldDirty: true, shouldValidate: true });
        if (defaultService.size_tiers?.[0]) {
          setValue("size_tier", defaultService.size_tiers[0].code, { shouldDirty: true, shouldValidate: true });
        }
      }
      if (nextServices.length === 0) {
        setServiceLoadError("Belum ada layanan aktif di dashboard admin.");
      }
    } catch {
      setServices([]);
      setServiceLoadError("Layanan belum bisa dimuat. Coba muat ulang.");
    } finally {
      setIsLoadingServices(false);
    }
  }, [getValues, setValue]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  useEffect(() => {
    if (selectedService?.size_tiers?.length && !selectedService.size_tiers.find((tier) => tier.code === size_tier)) {
      setValue("size_tier", selectedService.size_tiers[0].code, { shouldDirty: true, shouldValidate: true });
    }
  }, [selectedService, setValue, size_tier]);

  useEffect(() => {
    const isAggregator = service_code === 'tembus_aggregator';
    const isServiceValid = isAggregator ? true : Boolean(selectedService);
    onFormChange(getValues(), isValid && isServiceValid && (!scanRequired || Boolean(dimensions_scanned)), {
      selectedService,
      scanRequired
    });
  }, [
    service_code,
    size_tier,
    pickup_address,
    pickup_location?.lat,
    pickup_location?.lng,
    dropoff_address,
    dropoff_location?.lat,
    dropoff_location?.lng,
    category,
    weight_kg,
    length,
    width,
    height,
    dimensions_scanned,
    has_insurance,
    item_value,
    schedule_type,
    scheduled_at,
    logistics_tariff_idr,
    logistics_provider,
    isValid,
    selectedService,
    scanRequired,
    getValues,
    onFormChange
  ]);

  const submitWithServiceRules = handleSubmit((data) => {
    if (scanRequired && !data.package_details.dimensions_scanned) {
      setIsScanOpen(true);
      return;
    }
    onSubmit(data);
  });

  const applyReceiverLocation = useCallback((link: ReceiverLocationLink) => {
    const lat = Number(link.submitted_lat);
    const lng = Number(link.submitted_lng);
    if (link.status !== "submitted" || !link.submitted_address || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return false;
    }

    setValue("dropoff_address", link.submitted_address, { shouldDirty: true, shouldValidate: true });
    setValue("dropoff_location", { lat, lng }, { shouldDirty: true, shouldValidate: true });
    if (link.submitted_contact_name) {
      setValue("recipient_name", link.submitted_contact_name, { shouldDirty: true, shouldValidate: true });
    }
    if (link.submitted_notes) {
      const currentNotes = getValues("customer_notes");
      setValue("customer_notes", currentNotes ? currentNotes : link.submitted_notes, { shouldDirty: true, shouldValidate: true });
    }
    const currentLink = receiverLocationLinkRef.current;
    persistOrderDraft(currentLink ? { ...currentLink, ...link } : link);
    return true;
  }, [getValues, persistOrderDraft, setValue]);

  const createReceiverLocationRequest = useCallback(async () => {
    if (!pickup_address || pickup_address.trim().length < 5) {
      setReceiverLocationMessage("Lengkapi alamat pickup sebelum membuat link lokasi penerima.");
      return;
    }

    setReceiverLocationBusy(true);
    setReceiverLocationMessage(null);
    try {
      const response = await api.post("/customer/location-requests", {
        pickup_address,
        pickup_location,
        recipient_name: getValues("recipient_name") || null,
        recipient_phone: getValues("recipient_phone") || null,
        expires_hours: 24
      });
      const link = response.data?.data as ReceiverLocationLink;
      setReceiverLocationLink(link);
      setReceiverLocationMessage("Link lokasi dibuat. Bagikan ke penerima. Jawaban akan masuk otomatis tanpa refresh.");
    } catch (error: any) {
      setReceiverLocationMessage(error?.response?.data?.message || "Link lokasi belum bisa dibuat.");
    } finally {
      setReceiverLocationBusy(false);
    }
  }, [getValues, pickup_address, pickup_location]);

  const syncReceiverLocationRequest = useCallback(async (options: { silent?: boolean } = {}) => {
    const currentLink = receiverLocationLinkRef.current;
    if (!currentLink?.id) {
      setReceiverLocationMessage("Buat link lokasi penerima terlebih dahulu.");
      return false;
    }
    if (receiverLocationPollInFlightRef.current) {
      return false;
    }

    receiverLocationPollInFlightRef.current = true;
    if (!options.silent) {
      setReceiverLocationBusy(true);
      setReceiverLocationMessage(null);
    }
    try {
      const response = await api.get(`/customer/location-requests/${currentLink.id}`);
      const link = response.data?.data as ReceiverLocationLink;
      const mergedLink = { ...link, url: currentLink.url || link.url };
      setReceiverLocationLink(mergedLink);
      if (applyReceiverLocation(mergedLink)) {
        setReceiverLocationMessage(options.silent ? "Alamat penerima masuk otomatis ke detail pengiriman." : "Lokasi penerima sudah diterapkan ke detail pengiriman.");
        return true;
      } else if (link.status === "expired") {
        if (!options.silent) {
          setReceiverLocationMessage("Link sudah kedaluwarsa. Buat link baru jika penerima belum mengisi.");
        }
      } else if (!options.silent) {
        setReceiverLocationMessage("Penerima belum mengirim lokasi. Cek kembali setelah mereka selesai mengisi.");
      }
      return false;
    } catch (error: any) {
      if (!options.silent) {
        setReceiverLocationMessage(error?.response?.data?.message || "Status lokasi penerima belum bisa dicek.");
      }
      return false;
    } finally {
      receiverLocationPollInFlightRef.current = false;
      if (!options.silent) {
        setReceiverLocationBusy(false);
      }
    }
  }, [applyReceiverLocation]);

  const refreshReceiverLocationRequest = useCallback(async () => {
    await syncReceiverLocationRequest({ silent: false });
  }, [syncReceiverLocationRequest]);

  useEffect(() => {
    if (!receiverLocationLink?.id || receiverLocationLink.status !== "pending") return;

    const pollReceiverLocation = () => {
      void syncReceiverLocationRequest({ silent: true });
    };
    const handleVisibilitySync = () => {
      if (document.visibilityState === "visible") {
        pollReceiverLocation();
      }
    };
    const intervalId = window.setInterval(pollReceiverLocation, RECEIVER_LOCATION_POLL_MS);
    window.addEventListener("focus", pollReceiverLocation);
    document.addEventListener("visibilitychange", handleVisibilitySync);
    pollReceiverLocation();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", pollReceiverLocation);
      document.removeEventListener("visibilitychange", handleVisibilitySync);
    };
  }, [receiverLocationLink?.id, receiverLocationLink?.status, syncReceiverLocationRequest]);

  useEffect(() => {
    if (!receiverLocationLink?.url) return;
    const receiverToken = receiverLocationLink.url.split("/").filter(Boolean).pop();
    if (!receiverToken) return;

    const handleReceiverLocationSignal = (event: StorageEvent) => {
      if (event.key !== RECEIVER_LOCATION_STORAGE_KEY || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue);
        if (payload?.token === receiverToken) {
          void syncReceiverLocationRequest({ silent: true });
        }
      } catch {
        // Ignore malformed cross-tab messages.
      }
    };

    window.addEventListener("storage", handleReceiverLocationSignal);
    return () => window.removeEventListener("storage", handleReceiverLocationSignal);
  }, [receiverLocationLink?.url, syncReceiverLocationRequest]);

  const copyReceiverLocationLink = useCallback(async () => {
    const url = receiverLocationLink?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setReceiverLocationMessage("Link lokasi disalin.");
    } catch {
      setReceiverLocationMessage("Browser belum mengizinkan salin otomatis. Salin link dari kolom di bawah.");
    }
  }, [receiverLocationLink?.url]);

  return (
    <OnDemandOrderFormContent
      register={register}
      watch={watch}
      setValue={setValue}
      getValues={getValues}
      reset={reset}
      mode={mode}
      onFormChange={onFormChange}
      onSubmit={onSubmit}
      calendarDays={calendarDays}
      calendarMonth={calendarMonth}
      chargeableWeight={chargeableWeight}
      clearCustomerOrderDraft={clearCustomerOrderDraft}
      copyReceiverLocationLink={copyReceiverLocationLink}
      draftRestoredAt={draftRestoredAt}
      dropoff_address={dropoff_address}
      dropoff_location={dropoff_location}
      errors={errors}
      formatDateLabel={formatDateLabel}
      has_insurance={has_insurance}
      isDatePickerOpen={isDatePickerOpen}
      isLoadingServices={isLoadingServices}
      isScanOpen={isScanOpen}
      isTimePickerOpen={isTimePickerOpen}
      loadServices={loadServices}
      onDemandServices={onDemandServices}
      pickupTimeOptions={pickupTimeOptions}
      pickup_address={pickup_address}
      pickup_location={pickup_location}
      receiverLocationBusy={receiverLocationBusy}
      receiverLocationLink={receiverLocationLink}
      receiverLocationMessage={receiverLocationMessage}
      scanRequired={scanRequired}
      schedule_type={schedule_type}
      scheduledDate={scheduledDate}
      scheduledTime={scheduledTime}
      selectedService={selectedService}
      selectedTier={selectedTier}
      serviceLoadError={serviceLoadError}
      submitWithServiceRules={submitWithServiceRules}
      volumetricWeight={volumetricWeight}
      dimensions_scanned={dimensions_scanned}
      api={api}
      config={config}
      setIsScanOpen={setIsScanOpen}
      setCalendarMonth={setCalendarMonth}
      pickScheduledDate={pickScheduledDate}
      pickScheduledTime={pickScheduledTime}
      setIsTimePickerOpen={setIsTimePickerOpen}
      formatDateValue={formatDateValue}
      todayDate={todayDate}
      setIsDatePickerOpen={setIsDatePickerOpen}
      setDraftRestoredAt={setDraftRestoredAt}
      refreshReceiverLocationRequest={refreshReceiverLocationRequest}
      createReceiverLocationRequest={createReceiverLocationRequest}
      service_code={service_code}
      size_tier={size_tier}
      DimensionScanModal={DimensionScanModal}
    />
  );
}
