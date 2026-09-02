"use client";

import React, { useState, useEffect } from "react";
import { api } from "@/lib/api";
import {
  Loader2, MapPin, ArrowRight, Check, Info, TrendingDown,
  Package, Truck, ChevronRight, Plus, Navigation, X, Store
} from "lucide-react";
import {
  AggregatorCarrierQuote,
  capabilityLabel,
  normalizeAggregatorCarrierQuote,
} from "@/lib/aggregatorQuotePresentation";
import {
  isLogisticsProviderAvailable,
  providerAvailabilityMessage,
} from "@/types/logistics";
import type { LogisticsProviderOption } from "@/types/logistics";

// ─── Types ────────────────────────────────────────────────────────
interface CityOption {
  code: string;
  name: string;
  type: "origin" | "destination" | "both";
}

type TariffOption = AggregatorCarrierQuote & { weight_kg: number };

interface PickupAddress {
  shopName: string;
  picName: string;
  phone: string;
  city: string;
  address: string;
  lat?: number;
  lng?: number;
}

interface AggregatorFormProps {
  onProviderSelect?: (provider: string, tariff: number, details: {
    provider_code: string;
    service_type: string;
    tariff_idr: number;
    net_cost_idr?: number;
    origin_city: string;
    destination_city: string;
    weight_kg: number;
    volume_cm3?: number;
    pickup_address_full?: string;
    pickup_lat?: number;
    pickup_lng?: number;
  }) => void;
}

type ProviderOption = LogisticsProviderOption;

// ─── Constants ─────────────────────────────────────────────────────
// ─── Helpers ────────────────────────────────────────────────────────
function formatPrice(price: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0
  }).format(price);
}

function calcVolumeCm3(l: number, w: number, h: number): number {
  return Math.max(0, l * w * h);
}

function getVehicleRec(volumeCm3: number, weightKg: number): { icon: string; label: string; color: string } {
  if (weightKg > 30 || volumeCm3 > 500000) return { icon: "🚛", label: "Truk Besar",  color: "text-red-400" };
  if (weightKg > 10 || volumeCm3 > 150000) return { icon: "📦", label: "Pickup/Van",  color: "text-orange-400" };
  if (weightKg > 5  || volumeCm3 > 50000)  return { icon: "🏍️", label: "Motor Box",   color: "text-yellow-400" };
  return { icon: "🛵", label: "Motor", color: "text-green-400" };
}

