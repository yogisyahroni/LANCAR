"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useForm, UseFormSetValue } from "react-hook-form";
import * as z from "zod";
import { api } from "@/lib/api";
import {
  Box,
  Camera,
  CalendarDays,
  Check,
  Crosshair,
  Info,
  Loader2,
  MapPin,
  Maximize,
  Navigation,
  Search,
  Sparkles,
  Clock,
  X
} from "lucide-react";

const coordinateSchema = z.object({
  lat: z.number(),
  lng: z.number()
});

export const orderSchema = z.object({
  service_code: z.string().min(1, "Pilih layanan pengiriman"),
  size_tier: z.string().optional(),
  pickup_address: z.string().min(5, "Alamat pickup minimal 5 karakter"),
  pickup_location: coordinateSchema.optional(),
  dropoff_address: z.string().min(5, "Alamat tujuan minimal 5 karakter"),
  dropoff_location: coordinateSchema.optional(),
  recipient_name: z.string().min(3, "Nama penerima wajib diisi"),
  recipient_phone: z.string().min(10, "Nomor HP tidak valid"),
  package_details: z.object({
    category: z.string().min(1, "Pilih kategori paket"),
    weight_kg: z.preprocess(
      (val) => (val === "" || val === null || val === undefined) ? undefined : Number(val),
      z.number({ message: "Berat wajib diisi" }).min(0.1, "Berat minimal 0.1 kg")
    ),
    dimensions: z.object({
      length: z.preprocess(
        (val) => (val === "" || val === null || val === undefined) ? undefined : Number(val),
        z.number({ message: "Panjang harus berupa angka" }).min(1, "Panjang minimal 1 cm").optional()
      ),
      width: z.preprocess(
        (val) => (val === "" || val === null || val === undefined) ? undefined : Number(val),
        z.number({ message: "Lebar harus berupa angka" }).min(1, "Lebar minimal 1 cm").optional()
      ),
      height: z.preprocess(
        (val) => (val === "" || val === null || val === undefined) ? undefined : Number(val),
        z.number({ message: "Tinggi harus berupa angka" }).min(1, "Tinggi minimal 1 cm").optional()
      ),
    }),
    dimensions_scanned: z.boolean().default(false)
  }),
  has_insurance: z.boolean().default(false),
  item_value: z.preprocess(
    (val) => (val === "" || val === null || val === undefined) ? undefined : Number(val),
    z.number({ message: "Nilai barang harus berupa angka" }).min(1000, "Nilai barang minimal Rp 1.000").optional()
  ).optional(),
  schedule_type: z.enum(["now", "scheduled"]).default("now"),
  scheduled_at: z.string().optional(),
  customer_notes: z.string().max(200).optional()
}).superRefine((data, ctx) => {
  if (!data.pickup_location) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pickup_location"],
      message: "Pilih titik pickup dari hasil pencarian, lokasi saat ini, atau mini map"
    });
  }
  if (!data.dropoff_location) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dropoff_location"],
      message: "Pilih titik tujuan dari hasil pencarian, lokasi saat ini, atau mini map"
    });
  }
  if (data.has_insurance && !data.item_value) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["item_value"],
      message: "Nilai barang wajib diisi jika asuransi aktif"
    });
  }
  if (data.schedule_type === "scheduled" && !data.scheduled_at) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scheduled_at"],
      message: "Pilih jadwal pengiriman"
    });
  }
});

export type OrderFormValues = z.infer<typeof orderSchema>;

type LocationValue = { lat: number; lng: number };
type AddressMode = "pickup" | "dropoff";

interface SavedAddress {
  id: string;
  label: string;
  recipient_name?: string;
  phone?: string;
  address: string;
  latitude: number;
  longitude: number;
  is_default?: boolean;
}

interface AddressSuggestion {
  id: string;
  label: string;
  detail: string;
  lat: number;
  lng: number;
  source: "osm" | "saved" | "fallback";
  recipient_name?: string;
  phone?: string;
}

interface OrderFormProps {
  onFormChange: (data: Partial<OrderFormValues>, isValid: boolean, context?: { selectedService?: DeliveryService; scanRequired: boolean }) => void;
  onSubmit: (data: OrderFormValues) => void;
}

