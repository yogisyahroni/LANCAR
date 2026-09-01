import { cn } from '@/lib/utils';
import { AggregatorForm } from './AggregatorForm';
import { AddressPicker } from './AddressPicker';
import { DisputeModal } from '@/components/orders/DisputeModal';
import { ArrowLeft, Share2, Download, AlertTriangle, Loader2, RefreshCw, X, CheckCircle2, Sparkles, Send, ImageIcon, FileSignature, Copy, Paperclip, MessageSquare, Navigation, Truck, MapPin, Phone, Calendar, Package, UtensilsCrossed, Plus, Minus, ChevronDown, ChevronUp, Clock, Weight, Ruler, MapPinned, LocateFixed, CalendarDays, CalendarClock, CircleCheck, TriangleAlert, Info, Box, Building2, Check, Camera, Maximize } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/Skeleton';

type OnDemandOrderFormContentProps = {
  register: any,
  watch: any,
  setValue: any,
  getValues: any,
  reset: any,
  mode: any,
  onFormChange: any,
  onSubmit: any,
  calendarDays: any,
  calendarMonth: any,
  chargeableWeight: any,
  clearCustomerOrderDraft: any,
  copyReceiverLocationLink: any,
  draftRestoredAt: any,
  dropoff_address: any,
  dropoff_location: any,
  errors: any,
  formatDateLabel: any,
  has_insurance: any,
  isDatePickerOpen: any,
  isLoadingServices: any,
  isScanOpen: any,
  isTimePickerOpen: any,
  loadServices: any,
  onDemandServices: any,
  pickupTimeOptions: any,
  pickup_address: any,
  pickup_location: any,
  receiverLocationBusy: any,
  receiverLocationLink: any,
  receiverLocationMessage: any,
  scanRequired: any,
  schedule_type: any,
  scheduledDate: any,
  scheduledTime: any,
  selectedService: any,
  selectedTier: any,
  serviceLoadError: any,
  submitWithServiceRules: any,
  volumetricWeight: any,
  dimensions_scanned: any,
  api: any,
  config: any,
  setIsScanOpen: any,
  setCalendarMonth: any,
  pickScheduledDate: any,
  pickScheduledTime: any,
  setIsTimePickerOpen: any,
  formatDateValue: any,
  todayDate: any,
  setIsDatePickerOpen: any,
  setDraftRestoredAt: any,
  refreshReceiverLocationRequest: any,
  createReceiverLocationRequest: any,
  service_code: any,
  size_tier: any,
  DimensionScanModal: any
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
  DimensionScanModal
}: OnDemandOrderFormContentProps) {
  return (
    <>
      <form id="order-form" onSubmit={submitWithServiceRules} className="space-y-8">
        <input type="hidden" {...register("service_code")} />
        <input type="hidden" {...register("size_tier")} />

        {draftRestoredAt && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-emerald-400/20 bg-brand-emerald-500/10 px-4 py-3 text-sm text-brand-emerald-50">
                    <span>
                      Draft pengiriman dipulihkan dari sesi browser pukul {new Date(draftRestoredAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        clearCustomerOrderDraft();
                        setDraftRestoredAt(null);
                      }}
                      className="rounded-md border border-brand-emerald-200/30 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-brand-emerald-200/10"
                    >
                      Bersihkan Draft
                    </button>
                  </div>
                )}

                {mode === "instan" ? (
                  <>
                <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                  <h3 className="flex items-center gap-2 text-lg font-semibold">
                    <Box className="h-5 w-5 text-primary" />
                    Pilih Layanan
                  </h3>

          {isLoadingServices ? (
            <div className="space-y-2 rounded-lg border border-white/10 bg-background/40 p-4" aria-busy="true" aria-label="Memuat layanan pengiriman">
              <Skeleton className="h-4 w-40 bg-white/10" />
              <Skeleton className="h-10 w-full bg-white/10" />
            </div>
          ) : serviceLoadError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <span>{serviceLoadError}</span>
              <button
                type="button"
                onClick={loadServices}
                className="rounded-md border border-amber-300/30 px-3 py-1.5 text-xs font-semibold hover:bg-amber-300/10"
              >
                Coba Lagi
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {onDemandServices.map((service: any) => {
                const selected = service.code === service_code;
                return (
                  <button
                    key={service.code}
                    type="button"
                    onClick={() => {
                      setValue("service_code", service.code, { shouldDirty: true, shouldValidate: true });
                      if (service.size_tiers?.[0]) {
                        setValue("size_tier", service.size_tiers[0].code, { shouldDirty: true, shouldValidate: true });
                      }
                      if (!service.requires_dimension_scan) {
                        setValue("package_details.dimensions_scanned", false, { shouldDirty: true, shouldValidate: true });
                      }
                    }}
                    className={[
                      "rounded-lg border p-4 text-left transition-all",
                      selected ? "border-primary bg-primary/10 shadow-lg shadow-primary/5" : "border-white/10 bg-background/35 hover:bg-white/5"
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{service.name}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{service.description}</p>
                      </div>
                      {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span className="rounded-full border border-white/10 px-2 py-1">ETA maks. {Math.round(service.max_eta_minutes / 60)} jam</span>
                      {service.max_distance_km && <span className="rounded-full border border-white/10 px-2 py-1">Jarak {service.max_distance_km} km</span>}
                      <span className="rounded-full border border-white/10 px-2 py-1">{service.requires_dimension_scan ? "Wajib scan" : "Size tier"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedService?.uses_size_tier && selectedService.size_tiers.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Ukuran Paket</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {selectedService.size_tiers.map((tier: any) => (
                  <button
                    key={tier.code}
                    type="button"
                    onClick={() => setValue("size_tier", tier.code, { shouldDirty: true, shouldValidate: true })}
                    className={[
                      "rounded-lg border px-3 py-3 text-left text-sm transition-colors",
                      size_tier === tier.code ? "border-indigo-400 bg-indigo-500/10 text-indigo-100" : "border-white/10 bg-background/40 hover:bg-white/5"
                    ].join(" ")}
                  >
                    <span className="block font-medium">{tier.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{tier.description || `Maks. ${tier.max_weight_kg || "-"} kg`}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {scanRequired && !dimensions_scanned && (
            <div className="rounded-lg border border-indigo-400/20 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100">
              {selectedService?.name || "Layanan ini"} membutuhkan scan dimensi paket. Harga akan dihitung otomatis setelah scan diterapkan ke form.
            </div>
          )}
        </section>

                  </>
                ) : (
                  <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                    <h3 className="flex items-center gap-2 text-lg font-semibold">
                      <Building2 className="h-5 w-5 text-indigo-400" />
                      Cek Ongkir Aggregator (3PL)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Bandingkan tarif dari JNE, J&T, SiCepat, dan AnterAja untuk pengiriman antar kota.
                    </p>
                    <AggregatorForm
                      onProviderSelect={(provider, tariff, details) => {
                        if (!details) return;
                        setValue("service_code", `tembus_aggregator`, { shouldDirty: true, shouldValidate: true });
                        setValue("logistics_provider", details.provider_code, { shouldDirty: true, shouldValidate: true });
                        setValue("logistics_service_type", details.service_type, { shouldDirty: true, shouldValidate: true });
                        setValue("logistics_tariff_idr", details.tariff_idr, { shouldDirty: true, shouldValidate: true });
                        setValue("logistics_net_cost_idr", details.net_cost_idr, { shouldDirty: true, shouldValidate: true });
                        setValue("pickup_city", details.origin_city, { shouldDirty: true, shouldValidate: true });
                        setValue("dropoff_city", details.destination_city, { shouldDirty: true, shouldValidate: true });
                        // Sync weight from aggregator form to package details
                        if (details.weight_kg && details.weight_kg > 0) {
                          setValue("package_details.weight_kg", details.weight_kg, { shouldDirty: true, shouldValidate: true });
                        }
                        // Auto-set defaults for required package details fields in aggregator mode
                        setValue("package_details.category", "Paket", { shouldDirty: true });
                        setValue("package_details.item_description", `Pengiriman ${details.provider_code.toUpperCase()} — ${details.origin_city} → ${details.destination_city}`, { shouldDirty: true });
                      }}
                    />
                  </section>
                )}

                {mode === 'instan' && (
                <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                  <h3 className="flex items-center gap-2 text-lg font-semibold">
                    <MapPin className="h-5 w-5 text-primary" />
                    Detail Pengambilan (Pickup)
                  </h3>
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

        <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <MapPin className="h-5 w-5 text-brand-emerald-500" />
            Detail Pengiriman (Dropoff)
          </h3>

          <AddressPicker
            mode="dropoff"
            address={dropoff_address}
            location={dropoff_location}
            setValue={setValue}
            error={errors.dropoff_address?.message}
            locationError={(errors as any).dropoff_location?.message}
          />

          <div className="rounded-xl border border-brand-emerald-500/20 bg-brand-emerald-500/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-brand-emerald-300">Minta lokasi dari penerima</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Buat link aman agar penerima mengisi alamat, titik lokasi, catatan, dan kontak. Setelah terkirim, sistem menerapkan dropoff otomatis tanpa input ulang.
                </p>
                {receiverLocationLink && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Status: <span className="font-semibold text-foreground">{receiverLocationLink.status === "submitted" ? "Terisi" : receiverLocationLink.status === "expired" ? "Kedaluwarsa" : "Menunggu penerima"}</span>
                    {receiverLocationLink.expires_at ? ` • aktif sampai ${formatDateLabel(receiverLocationLink.expires_at.slice(0, 10))}` : ""}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={receiverLocationLink ? refreshReceiverLocationRequest : createReceiverLocationRequest}
                  disabled={receiverLocationBusy}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-emerald-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-emerald-400 disabled:opacity-60"
                >
                  {receiverLocationBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : receiverLocationLink ? <RefreshCw className="h-4 w-4" /> : <Navigation className="h-4 w-4" />}
                  {receiverLocationLink ? "Sinkronkan" : "Buat link"}
                </button>
                {receiverLocationLink?.url && (
                  <button
                    type="button"
                    onClick={copyReceiverLocationLink}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-foreground transition hover:bg-white/10"
                  >
                    <Copy className="h-4 w-4" />
                    Salin
                  </button>
                )}
              </div>
            </div>
            {receiverLocationLink?.url && (
              <div className="mt-3 rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                <span className="break-all">{receiverLocationLink.url}</span>
              </div>
            )}
            {receiverLocationMessage && (
              <p className="mt-3 rounded-lg bg-background/40 px-3 py-2 text-xs font-medium text-brand-emerald-100">{receiverLocationMessage}</p>
            )}
            {receiverLocationLink?.submitted_address && (
              <div className="mt-3 rounded-lg border border-brand-emerald-400/20 bg-brand-emerald-400/10 px-3 py-2 text-xs text-brand-emerald-50">
                <p className="font-semibold">Alamat dari penerima</p>
                <p className="mt-1 leading-5">{receiverLocationLink.submitted_address}</p>
                {receiverLocationLink.submitted_contact_name && <p className="mt-1 text-brand-emerald-100">Kontak: {receiverLocationLink.submitted_contact_name}{receiverLocationLink.submitted_contact_phone_masked ? ` • ${receiverLocationLink.submitted_contact_phone_masked}` : ""}</p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Nama Penerima</label>
              <input
                {...register("recipient_name")}
                data-testid="recipient-name-input"
                className="w-full rounded-lg border border-white/10 bg-background/50 px-4 py-2.5 text-sm focus:border-brand-emerald-500 focus:outline-none focus:ring-1 focus:ring-brand-emerald-500"
                placeholder="Mis: Budi Santoso"
              />
              {errors.recipient_name && <p className="mt-1 text-xs text-destructive">{errors.recipient_name.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Nomor HP</label>
              <input
                {...register("recipient_phone")}
                onInput={(e: any) => {
                  e.currentTarget.value = e.currentTarget.value.replace(/[^0-9+]/g, '');
                }}
                data-testid="recipient-phone-input"
                type="tel"
                className={`w-full rounded-lg border bg-background/50 px-4 py-2.5 text-sm focus:outline-none focus:ring-1 ${errors.recipient_phone ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-white/10 focus:border-brand-emerald-500 focus:ring-brand-emerald-500'}`}
                placeholder="Mis: 08123456789"
              />
              {errors.recipient_phone && <p className="mt-1 text-xs text-destructive">{errors.recipient_phone.message}</p>}
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Box className="h-5 w-5 text-indigo-400" />
              Detail Paket
            </h3>
            <button
              type="button"
              onClick={() => setIsScanOpen(true)}
              disabled={!scanRequired}
              className="flex items-center gap-1.5 rounded-md bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-500/20"
            >
              {dimensions_scanned ? <Check className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
              {scanRequired ? (dimensions_scanned ? "Scan Selesai" : "Wajib Scan") : "Scan Opsional"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {mode === "instan" ? (
              <>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Kategori Barang</label>
              <input
                {...register("package_details.category")}
                data-testid="package-category-input"
                type="text"
                className="w-full appearance-none rounded-lg border border-white/10 bg-background/50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                placeholder="Isi kategori sesuai barang sebenarnya"
              />
              {errors.package_details?.category && <p className="mt-1 text-xs text-destructive">{errors.package_details.category.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Detail Barang</label>
              <textarea
                {...register("package_details.item_description")}
                data-testid="package-item-description-input"
                className="w-full appearance-none rounded-lg border border-white/10 bg-background/50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                placeholder="Contoh: Dokumen Kependudukan, Kamera DSLR Hitam"
                rows={2}
              />
              {errors.package_details?.item_description && <p className="mt-1 text-xs text-destructive">{errors.package_details.item_description.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Volume (Pilihan Kendaraan)</label>
              <select
                {...register("package_details.vehicle_type")}
                data-testid="package-vehicle-type-select"
                className="w-full appearance-none rounded-lg border border-white/10 bg-background/50 px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="Motor">Motor 🏍️</option>
                <option value="Mobil">Mobil 🚗</option>
                <option value="Truk">Truk 🚚</option>
              </select>
              {errors.package_details?.vehicle_type && <p className="mt-1 text-xs text-destructive">{errors.package_details.vehicle_type.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Berat Aktual (kg)</label>
              <input
                {...register("package_details.weight_kg", { setValueAs: (v: any) => v === "" ? "" : Number(v) })}
                data-testid="package-weight-input"
                type="number"
                step="0.1"
                className="w-full rounded-lg border border-white/10 bg-background/50 px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              {errors.package_details?.weight_kg && <p className="mt-1 text-xs text-destructive">{errors.package_details.weight_kg.message}</p>}
            </div>
            </>
            ) : (
              <div className="sm:col-span-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-indigo-300">
                  <Building2 className="h-4 w-4" />
                  Informasi Paket (Aggregator)
                </p>
                <p className="mt-1 text-muted-foreground">
                  Berat paket sudah diatur dari hasil cek tarif. Kategori dan deskripsi barang otomatis terisi.
                </p>
              </div>
            )}
          </div>

          {mode === "instan" && (
          <>
          <div>
            <label className="mb-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              Dimensi Paket (cm) <Maximize className="h-3.5 w-3.5" />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <input {...register("package_details.dimensions.length", { setValueAs: (v: any) => v === "" ? "" : Number(v) })} type="number" placeholder="P" readOnly onClick={() => scanRequired && setIsScanOpen(true)} className="w-full cursor-pointer rounded-lg border border-white/10 bg-background/30 px-4 py-2 text-center text-sm text-muted-foreground focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              <input {...register("package_details.dimensions.width", { setValueAs: (v: any) => v === "" ? "" : Number(v) })} type="number" placeholder="L" readOnly onClick={() => scanRequired && setIsScanOpen(true)} className="w-full cursor-pointer rounded-lg border border-white/10 bg-background/30 px-4 py-2 text-center text-sm text-muted-foreground focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              <input {...register("package_details.dimensions.height", { setValueAs: (v: any) => v === "" ? "" : Number(v) })} type="number" placeholder="T" readOnly onClick={() => scanRequired && setIsScanOpen(true)} className="w-full cursor-pointer rounded-lg border border-white/10 bg-background/30 px-4 py-2 text-center text-sm text-muted-foreground focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
            {(errors.package_details?.dimensions?.length || errors.package_details?.dimensions?.width || errors.package_details?.dimensions?.height) && (
              <p className="mt-1 text-xs text-destructive">
                {errors.package_details.dimensions.length?.message || errors.package_details.dimensions.width?.message || errors.package_details.dimensions.height?.message}
              </p>
            )}
            {(errors.package_details as any)?.dimensions_scanned && (
              <p className="mt-1 text-xs text-destructive">{(errors.package_details as any).dimensions_scanned.message}</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {scanRequired
                ? "Dimensi dikunci dari hasil scan webcam. Klik kolom dimensi atau tombol Wajib Scan untuk memindai ulang."
                : `Untuk ${selectedService?.name || "layanan ini"}, biaya memakai tier ukuran ${selectedTier?.name || "yang dipilih"} dan berat aktual.`}
            </p>
            <div className={`mt-3 rounded-lg border px-4 py-3 text-xs ${dimensions_scanned || !scanRequired ? "border-indigo-400/20 bg-indigo-500/10 text-indigo-100" : "border-amber-500/30 bg-amber-500/10 text-amber-100"}`}>
              {dimensions_scanned ? (
                <>Berat yang dihitung: <b>{chargeableWeight.toFixed(2)} kg</b>. Berat volumetrik <b>{volumetricWeight.toFixed(2)} kg</b> memakai divisor 6000.</>
              ) : !scanRequired ? (
                <>Scan dimensi tidak diwajibkan untuk layanan ini. Untuk win-win, kurir tetap bisa verifikasi saat pickup jika paket jauh melebihi tier yang dipilih.</>
              ) : (
                <>Scan dimensi wajib dilakukan sebelum sistem menghitung biaya dan membuka pembayaran.</>
              )}
            </div>
          </div>
          </>
          )}

          <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <label className="flex items-start gap-3">
              <input type="checkbox" {...register("has_insurance")} className="mt-1 h-4 w-4 rounded border-white/10 bg-background" />
              <div>
                <p className="text-sm font-medium text-amber-500">Gunakan Asuransi Pengiriman</p>
                <p className="text-xs text-muted-foreground">
                  Lindungi barang berharga Anda. Premi {((config?.insurance_premium_rate || 0.002) * 100).toFixed(1)}% dari nilai barang.
                </p>
              </div>
            </label>
            {has_insurance && (
              <div className="ml-7 mt-3">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Nilai Barang (Rp)</label>
                <input
                  {...register("item_value", { setValueAs: (v: any) => v === "" ? "" : Number(v) })}
                  type="number"
                  placeholder="Mis: 1000000"
                  className="w-full rounded-lg border border-white/10 bg-background/50 px-4 py-2 text-sm"
                />
                {errors.item_value && <p className="mt-1 text-xs text-destructive">{errors.item_value.message}</p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Jadwal</label>
              <select
                {...register("schedule_type")}
                className="w-full rounded-lg border border-white/10 bg-background/50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="now">Segera</option>
                <option value="scheduled">Terjadwal</option>
              </select>
            </div>
            {schedule_type === "scheduled" && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-muted-foreground">Waktu Pickup</label>
                <input type="hidden" {...register("scheduled_at")} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">Tanggal</span>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsDatePickerOpen((open: any) => !open)}
                        className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-background/50 px-4 py-2.5 text-left text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      >
                        <span className={scheduledDate ? "text-foreground" : "text-muted-foreground"}>
                          {formatDateLabel(scheduledDate)}
                        </span>
                        <CalendarDays className="h-4 w-4 text-indigo-300" />
                      </button>

                      {isDatePickerOpen && (
                        <div className="absolute z-30 mt-2 w-80 rounded-xl border border-white/10 bg-[#121216] p-4 shadow-2xl shadow-black/40">
                          <div className="mb-3 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                              className="rounded-md border border-white/10 px-3 py-1.5 text-sm hover:bg-white/10"
                            >
                              Sebelumnya
                            </button>
                            <div className="text-sm font-semibold text-foreground">
                              {calendarMonth.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
                            </div>
                            <button
                              type="button"
                              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                              className="rounded-md border border-white/10 px-3 py-1.5 text-sm hover:bg-white/10"
                            >
                              Berikutnya
                            </button>
                          </div>

                          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-muted-foreground">
                            {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day: any) => (
                              <div key={day} className="py-1">{day}</div>
                            ))}
                          </div>

                          <div className="mt-1 grid grid-cols-7 gap-1">
                            {calendarDays.map((date: any) => {
                              const value = formatDateValue(date);
                              const isCurrentMonth = date.getMonth() === calendarMonth.getMonth();
                              const isPast = value < todayDate;
                              const isSelected = value === scheduledDate;

                              return (
                                <button
                                  key={value}
                                  type="button"
                                  disabled={isPast}
                                  onClick={() => pickScheduledDate(date)}
                                  className={[
                                    "aspect-square rounded-lg text-sm transition-colors",
                                    isSelected ? "bg-indigo-500 text-white" : "hover:bg-white/10",
                                    isCurrentMonth ? "text-foreground" : "text-muted-foreground/40",
                                    isPast ? "cursor-not-allowed opacity-30 hover:bg-transparent" : ""
                                  ].join(" ")}
                                >
                                  {date.getDate()}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">Jam</span>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsTimePickerOpen((open: any) => !open)}
                        className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-background/50 px-4 py-2.5 text-left text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      >
                        <span className={scheduledTime ? "text-foreground" : "text-muted-foreground"}>
                          {scheduledTime || "Pilih jam"}
                        </span>
                        <Clock className="h-4 w-4 text-indigo-300" />
                      </button>

                      {isTimePickerOpen && (
                        <div className="absolute right-0 z-30 mt-2 max-h-72 w-56 overflow-y-auto rounded-xl border border-white/10 bg-[#121216] p-2 shadow-2xl shadow-black/40">
                          <div className="grid grid-cols-2 gap-1">
                            {pickupTimeOptions.map((time: any) => (
                              <button
                                key={time}
                                type="button"
                                onClick={() => pickScheduledTime(time)}
                                className={[
                                  "rounded-lg px-3 py-2 text-sm transition-colors",
                                  scheduledTime === time ? "bg-indigo-500 text-white" : "text-foreground hover:bg-white/10"
                                ].join(" ")}
                              >
                                {time}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {errors.scheduled_at && <p className="text-xs text-destructive">{errors.scheduled_at.message}</p>}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">Catatan untuk Kurir</label>
            <textarea
              {...register("customer_notes")}
              rows={3}
              className="w-full resize-none rounded-lg border border-white/10 bg-background/50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
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
          setValue("package_details.dimensions.length", scan.length, { shouldDirty: true, shouldValidate: true });
          setValue("package_details.dimensions.width", scan.width, { shouldDirty: true, shouldValidate: true });
          setValue("package_details.dimensions.height", scan.height, { shouldDirty: true, shouldValidate: true });
          setValue("package_details.weight_kg", scan.weight_kg, { shouldDirty: true, shouldValidate: true });
          setValue("package_details.dimensions_scanned", true, { shouldDirty: true, shouldValidate: true });
        }}
      />
    </>
  );
}