// ─── AddressModal (Tambah Alamat like Mengantar) ───────────────────
function AddressModal({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (addr: PickupAddress) => void;
}) {
  const [form, setForm] = useState<PickupAddress>({
    shopName: "", picName: "", phone: "", city: "", address: ""
  });
  const [isLocating, setIsLocating] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);

  const useMyLocation = async () => {
    if (!navigator.geolocation) {
      setLocMsg("Browser tidak mendukung geolokasi.");
      return;
    }
    setIsLocating(true);
    setLocMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const res = await api.get("/maps/reverse-geocode", {
            params: { latitude: lat, longitude: lng, scope: "web_customer" },
          });
          const result = res.data?.result;
          const addr = result?.display_label || result?.label || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          const city = result?.city || "";
          const postcode = result?.postal_code || "";
          setForm((prev) => ({
            ...prev,
            address: addr,
            city: city + (postcode ? `, ${postcode}` : ""),
            lat,
            lng,
          }));
        } catch {
          setForm((prev) => ({
            ...prev,
            address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            lat,
            lng,
          }));
        }
        setIsLocating(false);
      },
      () => {
        setLocMsg("Izin lokasi ditolak.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Tutup"
      />
      <div className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#13131a] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <Store className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Tambah Alamat</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[80vh] overflow-y-auto px-5 py-4 space-y-4">
          {/* Nama Toko */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
              Nama Toko
            </label>
            <input
              value={form.shopName}
              onChange={(e) => setForm((p) => ({ ...p, shopName: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Masukkan nama toko atau nama penjual"
            />
          </div>

          {/* Nama PJ + HP */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Nama Penanggung Jawab
              </label>
              <input
                value={form.picName}
                onChange={(e) => setForm((p) => ({ ...p, picName: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Nama penanggung jawab penjemputan"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Nomor HP
              </label>
              <input
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value.replace(/[^0-9+]/g, '') }))}
                type="tel"
                className={`w-full rounded-lg border bg-background/60 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 ${form.phone && !/^(08|628|\+628)[0-9]{8,11}$/.test(form.phone) ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-white/10 focus:border-primary focus:ring-primary'}`}
                placeholder="Nomor HP"
              />
            </div>
          </div>

          {/* Provinsi/Kota/Kecamatan/Kelurahan/Kode Pos */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
              Provinsi / Kota / Kecamatan / Kelurahan / Kode Pos
            </label>
            <input
              value={form.city}
              onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Masukkan nama kota / kecamatan"
            />
          </div>

          {/* Alamat */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-muted-foreground">Alamat</label>
              <button
                type="button"
                onClick={useMyLocation}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {isLocating
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Navigation className="h-3 w-3" />}
                Gunakan Lokasi Saya
              </button>
            </div>
            <textarea
              value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              placeholder="Contoh: Jalan Merpati No 123 RT 01 RW 01"
            />
            {locMsg && (
              <p className="mt-1 text-xs text-amber-400">{locMsg}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={() => {
              if (!form.address.trim()) return;
              onSave(form);
              onClose();
            }}
            disabled={!form.address.trim()}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            Simpan Alamat
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────
export function AggregatorForm({ onProviderSelect }: AggregatorFormProps) {
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [originCode, setOriginCode] = useState("");
  const [destCode, setDestCode] = useState("");
  const [weight, setWeight] = useState(1);
  const [lengthCm, setLengthCm] = useState(0);
  const [widthCm, setWidthCm] = useState(0);
  const [heightCm, setHeightCm] = useState(0);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [tariffs, setTariffs] = useState<TariffOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // ─── Pickup address state ─────────────────────────────────────────
  const [pickupAddress, setPickupAddress] = useState<PickupAddress | null>(null);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);

  const volumeCm3 = calcVolumeCm3(lengthCm, widthCm, heightCm);
  const vehicleRec = getVehicleRec(volumeCm3, weight);
  const selectedProvider = providers.find(p => p.code === selectedProviderId);

  useEffect(() => {
    let active = true;
    api.get("/logistics/providers").then((res) => {
      const data = res.data?.providers;
      if (!active) return;
      if (!Array.isArray(data) || data.length === 0 || data.some((provider) => !provider?.code || !provider?.name)) {
        setProviderError("Daftar provider belum tersedia dari server.");
        return;
      }
      setProviders(data as ProviderOption[]);
      setProviderError(null);
    }).catch(() => {
      if (active) setProviderError("Daftar provider tidak dapat dimuat. Coba lagi setelah layanan aktif.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setCities([]);
    setOriginCode("");
    setDestCode("");
    setLocationError(null);
    if (!selectedProviderId) return;

    api.get("/logistics/locations", { params: { provider: selectedProviderId } }).then((res) => {
      const data = res.data?.data || res.data;
      if (!Array.isArray(data) || data.length === 0 || data.some((city) => !city?.code || !city?.name)) {
        setLocationError("Data area provider belum tersedia dari server.");
        return;
      }
      setCities(data);
    }).catch(() => setLocationError("Data area provider tidak dapat dimuat. Lengkapi mapping provider atau coba lagi."));
  }, [selectedProviderId]);

  useEffect(() => {
    if (!originCode || !destCode || !weight || !selectedProviderId) {
      setTariffs([]);
      setSelectedIndex(null);
      setError(null);
      return;
    }

    let isMounted = true;
    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      setSelectedIndex(null);

      try {
        const res = await api.get("/logistics/check-tariff", {
          params: {
            provider: selectedProviderId,
            origin_code: originCode,
            destination_code: destCode,
            weight_kg: weight,
            length_cm: lengthCm || undefined,
            width_cm: widthCm || undefined,
            height_cm: heightCm || undefined,
          } as any,
        });
        const quoteResponse = res.data?.data || {};
        const raw = quoteResponse.services || res.data?.tariffs || [];
        const items = Array.isArray(raw) ? raw : [raw];

        const provider = providers.find(p => p.code === selectedProviderId);
        const allTariffs: TariffOption[] = items
          .map((item: any) => normalizeAggregatorCarrierQuote(
            { ...item, source: item.source || quoteResponse.source },
            { provider: selectedProviderId, provider_name: provider?.name || selectedProviderId },
            weight,
            provider?.capabilities || [],
          ))
          .filter((quote): quote is AggregatorCarrierQuote => quote !== null)
          .map((quote) => ({ ...quote, weight_kg: weight }));

        allTariffs.sort((a, b) => a.price - b.price);

        if (isMounted) {
          if (allTariffs.length === 0) {
            setError(`Layanan ${selectedProviderId.toUpperCase()} belum tersedia untuk rute ini.`);
          }
          setTariffs(allTariffs);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(
            err.response?.data?.error ||
            err.response?.data?.message ||
            `Tarif ${selectedProviderId.toUpperCase()} belum tersedia untuk rute ini. API mungkin belum terhubung.`
          );
          setTariffs([]);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }, 500);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [originCode, destCode, weight, lengthCm, widthCm, heightCm, selectedProviderId]);

  const selectTariff = (index: number) => {
    setSelectedIndex(index);
    const tariff = tariffs[index];
    if (tariff && onProviderSelect) {
      const originCityName = cities.find(c => c.code === originCode)?.name || originCode;
      const destCityName = cities.find(c => c.code === destCode)?.name || destCode;
      const pickupFull = pickupAddress
        ? `Toko: ${pickupAddress.shopName || "-"}, PIC: ${pickupAddress.picName || "-"}, HP: ${pickupAddress.phone || "-"} | ${pickupAddress.city} | ${pickupAddress.address}`
        : undefined;
      onProviderSelect(tariff.provider, tariff.price, {
        provider_code: tariff.provider,
        service_type: tariff.service,
        tariff_idr: tariff.price,
        ...(tariff.net_price ? { net_cost_idr: tariff.net_price } : {}),
        origin_city: originCityName,
        destination_city: destCityName,
        weight_kg: tariff.weight_kg,
        volume_cm3: volumeCm3 > 0 ? volumeCm3 : undefined,
        pickup_address_full: pickupFull,
        pickup_lat: pickupAddress?.lat,
        pickup_lng: pickupAddress?.lng,
      });
    }
  };

  return (
    <div className="space-y-6">

      {/* STEP 1 — Pilih Ekspedisi */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-bold text-indigo-300">1</span>
          <label className="text-sm font-semibold text-foreground">Pilih Ekspedisi</label>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {providers.map((provider) => (
            <button
              key={provider.code}
              type="button"
              onClick={() => {
                if (!isLogisticsProviderAvailable(provider)) return;
                setSelectedProviderId(provider.code);
                setTariffs([]);
                setSelectedIndex(null);
              }}
              disabled={!isLogisticsProviderAvailable(provider)}
              aria-disabled={!isLogisticsProviderAvailable(provider)}
              className={[
                "rounded-xl border-2 px-3 py-3.5 text-center transition-all duration-150",
                selectedProviderId === provider.code
                  ? "border-indigo-400 bg-indigo-400/10 shadow-lg scale-[1.02]"
                  : "border-white/10 bg-background/40 hover:border-white/20 hover:bg-white/5",
                !isLogisticsProviderAvailable(provider) ? "cursor-not-allowed opacity-50" : ""
              ].join(" ")}
            >
              <span className="block text-sm font-bold text-foreground">
                {provider.name}
              </span>
              <span className={`mt-1 block text-[10px] ${isLogisticsProviderAvailable(provider) ? "text-emerald-300" : "text-amber-300"}`}>{providerAvailabilityMessage(provider)}</span>
              {selectedProviderId === provider.code && (
                <Check className="mx-auto mt-1 h-3 w-3 text-indigo-300" />
              )}
            </button>
          ))}
        </div>
        {selectedProvider && (
          <p className="mt-2 text-xs text-muted-foreground">
            Menampilkan layanan dari{" "}
            <span className="font-semibold text-foreground">{selectedProvider.name}</span>
          </p>
        )}
        {providerError && <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100" role="alert">{providerError}</p>}
      </div>

      {/* STEP 2 — Alamat Pengirim (Mengantar-style) */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-bold text-indigo-300">2</span>
          <label className="text-sm font-semibold text-foreground">Alamat Pengirim</label>
        </div>

        {pickupAddress ? (
          /* ── Filled state ── */
          <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
            <div className="flex items-start gap-3 min-w-0">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                {pickupAddress.shopName && (
                  <p className="text-sm font-semibold text-foreground">{pickupAddress.shopName}</p>
                )}
                {pickupAddress.picName && (
                  <p className="text-xs text-muted-foreground">{pickupAddress.picName}{pickupAddress.phone ? ` · ${pickupAddress.phone}` : ""}</p>
                )}
                {pickupAddress.city && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{pickupAddress.city}</p>
                )}
                <p className="mt-0.5 text-xs text-foreground leading-snug line-clamp-2">{pickupAddress.address}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPickupAddress(null)}
              className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/10"
            >
              Ubah
            </button>
          </div>
        ) : (
          /* ── Empty state: Pilih Alamat + Batal + Tambah ── */
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="mb-3 text-xs text-muted-foreground">Pilih Alamat</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {}}
                className="rounded-lg border border-white/15 bg-white/5 px-6 py-2.5 text-sm font-medium text-foreground hover:bg-white/10 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => setIsAddressModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Tambah
              </button>
            </div>
          </div>
        )}
      </div>

      {/* STEP 3 — Kota Asal & Tujuan */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-bold text-indigo-300">3</span>
          <label className="text-sm font-semibold text-foreground">Kota Asal &amp; Tujuan</label>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] items-end">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Kota Asal</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-400" />
              <select
                value={originCode}
                onChange={(e) => setOriginCode(e.target.value)}
                className="w-full appearance-none rounded-lg border border-white/10 bg-background/50 pl-10 pr-8 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="">Pilih kota asal...</option>
                {cities.filter(c => c.type === "origin" || c.type === "both").map(city => (
                  <option key={city.code} value={city.code}>{city.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-center pb-2">
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Kota Tujuan</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-emerald-400" />
              <select
                value={destCode}
                onChange={(e) => setDestCode(e.target.value)}
                className="w-full appearance-none rounded-lg border border-white/10 bg-background/50 pl-10 pr-8 py-2.5 text-sm focus:border-brand-emerald-400 focus:outline-none focus:ring-1 focus:ring-brand-emerald-400"
              >
                <option value="">Pilih kota tujuan...</option>
                {cities
                  .filter(c => (c.type === "destination" || c.type === "both") && c.code !== originCode)
                  .map(city => (
                    <option key={city.code} value={city.code}>{city.name}</option>
                  ))}
              </select>
            </div>
          </div>
        </div>
        {locationError && (
          <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100" role="alert">
            {locationError}
          </p>
        )}
      </div>

      {/* STEP 4 — Berat & Dimensi */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-bold text-indigo-300">4</span>
          <label className="text-sm font-semibold text-foreground">Berat &amp; Dimensi Paket</label>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Berat (kg) *</label>
            <input
              type="number" min="0.1" max="50" step="0.1"
              value={weight}
              onChange={(e) => setWeight(Math.max(0.1, Number(e.target.value) || 0.1))}
              className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Panjang (cm)</label>
            <input
              type="number" min="0" step="1"
              value={lengthCm || ""}
              onChange={(e) => setLengthCm(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Lebar (cm)</label>
            <input
              type="number" min="0" step="1"
              value={widthCm || ""}
              onChange={(e) => setWidthCm(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Tinggi (cm)</label>
            <input
              type="number" min="0" step="1"
              value={heightCm || ""}
              onChange={(e) => setHeightCm(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="0"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2.5">
          <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex-1 text-xs text-muted-foreground">
            {volumeCm3 > 0 && (
              <span>Volume: <strong className="text-foreground">{volumeCm3.toLocaleString("id-ID")} cm³</strong> · </span>
            )}
            Rekomendasi kendaraan kurir:{" "}
            <span className={`font-semibold ${vehicleRec.color}`}>
              {vehicleRec.icon} {vehicleRec.label}
            </span>
          </div>
        </div>
      </div>

      {/* STEP 5 — Pilih Layanan */}
      {selectedProviderId && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-bold text-indigo-300">5</span>
            <label className="text-sm font-semibold text-foreground">
              Pilih Layanan {selectedProvider?.name}
            </label>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-background/40 px-4 py-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memuat layanan {selectedProvider?.name}...
            </div>
          ) : error ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium mb-1">Layanan belum tersedia</p>
                  <p className="text-xs opacity-80">{error}</p>
                </div>
              </div>
            </div>
          ) : !originCode || !destCode ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-6 py-5 text-center text-sm text-muted-foreground">
              <ChevronRight className="mx-auto mb-2 h-5 w-5 opacity-40" />
              Pilih kota asal dan tujuan untuk melihat tarif layanan.
            </div>
          ) : tariffs.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {tariffs.map((tariff, index) => {
                const isSelected = selectedIndex === index;
                const isCheapest = index === 0;
                return (
                  <button
                    key={`${tariff.provider}-${tariff.service}-${index}`}
                    type="button"
                    onClick={() => selectTariff(index)}
                    className={[
                      "relative rounded-xl border p-4 text-left transition-all duration-150",
                      isSelected
                        ? "border-primary bg-primary/10 shadow-lg shadow-primary/5 scale-[1.01]"
                        : "border-white/10 bg-background/35 hover:bg-white/5 hover:scale-[1.005]",
                      isCheapest && !isSelected ? "ring-1 ring-brand-emerald-500/30" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{tariff.service_name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{tariff.etd ? `Estimasi ${tariff.etd}` : "ETA belum diberikan provider"}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground/80">Berat tagihan: {tariff.chargeable_weight_kg ? `${tariff.chargeable_weight_kg} kg` : "belum diberikan provider"} · Sumber: {tariff.source || "respons tarif provider"}</p>
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          Capability: {tariff.capabilities.length > 0 ? tariff.capabilities.map(capabilityLabel).join(", ") : "belum diberikan provider"}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Limitasi: {tariff.limitations.length > 0 ? tariff.limitations.join(", ") : "detail belum diberikan provider"}
                        </div>
                      </div>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <div className="text-[11px] text-muted-foreground">
                        {isCheapest && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-brand-emerald-500/30 bg-brand-emerald-500/10 px-2 py-0.5 text-brand-emerald-200">
                            <TrendingDown className="h-3 w-3" />
                            Termurah
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-foreground">{formatPrice(tariff.price)}</p>
                        <p className="text-[11px] text-muted-foreground">{tariff.net_price ? `Net ${formatPrice(tariff.net_price)}` : "Net belum diberikan provider"}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-6 py-5 text-center text-sm text-muted-foreground">
              <Package className="mx-auto mb-2 h-5 w-5 opacity-40" />
              Lengkapi data kota dan berat untuk melihat layanan.
            </div>
          )}
        </div>
      )}

      {/* Address Modal */}
      <AddressModal
        isOpen={isAddressModalOpen}
        onClose={() => setIsAddressModalOpen(false)}
        onSave={(addr) => setPickupAddress(addr)}
      />
    </div>
  );
}