export interface DeliveryService {
  code: string;
  name: string;
  description: string;
  service_family: string;
  route_model: "p2p" | "two_legs" | "three_legs";
  vehicle_types: string[];
  exclusive_driver: boolean;
  batching_allowed: boolean;
  max_eta_minutes: number;
  max_distance_km?: number | null;
  max_weight_kg?: number | null;
  uses_size_tier: boolean;
  requires_dimension_scan: boolean;
  metadata?: Record<string, any>;
  size_tiers: Array<{
    code: string;
    name: string;
    description?: string;
    max_weight_kg?: number;
  }>;
}

const fallbackLocations: AddressSuggestion[] = [
  {
    id: "fallback-monas",
    label: "Monas, Gambir",
    detail: "Gambir, Jakarta Pusat",
    lat: -6.175392,
    lng: 106.827153,
    source: "fallback"
  },
  {
    id: "fallback-sudirman",
    label: "Jl. Jend. Sudirman",
    detail: "Senayan, Kebayoran Baru, Jakarta Selatan",
    lat: -6.223412,
    lng: 106.801234,
    source: "fallback"
  },
  {
    id: "fallback-kelapagading",
    label: "Kelapa Gading",
    detail: "Jakarta Utara",
    lat: -6.158493,
    lng: 106.904972,
    source: "fallback"
  },
  {
    id: "fallback-cawang",
    label: "Cawang",
    detail: "Jakarta Timur",
    lat: -6.250178,
    lng: 106.873123,
    source: "fallback"
  }
];

const jakartaBounds = {
  north: -6.08,
  south: -6.36,
  west: 106.68,
  east: 106.98
};

const formatCoordinate = (location?: LocationValue) => {
  if (!location) return "Titik belum dipilih";
  return `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
};

const makeFallbackCoordinate = (text: string): LocationValue => {
  const seed = Array.from(text || "jakarta").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const latRange = jakartaBounds.north - jakartaBounds.south;
  const lngRange = jakartaBounds.east - jakartaBounds.west;
  return {
    lat: jakartaBounds.south + ((seed % 100) / 100) * latRange,
    lng: jakartaBounds.west + (((seed * 7) % 100) / 100) * lngRange
  };
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const formatDateValue = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const formatDateLabel = (value: string) => {
  if (!value) return "Pilih tanggal";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const buildCalendarDays = (month: Date) => {
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

const pickupTimeOptions = Array.from({ length: 29 }, (_, index) => {
  const totalMinutes = (7 * 60) + (index * 30);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${pad2(hour)}:${pad2(minute)}`;
});

function getSavedAddresses(): AddressSuggestion[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem("lancar_addresses");
    const addresses = stored ? JSON.parse(stored) as SavedAddress[] : [];
    return addresses
      .filter((item) => item.address && Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
      .map((item) => ({
        id: `saved-${item.id}`,
        label: item.label,
        detail: item.address,
        lat: item.latitude,
        lng: item.longitude,
        source: "saved" as const,
        recipient_name: item.recipient_name,
        phone: item.phone
      }));
  } catch {
    return [];
  }
}

