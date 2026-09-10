import { cn } from "@/lib/utils";
import { AggregatorForm } from "./AggregatorForm";
import { AddressPicker } from "./AddressPicker";
import { FocusTrap } from "@/components/a11y/FocusTrap";
import { DisputeModal } from "@/components/orders/DisputeModal";
import {
  ArrowLeft,
  Share2,
  Download,
  AlertTriangle,
  Loader2,
  RefreshCw,
  X,
  CheckCircle2,
  Sparkles,
  Send,
  ImageIcon,
  FileSignature,
  Copy,
  Paperclip,
  MessageSquare,
  Navigation,
  Truck,
  MapPin,
  Phone,
  Calendar,
  Package,
  UtensilsCrossed,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
  Clock,
  Weight,
  Ruler,
  MapPinned,
  LocateFixed,
  CalendarDays,
  CalendarClock,
  CircleCheck,
  TriangleAlert,
  Info,
  Box,
  Building2,
  Check,
  Camera,
  Maximize,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Skeleton } from "@/components/ui/Skeleton";
import { createElement, useEffect } from "react";
import { getCustomerServiceIconForService } from "@/components/orders/serviceIcon";

type OnDemandOrderFormContentProps = {
  register: any;
  watch: any;
  setValue: any;
  getValues: any;
  reset: any;
  mode: any;
  onFormChange: any;
  onSubmit: any;
  calendarDays: any;
  calendarMonth: any;
  chargeableWeight: any;
  clearCustomerOrderDraft: any;
  copyReceiverLocationLink: any;
  draftRestoredAt: any;
  dropoff_address: any;
  dropoff_location: any;
  errors: any;
  formatDateLabel: any;
  has_insurance: any;
  isDatePickerOpen: any;
  isLoadingServices: any;
  isScanOpen: any;
  isTimePickerOpen: any;
  loadServices: any;
  onDemandServices: any;
  pickupTimeOptions: any;
  pickup_address: any;
  pickup_location: any;
  receiverLocationBusy: any;
  receiverLocationLink: any;
  receiverLocationMessage: any;
  scanRequired: any;
  schedule_type: any;
  scheduledDate: any;
  scheduledTime: any;
  selectedService: any;
  selectedTier: any;
  serviceLoadError: any;
  submitWithServiceRules: any;
  volumetricWeight: any;
  dimensions_scanned: any;
  api: any;
  config: any;
  setIsScanOpen: any;
  setCalendarMonth: any;
  pickScheduledDate: any;
  pickScheduledTime: any;
  setIsTimePickerOpen: any;
  formatDateValue: any;
  todayDate: any;
  setIsDatePickerOpen: any;
  setDraftRestoredAt: any;
  refreshReceiverLocationRequest: any;
  createReceiverLocationRequest: any;
  service_code: any;
  size_tier: any;
  DimensionScanModal: any;
};

