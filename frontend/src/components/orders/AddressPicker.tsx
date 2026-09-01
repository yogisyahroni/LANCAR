"use client";

import { useEffect, useRef, useState } from "react";
import { UseFormSetValue } from "react-hook-form";
import { api } from "@/lib/api";
import { MapPin, Search, Loader2, Plus, Navigation, Sparkles, Check, Info } from "lucide-react";
import { OrderFormValues, LocationValue, AddressMode, AddressSuggestion, SavedAddress } from "./OrderSchemas";

type NormalizedAddressSuggestion = AddressSuggestion & {
  city?: string | null;
  district?: string | null;
  postal_code?: string | null;
  provider_place_id?: string | null;
  provider_location_codes?: Record<string, string>;
};

const formatCoordinate = (location?: LocationValue) => {
  if (!location) return "Titik belum dipilih";
  return `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
};

const addressSuggestionSourceLabel: Record<AddressSuggestion["source"], string> = {
  tomtom: "TomTom",
  osm: "OSM",
  saved: "Tersimpan"
};

export const pad2 = (value: number) => String(value).padStart(2, "0");

export const formatDateValue = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export const formatDateLabel = (value: string) => {
  if (!value) return "Pilih tanggal";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

export const buildCalendarDays = (month: Date) => {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

export const pickupTimeOptions = Array.from({ length: 29 }, (_, index) => {
  const totalMinutes = (7 * 60) + (index * 30);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${pad2(hour)}:${pad2(minute)}`;
});

async function getSavedAddresses(mode: AddressMode): Promise<AddressSuggestion[]> {
  const response = await api.get("/customer/addresses");
  const addresses = (response.data?.data || []) as SavedAddress[];
  const allowedKinds = mode === "pickup" ? ["pickup", "both"] : ["receiver", "both"];
  return addresses
    .filter((item) => item.address && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)))
    .filter((item) => allowedKinds.includes(item.kind || "receiver"))
    .map((item) => ({
      id: `saved-${item.id}`,
      label: item.label,
      detail: item.address,
      lat: Number(item.lat),
      lng: Number(item.lng),
      source: "saved" as const,
      recipient_name: item.contact_name,
      phone: item.contact_phone_masked
    }));
}