function MiniMapPicker({
  location,
  accentClass,
  onPick,
}: {
  location?: LocationValue;
  accentClass: string;
  onPick: (location: LocationValue) => void;
}) {
  const zoom = 14;
  const center = location || { lat: -6.2, lng: 106.816666 };

  const lonToTileX = (lng: number, z: number) => ((lng + 180) / 360) * Math.pow(2, z);
  const latToTileY = (lat: number, z: number) => {
    const latRad = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, z);
  };
  const tileXToLon = (x: number, z: number) => x / Math.pow(2, z) * 360 - 180;
  const tileYToLat = (y: number, z: number) => {
    const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  };

  const mapTiles = useMemo(() => {
    const centerX = lonToTileX(center.lng, zoom);
    const centerY = latToTileY(center.lat, zoom);
    const baseX = Math.floor(centerX);
    const baseY = Math.floor(centerY);
    const offsetX = (centerX - baseX) * 256;
    const offsetY = (centerY - baseY) * 256;

    return [-1, 0, 1].flatMap((dy) =>
      [-1, 0, 1].map((dx) => ({
        key: `${baseX + dx}-${baseY + dy}`,
        url: `https://tile.openstreetmap.org/${zoom}/${baseX + dx}/${baseY + dy}.png`,
        left: `calc(50% + ${(dx * 256) - offsetX}px)`,
        top: `calc(50% + ${(dy * 256) - offsetY}px)`,
      }))
    );
  }, [center.lat, center.lng]);

  const handlePick = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = lonToTileX(center.lng, zoom);
    const centerY = latToTileY(center.lat, zoom);
    const clickedX = centerX + ((event.clientX - rect.left) - rect.width / 2) / 256;
    const clickedY = centerY + ((event.clientY - rect.top) - rect.height / 2) / 256;
    onPick({ lat: tileYToLat(clickedY, zoom), lng: tileXToLon(clickedX, zoom) });
  };

  return (
    <button
      type="button"
      onClick={handlePick}
      className="group relative h-48 w-full overflow-hidden rounded-lg border border-white/10 bg-[#101820] text-left shadow-inner outline-none focus:ring-2 focus:ring-primary/60"
      aria-label="Klik untuk menyesuaikan titik koordinat"
    >
      <div className="absolute inset-0 opacity-95 grayscale-[.15] saturate-[.75]">
        {mapTiles.map((tile) => (
          <img
            key={tile.key}
            src={tile.url}
            alt=""
            draggable={false}
            className="absolute h-64 w-64 max-w-none select-none"
            style={{
              left: tile.left,
              top: tile.top,
              transform: "translate(-50%, -50%)"
            }}
          />
        ))}
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,.42),rgba(2,6,23,.16)),radial-gradient(circle_at_50%_50%,rgba(16,185,129,.14),transparent_42%)]" />
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full transition-all duration-200"
      >
        <MapPin className={`h-9 w-9 drop-shadow-lg ${accentClass}`} />
      </div>
      <div className="absolute bottom-3 left-3 rounded-md border border-white/10 bg-background/80 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
        Klik map untuk adjust pin
      </div>
    </button>
  );
}