export function OnDemandOrderFormContent({
  register,
  watch,
  setValue,
  getValues,
  reset,
  mode,
  onFormChange,
  onSubmit,
  calendarDays,
  calendarMonth,
  chargeableWeight,
  clearCustomerOrderDraft,
  copyReceiverLocationLink,
  draftRestoredAt,
  dropoff_address,
  dropoff_location,
  errors,
  formatDateLabel,
  has_insurance,
  isDatePickerOpen,
  isLoadingServices,
  isScanOpen,
  isTimePickerOpen,
  loadServices,
  onDemandServices,
  pickupTimeOptions,
  pickup_address,
  pickup_location,
  receiverLocationBusy,
  receiverLocationLink,
  receiverLocationMessage,
  scanRequired,
  schedule_type,
  scheduledDate,
  scheduledTime,
  selectedService,
  selectedTier,
  serviceLoadError,
  submitWithServiceRules,
  volumetricWeight,
  dimensions_scanned,
  api,
  config,
  setIsScanOpen,
  setCalendarMonth,
  pickScheduledDate,
  pickScheduledTime,
  setIsTimePickerOpen,
  formatDateValue,
  todayDate,
  setIsDatePickerOpen,
  setDraftRestoredAt,
  refreshReceiverLocationRequest,
  createReceiverLocationRequest,
  service_code,
  size_tier,
  DimensionScanModal,
}: OnDemandOrderFormContentProps) {
  useEffect(() => {
    if (!isDatePickerOpen && !isTimePickerOpen) return;
    const closePickersOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsDatePickerOpen(false);
      setIsTimePickerOpen(false);
    };
    document.addEventListener("keydown", closePickersOnEscape);
    return () => document.removeEventListener("keydown", closePickersOnEscape);
  }, [
    isDatePickerOpen,
    isTimePickerOpen,
    setIsDatePickerOpen,
    setIsTimePickerOpen,
  ]);

  const hasDimensionFieldError = Boolean(
    errors.package_details?.dimensions?.length ||
    errors.package_details?.dimensions?.width ||
    errors.package_details?.dimensions?.height,
  );
  const hasDimensionsScannedError = Boolean(
    (errors.package_details as any)?.dimensions_scanned,
  );
  const dimensionDescribedBy =
    [
      hasDimensionFieldError ? "ondemand-dimensions-error" : null,
      hasDimensionsScannedError ? "ondemand-dimensions-scanned-error" : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <>
      <form
        id="order-form"
        onSubmit={submitWithServiceRules}
        className="space-y-8"
      >
        <input type="hidden" {...register("service_code")} />
        <input type="hidden" {...register("size_tier")} />

        {draftRestoredAt && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
            <span>
              Draft pengiriman dipulihkan dari sesi browser pukul{" "}
              {new Date(draftRestoredAt).toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </span>
            <button
              type="button"
              onClick={() => {
                clearCustomerOrderDraft();
                setDraftRestoredAt(null);
              }}
              className="rounded-md border border-success/30 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-success/10"
            >
              Bersihkan Draft
            </button>
          </div>
        )}

        {mode === "instan" ? (
          <>
            <section className="space-y-4 rounded-xl border border-border bg-surface-subtle p-6 backdrop-blur-sm">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Box className="h-5 w-5 text-primary" aria-hidden="true" />
                Pilih Layanan
              </h2>

              {isLoadingServices ? (
                <div
                  className="space-y-2 rounded-lg border border-border bg-background/40 p-4"
                  aria-busy="true"
                  aria-label="Memuat layanan pengiriman"
                >
                  <Skeleton className="h-4 w-40 bg-surface-subtle" />
                  <Skeleton className="h-10 w-full bg-surface-subtle" />
                </div>
              ) : serviceLoadError ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning bg-warning-surface px-4 py-3 text-sm text-warning">
                  <span>{serviceLoadError}</span>
                  <button
                    type="button"
                    onClick={loadServices}
                    className="rounded-md border border-warning px-3 py-1.5 text-xs font-semibold hover:bg-warning-surface"
                  >
                    Coba Lagi
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {onDemandServices.map((service: any) => {
                    const selected = service.code === service_code;
                    const ServiceIcon = getCustomerServiceIconForService(service);
                    return (
                      <button
                        key={service.code}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setValue("service_code", service.code, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          if (service.size_tiers?.[0]) {
                            setValue("size_tier", service.size_tiers[0].code, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                          }
                          if (!service.requires_dimension_scan) {
                            setValue(
                              "package_details.dimensions_scanned",
                              false,
                              { shouldDirty: true, shouldValidate: true },
                            );
                          }
                        }}
                        className={[
                          "rounded-lg border p-4 text-left transition-all",
                          selected
                            ? "border-primary bg-primary/10 shadow-lg shadow-primary/5"
                            : "border-border bg-background/35 hover:bg-surface-subtle",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="mt-0.5 rounded-lg border border-border bg-surface-subtle p-2 text-primary" aria-hidden="true">
                              {createElement(ServiceIcon, { className: "h-5 w-5" })}
                            </span>
                            <div>
                            <p className="font-semibold text-foreground">
                              {service.name}
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={service.description}>
                              {service.description}
                            </p>
                            </div>
                          </div>
                          {selected && (
                            <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full border border-border px-2 py-1">
                            ETA maks. {Math.round(service.max_eta_minutes / 60)}{" "}
                            jam
                          </span>
                          {service.max_distance_km && (
                            <span className="rounded-full border border-border px-2 py-1">
                              Jarak {service.max_distance_km} km
                            </span>
                          )}
                          <span className="rounded-full border border-border px-2 py-1">
                            {service.requires_dimension_scan
                              ? "Wajib scan"
                              : "Size tier"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedService?.uses_size_tier &&
                selectedService.size_tiers.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      Ukuran Paket
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {selectedService.size_tiers.map((tier: any) => (
                        <button
                          key={tier.code}
                          type="button"
                          aria-pressed={size_tier === tier.code}
                          onClick={() =>
                            setValue("size_tier", tier.code, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                          className={[
                            "rounded-lg border px-3 py-3 text-left text-sm transition-colors",
                            size_tier === tier.code
                              ? "border-info bg-info-surface text-info"
                              : "border-border bg-background/40 hover:bg-surface-subtle",
                          ].join(" ")}
                        >
                          <span className="block font-medium">{tier.name}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {tier.description ||
                              `Maks. ${tier.max_weight_kg || "-"} kg`}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              {scanRequired && !dimensions_scanned && (
                <div className="rounded-lg border border-info bg-info-surface px-4 py-3 text-sm text-info">
                  {selectedService?.name || "Layanan ini"} membutuhkan scan
                  dimensi paket. Harga akan dihitung otomatis setelah scan
                  diterapkan ke form.
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="space-y-4 rounded-xl border border-border bg-surface-subtle p-6 backdrop-blur-sm">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Building2 className="h-5 w-5 text-info" aria-hidden="true" />
              Cek Ongkir Aggregator (3PL)
            </h2>
            <p className="text-xs text-muted-foreground">
              Bandingkan tarif dari JNE, J&T, SiCepat, dan AnterAja untuk
              pengiriman antar kota.
            </p>
            <AggregatorForm
              onProviderSelect={(provider, tariff, details) => {
                if (!details) return;
                setValue("service_code", `tembus_aggregator`, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                setValue("logistics_provider", details.provider_code, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                setValue("logistics_service_type", details.service_type, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                setValue("logistics_tariff_idr", details.tariff_idr, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                setValue("logistics_net_cost_idr", details.net_cost_idr, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                setValue("pickup_city", details.origin_city, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                setValue("dropoff_city", details.destination_city, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                // Sync weight from aggregator form to package details
                if (details.weight_kg && details.weight_kg > 0) {
                  setValue("package_details.weight_kg", details.weight_kg, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }
                // Auto-set defaults for required package details fields in aggregator mode
                setValue("package_details.category", "Paket", {
                  shouldDirty: true,
                });
                setValue(
                  "package_details.item_description",
                  `Pengiriman ${details.provider_code.toUpperCase()} — ${details.origin_city} → ${details.destination_city}`,
                  { shouldDirty: true },
                );
              }}
            />
          </section>
        )}

        {mode === "instan" && (
          <section className="space-y-4 rounded-xl border border-border bg-surface-subtle p-6 backdrop-blur-sm">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
              Detail Pengambilan (Pickup)
            </h2>
            <AddressPicker
              mode="pickup"
              address={pickup_address}
              location={pickup_location}
              setValue={setValue}
              error={errors.pickup_address?.message}
              locationError={(errors as any).pickup_location?.message}
            />
          </section>
        )}

        <section className="space-y-4 rounded-xl border border-border bg-surface-subtle p-6 backdrop-blur-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MapPin className="h-5 w-5 text-success" aria-hidden="true" />
            Detail Pengiriman (Dropoff)
          </h2>

          <AddressPicker
            mode="dropoff"
            address={dropoff_address}
            location={dropoff_location}
            setValue={setValue}
            error={errors.dropoff_address?.message}
            locationError={(errors as any).dropoff_location?.message}
          />

          <div className="rounded-xl border border-success/20 bg-success/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-success">
                  Minta lokasi dari penerima
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Buat link aman agar penerima mengisi alamat, titik lokasi,
                  catatan, dan kontak. Setelah terkirim, sistem menerapkan
                  dropoff otomatis tanpa input ulang.
                </p>
                {receiverLocationLink && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Status:{" "}
                    <span className="font-semibold text-foreground">
                      {receiverLocationLink.status === "submitted"
                        ? "Terisi"
                        : receiverLocationLink.status === "expired"
                          ? "Kedaluwarsa"
                          : "Menunggu penerima"}
                    </span>
                    {receiverLocationLink.expires_at
                      ? ` • aktif sampai ${formatDateLabel(receiverLocationLink.expires_at.slice(0, 10))}`
                      : ""}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={
                    receiverLocationLink
                      ? refreshReceiverLocationRequest
                      : createReceiverLocationRequest
                  }
                  disabled={receiverLocationBusy}
                  className="inline-flex items-center gap-2 rounded-lg bg-success px-3 py-2 text-xs font-bold text-on-success transition hover:bg-success disabled:opacity-60"
                >
                  {receiverLocationBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : receiverLocationLink ? (
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Navigation className="h-4 w-4" aria-hidden="true" />
                  )}
                  {receiverLocationLink ? "Sinkronkan" : "Buat link"}
                </button>
                {receiverLocationLink?.url && (
                  <button
                    type="button"
                    onClick={copyReceiverLocationLink}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground transition hover:bg-surface-subtle"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Salin
                  </button>
                )}
              </div>
            </div>
            {receiverLocationLink?.url && (
              <div className="mt-3 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                <span className="break-all">{receiverLocationLink.url}</span>
              </div>
            )}
            {receiverLocationMessage && (
              <p className="mt-3 rounded-lg bg-background/40 px-3 py-2 text-xs font-medium text-success">
                {receiverLocationMessage}
              </p>
            )}
            {receiverLocationLink?.submitted_address && (
              <div className="mt-3 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
                <p className="font-semibold">Alamat dari penerima</p>
                <p className="mt-1 leading-5">
                  {receiverLocationLink.submitted_address}
                </p>
                {receiverLocationLink.submitted_contact_name && (
                  <p className="mt-1 text-success">
                    Kontak: {receiverLocationLink.submitted_contact_name}
                    {receiverLocationLink.submitted_contact_phone_masked
                      ? ` • ${receiverLocationLink.submitted_contact_phone_masked}`
                      : ""}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
            <div>
              <label
                htmlFor="ondemand-recipient-name"
                className="mb-1 block text-sm font-medium text-muted-foreground"
              >
                Nama Penerima
              </label>
              <input
                {...register("recipient_name")}
                id="ondemand-recipient-name"
                data-testid="recipient-name-input"
                aria-invalid={errors.recipient_name ? "true" : "false"}
                aria-describedby={
                  errors.recipient_name
                    ? "ondemand-recipient-name-error"
                    : undefined
                }
                className="w-full rounded-lg border border-border bg-background/50 px-4 py-2.5 text-sm focus:border-success focus:outline-none focus:ring-1 focus:ring-focus-ring"
                placeholder="Mis: Budi Santoso"
              />
              {errors.recipient_name && (
                <p
                  id="ondemand-recipient-name-error"
                  className="mt-1 text-xs text-destructive"
                  role="alert"
                >
                  {errors.recipient_name.message}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="ondemand-recipient-phone"
                className="mb-1 block text-sm font-medium text-muted-foreground"
              >
                Nomor HP
              </label>
              <input
                {...register("recipient_phone")}
                id="ondemand-recipient-phone"
                onInput={(e: any) => {
                  e.currentTarget.value = e.currentTarget.value.replace(
                    /[^0-9+]/g,
                    "",
                  );
                }}
                data-testid="recipient-phone-input"
                type="tel"
                aria-invalid={errors.recipient_phone ? "true" : "false"}
                aria-describedby={
                  errors.recipient_phone
                    ? "ondemand-recipient-phone-error"
                    : undefined
                }
                className={`w-full rounded-lg border bg-background/50 px-4 py-2.5 text-sm focus:outline-none focus:ring-1 ${errors.recipient_phone ? "border-error focus:border-error focus:ring-error" : "border-border focus:border-success focus:ring-focus-ring"}`}
                placeholder="Mis: 08123456789"
              />
              {errors.recipient_phone && (
                <p
                  id="ondemand-recipient-phone-error"
                  className="mt-1 text-xs text-destructive"
                  role="alert"
                >
                  {errors.recipient_phone.message}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-surface-subtle p-6 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Box className="h-5 w-5 text-info" aria-hidden="true" />
              Detail Paket
            </h2>
            <button
              type="button"
              onClick={() => setIsScanOpen(true)}
              disabled={!scanRequired}
              className="flex items-center gap-1.5 rounded-md bg-info-surface px-3 py-1.5 text-xs font-medium text-info hover:bg-info-surface"
            >
              {dimensions_scanned ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {scanRequired
                ? dimensions_scanned
                  ? "Scan Selesai"
                  : "Wajib Scan"
                : "Scan Opsional"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {mode === "instan" ? (
              <>
                <div>
                  <label
                    htmlFor="ondemand-package-category"
                    className="mb-1 block text-sm font-medium text-muted-foreground"
                  >
                    Kategori Barang
                  </label>
                  <input
                    {...register("package_details.category")}
                    id="ondemand-package-category"
                    data-testid="package-category-input"
                    type="text"
                    aria-invalid={
                      errors.package_details?.category ? "true" : "false"
                    }
                    aria-describedby={
                      errors.package_details?.category
                        ? "ondemand-package-category-error"
                        : undefined
                    }
                    className="w-full appearance-none rounded-lg border border-border bg-background/50 px-4 py-3 text-sm focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
                    placeholder="Isi kategori sesuai barang sebenarnya"
                  />
                  {errors.package_details?.category && (
                    <p
                      id="ondemand-package-category-error"
                      className="mt-1 text-xs text-destructive"
                      role="alert"
                    >
                      {errors.package_details.category.message}
                    </p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="ondemand-package-quantity"
                    className="mb-1 block text-sm font-medium text-muted-foreground"
                  >
                    Jumlah Paket/Barang
                  </label>
                  <input
                    {...register("package_details.quantity", {
                      setValueAs: (v: any) => (v === "" ? 1 : Number(v)),
                    })}
                    id="ondemand-package-quantity"
                    data-testid="package-quantity-input"
                    type="number"
                    min={1}
                    max={100}
                    aria-invalid={
                      errors.package_details?.quantity ? "true" : "false"
                    }
                    aria-describedby={
                      errors.package_details?.quantity
                        ? "ondemand-package-quantity-error"
                        : undefined
                    }
                    className="w-full rounded-lg border border-border bg-background/50 px-4 py-3 text-sm focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
                  />
                  {errors.package_details?.quantity && (
                    <p
                      id="ondemand-package-quantity-error"
                      className="mt-1 text-xs text-destructive"
                      role="alert"
                    >
                      {errors.package_details.quantity.message}
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label
                    htmlFor="ondemand-package-description"
                    className="mb-1 block text-sm font-medium text-muted-foreground"
                  >
                    Detail Barang
                  </label>
                  <textarea
                    {...register("package_details.item_description")}
                    id="ondemand-package-description"
                    data-testid="package-item-description-input"
                    className="w-full appearance-none rounded-lg border border-border bg-background/50 px-4 py-3 text-sm focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
                    placeholder="Contoh: Dokumen Kependudukan, Kamera DSLR Hitam"
                    rows={2}
                    aria-invalid={
                      errors.package_details?.item_description
                        ? "true"
                        : "false"
                    }
                    aria-describedby={
                      errors.package_details?.item_description
                        ? "ondemand-package-description-error"
                        : undefined
                    }
                  />
                  {errors.package_details?.item_description && (
                    <p
                      id="ondemand-package-description-error"
                      className="mt-1 text-xs text-destructive"
                      role="alert"
                    >
                      {errors.package_details.item_description.message}
                    </p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="ondemand-vehicle-type"
                    className="mb-1 block text-sm font-medium text-muted-foreground"
                  >
                    Volume (Pilihan Kendaraan)
                  </label>
                  <select
                    {...register("package_details.vehicle_type")}
                    id="ondemand-vehicle-type"
                    data-testid="package-vehicle-type-select"
                    aria-invalid={
                      errors.package_details?.vehicle_type ? "true" : "false"
                    }
                    aria-describedby={
                      errors.package_details?.vehicle_type
                        ? "ondemand-vehicle-type-error"
                        : undefined
                    }
                    className="w-full appearance-none rounded-lg border border-border bg-background/50 px-4 py-2.5 text-sm focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
                  >
                    <option value="Motor">Motor</option>
                    <option value="Mobil">Mobil</option>
                    <option value="Truk">Truk</option>
                  </select>
                  {errors.package_details?.vehicle_type && (
                    <p
                      id="ondemand-vehicle-type-error"
                      className="mt-1 text-xs text-destructive"
                      role="alert"
                    >
                      {errors.package_details.vehicle_type.message}
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-lg border border-border bg-background/30 px-4 py-3 text-sm">
                    <input
                      type="checkbox"
                      {...register("package_details.is_fragile")}
                      className="h-4 w-4 rounded border-border bg-background"
                    />
                    <span>
                      <b>Barang rapuh</b>
                      <span className="block text-xs text-muted-foreground">
                        Kurir akan menangani paket dengan perhatian ekstra.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-error bg-error-surface px-4 py-3 text-sm">
                    <input
                      type="checkbox"
                      {...register("package_details.is_prohibited")}
                      className="h-4 w-4 rounded border-border bg-background"
                    />
                    <span>
                      <b>Barang terlarang</b>
                      <span className="block text-xs text-muted-foreground">
                        Paket terlarang akan ditolak saat validasi.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-border bg-background/30 px-4 py-3 text-sm">
                    <input
                      type="checkbox"
                      {...register("package_details.requires_delivery_code")}
                      className="h-4 w-4 rounded border-border bg-background"
                    />
                    <span>
                      <b>Kode terima paket</b>
                      <span className="block text-xs text-muted-foreground">
                        Penerima wajib memberikan kode saat paket diterima.
                      </span>
                    </span>
                  </label>
                </div>
                <div>
                  <label
                    htmlFor="ondemand-package-weight"
                    className="mb-1 block text-sm font-medium text-muted-foreground"
                  >
                    Berat Aktual (kg)
                  </label>
                  <input
                    {...register("package_details.weight_kg", {
                      setValueAs: (v: any) => (v === "" ? "" : Number(v)),
                    })}
                    id="ondemand-package-weight"
                    data-testid="package-weight-input"
                    type="number"
                    step="0.1"
                    aria-invalid={
                      errors.package_details?.weight_kg ? "true" : "false"
                    }
                    aria-describedby={
                      errors.package_details?.weight_kg
                        ? "ondemand-package-weight-error"
                        : undefined
                    }
                    className="w-full rounded-lg border border-border bg-background/50 px-4 py-2.5 text-sm focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
                  />
                  {errors.package_details?.weight_kg && (
                    <p
                      id="ondemand-package-weight-error"
                      className="mt-1 text-xs text-destructive"
                      role="alert"
                    >
                      {errors.package_details.weight_kg.message}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="sm:col-span-2 rounded-lg border border-info bg-info-surface px-4 py-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-info">
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                  Informasi Paket (Aggregator)
                </p>
                <p className="mt-1 text-muted-foreground">
                  Berat paket sudah diatur dari hasil cek tarif. Kategori dan
                  deskripsi barang otomatis terisi.
                </p>
              </div>
            )}
          </div>

          {mode === "instan" && (
            <>
              <div>
                <label className="mb-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  Dimensi Paket (cm){" "}
                  <Maximize className="h-3.5 w-3.5" aria-hidden="true" />
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <input
                    id="ondemand-dimension-length"
                    aria-label="Panjang paket dalam sentimeter"
                    aria-invalid={
                      hasDimensionFieldError || hasDimensionsScannedError
                        ? "true"
                        : "false"
                    }
                    aria-describedby={dimensionDescribedBy}
                    {...register("package_details.dimensions.length", {
                      setValueAs: (v: any) => (v === "" ? "" : Number(v)),
                    })}
                    type="number"
                    placeholder="P"
                    readOnly
                    onClick={() => scanRequired && setIsScanOpen(true)}
                    className="w-full cursor-pointer rounded-lg border border-border bg-background/30 px-4 py-2 text-center text-sm text-muted-foreground focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
                  />
                  <input
                    id="ondemand-dimension-width"
                    aria-label="Lebar paket dalam sentimeter"
                    aria-invalid={
                      hasDimensionFieldError || hasDimensionsScannedError
                        ? "true"
                        : "false"
                    }
                    aria-describedby={dimensionDescribedBy}
                    {...register("package_details.dimensions.width", {
                      setValueAs: (v: any) => (v === "" ? "" : Number(v)),
                    })}
                    type="number"
                    placeholder="L"
                    readOnly
                    onClick={() => scanRequired && setIsScanOpen(true)}
                    className="w-full cursor-pointer rounded-lg border border-border bg-background/30 px-4 py-2 text-center text-sm text-muted-foreground focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
                  />
                  <input
                    id="ondemand-dimension-height"
                    aria-label="Tinggi paket dalam sentimeter"
                    aria-invalid={
                      hasDimensionFieldError || hasDimensionsScannedError
                        ? "true"
                        : "false"
                    }
                    aria-describedby={dimensionDescribedBy}
                    {...register("package_details.dimensions.height", {
                      setValueAs: (v: any) => (v === "" ? "" : Number(v)),
                    })}
                    type="number"
                    placeholder="T"
                    readOnly
                    onClick={() => scanRequired && setIsScanOpen(true)}
                    className="w-full cursor-pointer rounded-lg border border-border bg-background/30 px-4 py-2 text-center text-sm text-muted-foreground focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
                  />
                </div>
                {(errors.package_details?.dimensions?.length ||
                  errors.package_details?.dimensions?.width ||
                  errors.package_details?.dimensions?.height) && (
                  <p
                    id="ondemand-dimensions-error"
                    className="mt-1 text-xs text-destructive"
                    role="alert"
                  >
                    {errors.package_details.dimensions.length?.message ||
                      errors.package_details.dimensions.width?.message ||
                      errors.package_details.dimensions.height?.message}
                  </p>
                )}
                {(errors.package_details as any)?.dimensions_scanned && (
                  <p
                    id="ondemand-dimensions-scanned-error"
                    className="mt-1 text-xs text-destructive"
                    role="alert"
                  >
                    {(errors.package_details as any).dimensions_scanned.message}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {scanRequired
                    ? "Dimensi dikunci dari hasil scan webcam. Klik kolom dimensi atau tombol Wajib Scan untuk memindai ulang."
                    : `Untuk ${selectedService?.name || "layanan ini"}, biaya memakai tier ukuran ${selectedTier?.name || "yang dipilih"} dan berat aktual.`}
                </p>
                <div
                  className={`mt-3 rounded-lg border px-4 py-3 text-xs ${dimensions_scanned || !scanRequired ? "border-info bg-info-surface text-info" : "border-warning bg-warning-surface text-warning"}`}
                >
                  {dimensions_scanned ? (
                    <>
                      Berat yang dihitung:{" "}
                      <b>{chargeableWeight.toFixed(2)} kg</b>. Berat volumetrik{" "}
                      <b>{volumetricWeight.toFixed(2)} kg</b> memakai divisor
                      6000.
                    </>
                  ) : !scanRequired ? (
                    <>
                      Scan dimensi tidak diwajibkan untuk layanan ini. Untuk
                      win-win, kurir tetap bisa verifikasi saat pickup jika
                      paket jauh melebihi tier yang dipilih.
                    </>
                  ) : (
                    <>
                      Scan dimensi wajib dilakukan sebelum sistem menghitung
                      biaya dan membuka pembayaran.
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="mt-4 rounded-lg border border-warning bg-warning-surface p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                {...register("has_insurance")}
                className="mt-1 h-4 w-4 rounded border-border bg-background"
              />
              <div>
                <p className="text-sm font-medium text-warning">
                  Gunakan Asuransi Pengiriman
                </p>
                <p className="text-xs text-muted-foreground">
                  Lindungi barang berharga Anda. Premi{" "}
                  {((config?.insurance_premium_rate || 0.002) * 100).toFixed(1)}
                  % dari nilai barang.
                </p>
              </div>
            </label>
            {has_insurance && (
              <div className="ml-7 mt-3">
                <label
                  htmlFor="ondemand-item-value"
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  Nilai Barang (Rp)
                </label>
                <input
                  {...register("item_value", {
                    setValueAs: (v: any) => (v === "" ? "" : Number(v)),
                  })}
                  id="ondemand-item-value"
                  type="number"
                  placeholder="Mis: 1000000"
                  aria-invalid={errors.item_value ? "true" : "false"}
                  aria-describedby={
                    errors.item_value ? "ondemand-item-value-error" : undefined
                  }
                  className="w-full rounded-lg border border-border bg-background/50 px-4 py-2 text-sm"
                />
                {errors.item_value && (
                  <p
                    id="ondemand-item-value-error"
                    className="mt-1 text-xs text-destructive"
                    role="alert"
                  >
                    {errors.item_value.message}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="ondemand-schedule-type"
                className="mb-1 block text-sm font-medium text-muted-foreground"
              >
                Jadwal
              </label>
              <select
                {...register("schedule_type")}
                id="ondemand-schedule-type"
                className="w-full rounded-lg border border-border bg-background/50 px-4 py-3 text-sm focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
              >
                <option value="now">Segera</option>
                <option value="scheduled">Terjadwal</option>
              </select>
            </div>
            {schedule_type === "scheduled" && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-muted-foreground">
                  Waktu Pickup
                </label>
                <input type="hidden" {...register("scheduled_at")} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <span
                      id="ondemand-scheduled-date-label"
                      className="mb-1 block text-xs font-medium text-muted-foreground"
                    >
                      Tanggal
                    </span>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setIsDatePickerOpen((open: any) => !open)
                        }
                        aria-label="Pilih tanggal pickup" title="Pilih tanggal pickup"
                        aria-haspopup="dialog"
                        aria-expanded={isDatePickerOpen}
                        aria-controls="ondemand-scheduled-date-picker"
                        aria-describedby={
                          errors.scheduled_at
                            ? "ondemand-scheduled-at-error"
                            : undefined
                        }
                        className="flex w-full items-center justify-between rounded-lg border border-border bg-background/50 px-4 py-2.5 text-left text-sm focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
                      >
                        <span
                          className={
                            scheduledDate
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }
                        >
                          {formatDateLabel(scheduledDate)}
                        </span>
                        <CalendarDays
                          className="h-4 w-4 text-info"
                          aria-hidden="true"
                        />
                      </button>

                      {isDatePickerOpen && (
                        <FocusTrap active={isDatePickerOpen} className="absolute z-30 mt-2 w-80">
                        <div
                          id="ondemand-scheduled-date-picker"
                          role="dialog"
                          aria-label="Pilih tanggal pickup"
                          className="w-full rounded-xl border border-border bg-surface-raised p-4 shadow-2xl shadow-scrim"
                        >
                          <div className="mb-3 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() =>
                                setCalendarMonth(
                                  new Date(
                                    calendarMonth.getFullYear(),
                                    calendarMonth.getMonth() - 1,
                                    1,
                                  ),
                                )
                              }
                              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-subtle"
                            >
                              Sebelumnya
                            </button>
                            <div className="text-sm font-semibold text-foreground">
                              {calendarMonth.toLocaleDateString("id-ID", {
                                month: "long",
                                year: "numeric",
                              })}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setCalendarMonth(
                                  new Date(
                                    calendarMonth.getFullYear(),
                                    calendarMonth.getMonth() + 1,
                                    1,
                                  ),
                                )
                              }
                              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-subtle"
                            >
                              Berikutnya
                            </button>
                          </div>

                          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase text-muted-foreground">
                            {[
                              "Min",
                              "Sen",
                              "Sel",
                              "Rab",
                              "Kam",
                              "Jum",
                              "Sab",
                            ].map((day: any) => (
                              <div key={day} className="py-1">
                                {day}
                              </div>
                            ))}
                          </div>

                          <div className="mt-1 grid grid-cols-7 gap-1">
                            {calendarDays.map((date: any) => {
                              const value = formatDateValue(date);
                              const isCurrentMonth =
                                date.getMonth() === calendarMonth.getMonth();
                              const isPast = value < todayDate;
                              const isSelected = value === scheduledDate;

                              return (
                                <button
                                  key={value}
                                  type="button"
                                  disabled={isPast}
                                  onClick={() => pickScheduledDate(date)}
                                  aria-label={date.toLocaleDateString("id-ID", {
                                    dateStyle: "full",
                                  })}
                                  aria-current={isSelected ? "date" : undefined}
                                  className={[
                                    "aspect-square rounded-lg text-sm transition-colors",
                                    isSelected
                                      ? "bg-info text-on-info"
                                      : "hover:bg-surface-subtle",
                                    isCurrentMonth
                                      ? "text-foreground"
                                      : "text-muted-foreground/40",
                                    isPast
                                      ? "cursor-not-allowed opacity-60 hover:bg-transparent"
                                      : "",
                                  ].join(" ")}
                                >
                                  {date.getDate()}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        </FocusTrap>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">
                      Jam
                    </span>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setIsTimePickerOpen((open: any) => !open)
                        }
                        aria-label="Pilih jam pickup" title="Pilih jam pickup"
                        aria-haspopup="listbox"
                        aria-expanded={isTimePickerOpen}
                        aria-controls="ondemand-scheduled-time-picker"
                        aria-describedby={
                          errors.scheduled_at
                            ? "ondemand-scheduled-at-error"
                            : undefined
                        }
                        className="flex w-full items-center justify-between rounded-lg border border-border bg-background/50 px-4 py-2.5 text-left text-sm focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
                      >
                        <span
                          className={
                            scheduledTime
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }
                        >
                          {scheduledTime || "Pilih jam"}
                        </span>
                        <Clock
                          className="h-4 w-4 text-info"
                          aria-hidden="true"
                        />
                      </button>

                      {isTimePickerOpen && (
                        <FocusTrap active={isTimePickerOpen} className="absolute right-0 z-30 mt-2 max-h-72 w-56">
                        <div
                          id="ondemand-scheduled-time-picker"
                          role="listbox"
                          aria-label="Pilih jam pickup"
                          className="max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-surface-raised p-2 shadow-2xl shadow-scrim"
                        >
                          <div className="grid grid-cols-2 gap-1">
                            {pickupTimeOptions.map((time: any) => (
                              <button
                                key={time}
                                type="button"
                                role="option"
                                aria-selected={scheduledTime === time}
                                onClick={() => pickScheduledTime(time)}
                                className={[
                                  "rounded-lg px-3 py-2 text-sm transition-colors",
                                  scheduledTime === time
                                    ? "bg-info text-on-info"
                                    : "text-foreground hover:bg-surface-subtle",
                                ].join(" ")}
                              >
                                {time}
                              </button>
                            ))}
                          </div>
                        </div>
                        </FocusTrap>
                      )}
                    </div>
                  </div>
                </div>
                {errors.scheduled_at && (
                  <p
                    id="ondemand-scheduled-at-error"
                    className="text-xs text-destructive"
                    role="alert"
                  >
                    {errors.scheduled_at.message}
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="ondemand-customer-notes"
              className="mb-1 block text-sm font-medium text-muted-foreground"
            >
              Catatan untuk Kurir
            </label>
            <textarea
              {...register("customer_notes")}
              id="ondemand-customer-notes"
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-background/50 px-4 py-3 text-sm focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
              placeholder="Tinggalkan di pos satpam, barang fragile, dll."
              maxLength={200}
            />
          </div>
        </section>
      </form>

      <DimensionScanModal
        isOpen={isScanOpen}
        onClose={() => setIsScanOpen(false)}
        onApply={(scan: any) => {
          setValue("package_details.dimensions.length", scan.length, {
            shouldDirty: true,
            shouldValidate: true,
          });
          setValue("package_details.dimensions.width", scan.width, {
            shouldDirty: true,
            shouldValidate: true,
          });
          setValue("package_details.dimensions.height", scan.height, {
            shouldDirty: true,
            shouldValidate: true,
          });
          setValue("package_details.weight_kg", scan.weight_kg, {
            shouldDirty: true,
            shouldValidate: true,
          });
          setValue("package_details.dimensions_scanned", true, {
            shouldDirty: true,
            shouldValidate: true,
          });
        }}
      />
    </>
  );
}