export function AddressPicker({
  mode,
  address,
  location,
  error,
  locationError,
  setValue,
  cardPicker = false,
}: {
  mode: AddressMode;
  address: string;
  location?: LocationValue;
  error?: string;
  locationError?: string;
  setValue: UseFormSetValue<OrderFormValues>;
  cardPicker?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<NormalizedAddressSuggestion[]>([]);
  const [savedSuggestions, setSavedSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalForm, setModalForm] = useState({
    shopName: "",
    picName: "",
    phone: "",
    fullAddress: "",
    location: null as LocationValue | null
  });

  const addressField = mode === "pickup" ? "pickup_address" : "dropoff_address";
  const locationField = mode === "pickup" ? "pickup_location" : "dropoff_location";
  const isPickup = mode === "pickup";
  const accentClass = isPickup ? "text-primary" : "text-success";

  type NormalizedMapResult = {
    label?: string;
    display_label?: string;
    city?: string | null;
    district?: string | null;
    postal_code?: string | null;
  };

  const performReverseGeocode = async (lat: number, lng: number): Promise<NormalizedMapResult | null> => {
    try {
      const res = await api.get("/maps/reverse-geocode", {
        params: { latitude: lat, longitude: lng, scope: "web_customer" },
      });
      const result = res.data?.result as NormalizedMapResult | undefined;
      return result?.display_label || result?.label ? result : null;
    } catch (e) {
      console.warn("Reverse geocode failed", e);
    }
    return null;
  };

  useEffect(() => {
    let isMounted = true;

    getSavedAddresses(mode)
      .then((items) => {
        if (isMounted) {
          setSavedSuggestions(items);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSavedSuggestions([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [mode]);

  useEffect(() => {
    if (!address || address.trim().length < 4) {
      setSuggestions([]);
      return;
    }

    const handler = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSearching(true);
      setMessage(null);

      const localMatches = savedSuggestions
        .filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(address.toLowerCase()))
        .slice(0, 4);

      try {
        const response = await api.get("/maps/geocode", {
          signal: controller.signal,
          params: {
            query: `${address}, Indonesia`,
            scope: "web_customer"
          }
        });

        const data = (response.data?.results || []) as Array<{
          label: string;
          display_label?: string;
          city?: string | null;
          district?: string | null;
          postal_code?: string | null;
          provider_place_id?: string | null;
          provider_location_codes?: Record<string, string>;
          latitude: number;
          longitude: number;
          provider: string;
        }>;
        const providerSuggestions = data.map((item, index) => {
          const displayLabel = item.display_label || item.label;
          const [label, ...rest] = displayLabel.split(",");
          const normalizedProvider = String(item.provider || "").toLowerCase();
          return {
            id: `${item.provider}-${index}-${item.latitude}-${item.longitude}`,
            label: label.trim(),
            detail: rest.join(",").trim(),
            lat: Number(item.latitude),
            lng: Number(item.longitude),
            source: normalizedProvider.includes("tomtom") ? "tomtom" as const : "osm" as const,
            city: item.city,
            district: item.district,
            postal_code: item.postal_code,
            provider_place_id: item.provider_place_id,
            provider_location_codes: item.provider_location_codes,
          };
        });

        setSuggestions([...localMatches, ...providerSuggestions].slice(0, 6));
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setSuggestions(localMatches);
          setMessage(
            localMatches.length > 0
              ? "Pencarian online tidak tersedia. Menampilkan alamat tersimpan dari database."
              : "Pencarian online tidak tersedia. Gunakan Lokasi Saya atau alamat tersimpan."
          );
        }
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => {
      clearTimeout(handler);
      abortRef.current?.abort();
    };
  }, [address, savedSuggestions]);

  const applySuggestion = (suggestion: NormalizedAddressSuggestion) => {
    setValue(addressField, `${suggestion.label}, ${suggestion.detail}`, { shouldDirty: true, shouldValidate: true });
    setValue(locationField, { lat: suggestion.lat, lng: suggestion.lng }, { shouldDirty: true, shouldValidate: true });
    const cityField = mode === "pickup" ? "pickup_city" : "dropoff_city";
    if (suggestion.city) {
      setValue(cityField, suggestion.city, { shouldDirty: true, shouldValidate: true });
    }

    if (!isPickup) {
      if (suggestion.recipient_name) {
        setValue("recipient_name", suggestion.recipient_name, { shouldDirty: true, shouldValidate: true });
      }
      if (suggestion.phone) {
        setValue("recipient_phone", suggestion.phone, { shouldDirty: true, shouldValidate: true });
      }
    }

    setSuggestions([]);
    setMessage(null);
  };

  const handleUseCurrentLocation = async (onSuccess?: (addr: string, loc: LocationValue) => void) => {
    if (!navigator.geolocation) {
      setMessage("Browser tidak mendukung geolocation. Pilih alamat dari hasil pencarian atau Buku Alamat.");
      return;
    }

    setIsLocating(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        
        let finalAddr = `Lokasi saat ini (${formatCoordinate(nextLocation)})`;
        const geocoded = await performReverseGeocode(nextLocation.lat, nextLocation.lng);
        if (geocoded) {
          finalAddr = geocoded.display_label || geocoded.label || finalAddr;
          const cityField = mode === "pickup" ? "pickup_city" : "dropoff_city";
          if (geocoded.city) {
            setValue(cityField, geocoded.city, { shouldDirty: true, shouldValidate: true });
          }
        }

        if (onSuccess) {
          onSuccess(finalAddr, nextLocation);
        } else {
          setValue(locationField, nextLocation, { shouldDirty: true, shouldValidate: true });
          setValue(addressField, finalAddr, { shouldDirty: true, shouldValidate: true });
        }
        setIsLocating(false);
      },
      () => {
        setMessage("Izin lokasi ditolak. Pakai hasil pencarian atau Buku Alamat.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleUseSavedDefault = () => {
    const defaultAddress = savedSuggestions.find((item) => item.source === "saved") || savedSuggestions[0];
    if (defaultAddress) {
      applySuggestion(defaultAddress);
    } else {
      setMessage("Belum ada alamat tersimpan. Tambahkan di menu Buku Alamat.");
    }
  };

  const hasAddress = Boolean(address && address.trim().length > 0);

  return (
    <div className="space-y-3">
      {cardPicker ? (
        /* ══ AGGREGATOR MODE: Card Picker UI ══ */
        <>
          {hasAddress ? (
            <div className={[
              "flex items-start justify-between gap-3 rounded-xl border p-4",
              location
                ? "border-success/25 bg-success/5"
                : "border-white/10 bg-white/[0.03]"
            ].join(" ")}>
              <div className="flex items-start gap-3 min-w-0">
                <MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${accentClass}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{address}</p>
                  {location && (
                    <span className="mt-1 block text-[11px] text-brand-emerald-400">✓ Titik lokasi tersimpan</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setValue(addressField, "", { shouldDirty: true, shouldValidate: true });
                  setValue(locationField, undefined, { shouldDirty: true, shouldValidate: true });
                  setSuggestions([]);
                  setMessage(null);
                }}
                className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/10"
              >
                Ubah
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <p className="mb-3 text-xs text-muted-foreground">Pilih Alamat</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setSuggestions([]); setMessage(null); }}
                  className="rounded-md border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-foreground hover:bg-white/10 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModalForm({ shopName: "", picName: "", phone: "", fullAddress: "", location: null });
                    setIsModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Tambah
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {isPickup && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleUseCurrentLocation()}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isLocating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Navigation className="h-3 w-3" />}
                      Lokasi Saya
                    </button>
                    <span className="text-muted-foreground/30">·</span>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleUseSavedDefault}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Sparkles className="h-3 w-3" />
                  Buku Alamat
                </button>
              </div>
            </div>
          )}
          {/* Search input below card when no address selected */}
          {!hasAddress && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                name={addressField}
                data-testid={`${mode}-address-input`}
                value={address || ""}
                onChange={(event) => {
                  setValue(addressField, event.target.value, { shouldDirty: true, shouldValidate: true });
                  setValue(locationField, undefined, { shouldDirty: true, shouldValidate: true });
                }}
                className={`w-full rounded-lg border border-white/10 bg-background/50 py-3 pl-10 pr-10 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 ${isPickup ? "focus:border-primary focus:ring-primary" : "focus:border-success focus:ring-success"}`}
                placeholder="Atau ketik untuk mencari lokasi..."
              />
              {isSearching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            </div>
          )}
        </>
      ) : (
        /* ══ ONDEMAND MODE: Original Search UI ══ */
        <>
          <label className="text-sm font-medium text-muted-foreground">Alamat Lengkap</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name={addressField}
              data-testid={`${mode}-address-input`}
              value={address || ""}
              onChange={(event) => {
                setValue(addressField, event.target.value, { shouldDirty: true, shouldValidate: true });
                setValue(locationField, undefined, { shouldDirty: true, shouldValidate: true });
              }}
              className={`w-full rounded-lg border border-white/10 bg-background/50 py-3 pl-10 pr-10 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 ${isPickup ? "focus:border-primary focus:ring-primary" : "focus:border-success focus:ring-success"}`}
              placeholder="Cari lokasi bangunan, jalan, atau area..."
            />
            {isSearching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Tombol lokasi saat ini — tersedia untuk pickup DAN dropoff (UX Gojek/Grab) */}
            <button
              type="button"
              data-testid={`${mode}-current-location-button`}
              onClick={() => handleUseCurrentLocation()}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
            >
              {isLocating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
              Lokasi Saya
            </button>
            <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200">
              Pilih hasil pencarian atau gunakan lokasi saat ini.
            </span>
          </div>
          <div className={[
            "flex items-center justify-between gap-3 rounded-lg border px-3 py-3 text-xs",
            location
              ? "border-success/25 bg-success/10 text-brand-emerald-200"
              : "border-white/10 bg-white/[0.03] text-muted-foreground"
          ].join(" ")}>
            <div className="min-w-0">
              <p className="font-medium text-foreground">
                {location ? "Titik lokasi siap" : "Titik lokasi belum dipilih"}
              </p>
              <span data-testid={`${mode}-coordinate-label`} className="mt-1 block truncate">
                {formatCoordinate(location)}
              </span>
            </div>
            {location ? <Check className="h-4 w-4 shrink-0 text-success" /> : <Info className="h-4 w-4 shrink-0" />}
          </div>
        </>
      )}

      {(error || locationError) && (
        <p className="text-xs text-destructive">{error || locationError}</p>
      )}

      {suggestions.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-white/10 bg-background/95 shadow-xl backdrop-blur">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => applySuggestion(suggestion)}
              className="flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/5"
            >
              <MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${accentClass}`} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{suggestion.label}</span>
                <span className="block line-clamp-1 text-xs text-muted-foreground">{suggestion.detail}</span>
              </span>
              <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                {addressSuggestionSourceLabel[suggestion.source]}
              </span>
            </button>
          ))}
        </div>
      )}

      {message && (
        <p className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {message}
        </p>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} aria-label="Tutup modal" />
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-background/95 shadow-2xl p-5">
            <h3 className="text-lg font-semibold mb-4">Detail Alamat {isPickup ? "Pengirim" : "Penerima"}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">Nama Toko/Lokasi</label>
                <input
                  value={modalForm.shopName}
                  onChange={(e) => setModalForm(prev => ({ ...prev, shopName: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder="Mis. Toko Maju Jaya"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">Nama PIC</label>
                  <input
                    value={modalForm.picName}
                    onChange={(e) => setModalForm(prev => ({ ...prev, picName: e.target.value }))}
                    className="w-full rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    placeholder="Nama Kontak"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">Nomor HP</label>
                  <input
                    value={modalForm.phone}
                    onChange={(e) => setModalForm(prev => ({ ...prev, phone: e.target.value.replace(/[^0-9+]/g, '') }))}
                    className={`w-full rounded-md border bg-black/50 px-3 py-2 text-sm focus:outline-none ${modalForm.phone && !/^(08|628|\+628)[0-9]{8,11}$/.test(modalForm.phone) ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-primary'}`}
                    placeholder="08..."
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1 flex justify-between items-center">
                  <span>Alamat Lengkap &amp; Kodepos</span>
                  <button
                    type="button"
                    onClick={() => handleUseCurrentLocation((addr, loc) => setModalForm(prev => ({ ...prev, fullAddress: addr, location: loc })))}
                    className="text-xs text-primary flex items-center gap-1 hover:underline"
                  >
                    {isLocating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Navigation className="h-3 w-3" />}
                    Gunakan Lokasi Saya
                  </button>
                </label>
                <textarea
                  value={modalForm.fullAddress}
                  onChange={(e) => setModalForm(prev => ({ ...prev, fullAddress: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm focus:border-primary focus:outline-none min-h-[80px]"
                  placeholder="Provinsi, Kota, Kecamatan, Kodepos, Jalan, RT/RW..."
                />
              </div>
              <div className="pt-4 flex gap-3 justify-end border-t border-white/10">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm rounded-md border border-white/10 hover:bg-white/5">
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const formatted = `Toko: ${modalForm.shopName || "-"}, PIC: ${modalForm.picName || "-"}, HP: ${modalForm.phone || "-"} | ${modalForm.fullAddress}`;
                    setValue(addressField, formatted, { shouldDirty: true, shouldValidate: true });
                    if (modalForm.location) {
                      setValue(locationField, modalForm.location, { shouldDirty: true, shouldValidate: true });
                    }
                    if (!isPickup) {
                      if (modalForm.picName) setValue("recipient_name", modalForm.picName, { shouldDirty: true, shouldValidate: true });
                      if (modalForm.phone) setValue("recipient_phone", modalForm.phone, { shouldDirty: true, shouldValidate: true });
                    }
                    setIsModalOpen(false);
                  }}
                  className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90"
                >
                  Terapkan Alamat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