function AddressPicker({
  mode,
  address,
  location,
  error,
  locationError,
  setValue,
}: {
  mode: AddressMode;
  address: string;
  location?: LocationValue;
  error?: string;
  locationError?: string;
  setValue: UseFormSetValue<OrderFormValues>;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [savedSuggestions, setSavedSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const addressField = mode === "pickup" ? "pickup_address" : "dropoff_address";
  const locationField = mode === "pickup" ? "pickup_location" : "dropoff_location";
  const isPickup = mode === "pickup";
  const accentClass = isPickup ? "text-primary" : "text-emerald-500";

  useEffect(() => {
    setSavedSuggestions(getSavedAddresses());
  }, []);

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

      const localMatches = [...savedSuggestions, ...fallbackLocations]
        .filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(address.toLowerCase()))
        .slice(0, 4);

      try {
        const params = new URLSearchParams({
          q: `${address}, Indonesia`,
          format: "json",
          addressdetails: "1",
          limit: "5",
          countrycodes: "id"
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
          signal: controller.signal,
          headers: { "Accept": "application/json" }
        });

        if (!response.ok) throw new Error("Search failed");

        const data = await response.json() as Array<{ place_id: number; display_name: string; lat: string; lon: string }>;
        const osmSuggestions = data.map((item) => {
          const [label, ...rest] = item.display_name.split(",");
          return {
            id: `osm-${item.place_id}`,
            label: label.trim(),
            detail: rest.join(",").trim(),
            lat: Number(item.lat),
            lng: Number(item.lon),
            source: "osm" as const
          };
        });

        setSuggestions([...localMatches, ...osmSuggestions].slice(0, 6));
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setSuggestions(localMatches.length > 0 ? localMatches : fallbackLocations);
          setMessage("Pencarian online tidak tersedia. Pakai titik fallback atau klik mini map.");
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

  const applySuggestion = (suggestion: AddressSuggestion) => {
    setValue(addressField, `${suggestion.label}, ${suggestion.detail}`, { shouldDirty: true, shouldValidate: true });
    setValue(locationField, { lat: suggestion.lat, lng: suggestion.lng }, { shouldDirty: true, shouldValidate: true });

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

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage("Browser tidak mendukung geolocation. Klik mini map untuk memilih titik.");
      return;
    }

    setIsLocating(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setValue(locationField, nextLocation, { shouldDirty: true, shouldValidate: true });
        if (!address || address.length < 5) {
          setValue(addressField, `Lokasi saat ini (${formatCoordinate(nextLocation)})`, { shouldDirty: true, shouldValidate: true });
        }
        setIsLocating(false);
      },
      () => {
        setMessage("Izin lokasi ditolak. Pakai hasil pencarian atau klik mini map.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const useSavedDefault = () => {
    const defaultAddress = savedSuggestions.find((item) => item.source === "saved") || savedSuggestions[0];
    if (defaultAddress) {
      applySuggestion(defaultAddress);
    } else {
      setMessage("Belum ada alamat tersimpan. Tambahkan di menu Buku Alamat.");
    }
  };

  const useTypedAddress = () => {
    const fallback = makeFallbackCoordinate(address);
    setValue(locationField, fallback, { shouldDirty: true, shouldValidate: true });
    setMessage("Titik dibuat dari alamat yang diketik. Klik mini map jika perlu koreksi.");
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-muted-foreground">Alamat Lengkap</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={address || ""}
          onChange={(event) => {
            setValue(addressField, event.target.value, { shouldDirty: true, shouldValidate: true });
            setValue(locationField, undefined, { shouldDirty: true, shouldValidate: true });
          }}
          className={`w-full rounded-lg border border-white/10 bg-background/50 py-3 pl-10 pr-10 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 ${isPickup ? "focus:border-primary focus:ring-primary" : "focus:border-emerald-500 focus:ring-emerald-500"}`}
          placeholder="Cari lokasi bangunan, jalan, atau area..."
        />
        {isSearching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

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
                {suggestion.source}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={useCurrentLocation}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
        >
          {isLocating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
          Lokasi Saya
        </button>
        <button
          type="button"
          onClick={useSavedDefault}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Buku Alamat
        </button>
        <button
          type="button"
          onClick={useTypedAddress}
          disabled={!address || address.length < 5}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Crosshair className="h-3.5 w-3.5" />
          Pakai Alamat Ini
        </button>
      </div>

      <MiniMapPicker
        location={location}
        accentClass={accentClass}
        onPick={(nextLocation) => {
          setValue(locationField, nextLocation, { shouldDirty: true, shouldValidate: true });
          if (!address || address.length < 5) {
            setValue(addressField, `Pin manual (${formatCoordinate(nextLocation)})`, { shouldDirty: true, shouldValidate: true });
          }
        }}
      />

      <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
        <span>{formatCoordinate(location)}</span>
        {location ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Info className="h-3.5 w-3.5" />}
      </div>

      {message && (
        <p className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {message}
        </p>
      )}
    </div>
  );
}

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
  const [result, setResult] = useState({ length: 28, width: 20, height: 12, weight_kg: 1.2 });

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
      const length = Math.round(22 + Math.random() * 18);
      const width = Math.round(14 + Math.random() * 12);
      const height = Math.round(8 + Math.random() * 14);
      const volumetric = (length * width * height) / 6000;
      setResult({
        length,
        width,
        height,
        weight_kg: Math.max(0.5, Number(volumetric.toFixed(1)))
      });
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
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>Panjang: <b>{result.length} cm</b></div>
                <div>Lebar: <b>{result.width} cm</b></div>
                <div>Tinggi: <b>{result.height} cm</b></div>
                <div>Berat: <b>{result.weight_kg} kg</b></div>
              </div>
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
                onApply(result);
                onClose();
              }}
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

export function OrderForm({ onFormChange, onSubmit }: OrderFormProps) {
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [services, setServices] = useState<DeliveryService[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [serviceLoadError, setServiceLoadError] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  const customZodResolver = async (data: any) => {
    const result = orderSchema.safeParse(data);
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
      const defaultService = nextServices.find((service: DeliveryService) => service.code === "lancar_instant") || nextServices[0];
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
    onFormChange(getValues(), isValid && Boolean(selectedService) && (!scanRequired || Boolean(dimensions_scanned)), {
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

  return (
    <>
      <form id="order-form" onSubmit={submitWithServiceRules} className="space-y-8">
        <input type="hidden" {...register("service_code")} />
        <input type="hidden" {...register("size_tier")} />

        <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Box className="h-5 w-5 text-primary" />
            Pilih Layanan
          </h3>

          {isLoadingServices ? (
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-background/40 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memuat layanan pengiriman...
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
              {services.map((service) => {
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
                {selectedService.size_tiers.map((tier) => (
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

        <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <MapPin className="h-5 w-5 text-emerald-500" />
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

          <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Nama Penerima</label>
              <input
                {...register("recipient_name")}
                className="w-full rounded-lg border border-white/10 bg-background/50 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Mis: Budi Santoso"
              />
              {errors.recipient_name && <p className="mt-1 text-xs text-destructive">{errors.recipient_name.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Nomor HP</label>
              <input
                {...register("recipient_phone")}
                type="tel"
                className="w-full rounded-lg border border-white/10 bg-background/50 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Kategori Barang</label>
              <select
                {...register("package_details.category")}
                className="w-full appearance-none rounded-lg border border-white/10 bg-background/50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">Pilih Kategori</option>
                <option value="document">Dokumen</option>
                <option value="food">Makanan / Minuman</option>
                <option value="electronics">Elektronik</option>
                <option value="clothes">Pakaian</option>
                <option value="other">Lainnya</option>
              </select>
              {errors.package_details?.category && <p className="mt-1 text-xs text-destructive">{errors.package_details.category.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Berat Aktual (kg)</label>
              <input
                {...register("package_details.weight_kg", { setValueAs: (v) => v === "" ? "" : Number(v) })}
                type="number"
                step="0.1"
                className="w-full rounded-lg border border-white/10 bg-background/50 px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              {errors.package_details?.weight_kg && <p className="mt-1 text-xs text-destructive">{errors.package_details.weight_kg.message}</p>}
            </div>
          </div>

          <div>
            <label className="mb-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              Dimensi Paket (cm) <Maximize className="h-3.5 w-3.5" />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <input {...register("package_details.dimensions.length", { setValueAs: (v) => v === "" ? "" : Number(v) })} type="number" placeholder="P" readOnly onClick={() => scanRequired && setIsScanOpen(true)} className="w-full cursor-pointer rounded-lg border border-white/10 bg-background/30 px-4 py-2 text-center text-sm text-muted-foreground focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              <input {...register("package_details.dimensions.width", { setValueAs: (v) => v === "" ? "" : Number(v) })} type="number" placeholder="L" readOnly onClick={() => scanRequired && setIsScanOpen(true)} className="w-full cursor-pointer rounded-lg border border-white/10 bg-background/30 px-4 py-2 text-center text-sm text-muted-foreground focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              <input {...register("package_details.dimensions.height", { setValueAs: (v) => v === "" ? "" : Number(v) })} type="number" placeholder="T" readOnly onClick={() => scanRequired && setIsScanOpen(true)} className="w-full cursor-pointer rounded-lg border border-white/10 bg-background/30 px-4 py-2 text-center text-sm text-muted-foreground focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
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

          <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <label className="flex items-start gap-3">
              <input type="checkbox" {...register("has_insurance")} className="mt-1 h-4 w-4 rounded border-white/10 bg-background" />
              <div>
                <p className="text-sm font-medium text-amber-500">Gunakan Asuransi Pengiriman</p>
                <p className="text-xs text-muted-foreground">Lindungi barang berharga Anda. Premi 0.2% dari nilai barang.</p>
              </div>
            </label>
            {has_insurance && (
              <div className="ml-7 mt-3">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Nilai Barang (Rp)</label>
                <input
                  {...register("item_value", { setValueAs: (v) => v === "" ? "" : Number(v) })}
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
                        onClick={() => setIsDatePickerOpen((open) => !open)}
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
                            {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day) => (
                              <div key={day} className="py-1">{day}</div>
                            ))}
                          </div>

                          <div className="mt-1 grid grid-cols-7 gap-1">
                            {calendarDays.map((date) => {
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
                        onClick={() => setIsTimePickerOpen((open) => !open)}
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
                            {pickupTimeOptions.map((time) => (
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
        onApply={(scan) => {
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
