"use client";

import { motion } from "framer-motion";
import { Clock, Package, MapPin, Route, ShieldCheck, Truck, Zap } from "lucide-react";

interface RouteSnapshot {
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

interface OrderSummaryProps {
  isLoading: boolean;
  pricing: {
    distance_km: number;
    base_price_idr: number;
    actual_weight_kg?: number;
    dimensional_weight_kg?: number;
    chargeable_weight_kg?: number;
    volumetric_surcharge_idr: number;
    insurance_premium_idr: number;
    dynamic_price_idr?: number;
    delivery_model?: "p2p" | "two_legs" | "three_legs";
    eta_minutes?: number;
    route_snapshot?: RouteSnapshot | null;
    total_price_idr: number;
  } | null;
  isValid: boolean;
}

const modelLabel: Record<string, string> = {
  p2p: "P2P",
  two_legs: "2-Kaki",
  three_legs: "3-Kaki"
};

export function OrderSummary({ isLoading, pricing, isValid }: OrderSummaryProps) {
  const surgeAmount = pricing?.dynamic_price_idr || 0;
  const routeSnapshot = pricing?.route_snapshot || null;
  const routeDistanceKm =
    routeSnapshot?.distance_km ||
    (routeSnapshot?.distance_meters ? routeSnapshot.distance_meters / 1000 : undefined) ||
    pricing?.distance_km;
  const routeEtaMinutes =
    routeSnapshot?.eta_minutes ||
    (routeSnapshot?.duration_seconds ? Math.ceil(routeSnapshot.duration_seconds / 60) : undefined) ||
    pricing?.eta_minutes;
  const routeProvider = routeSnapshot?.active_provider || routeSnapshot?.provider || "runtime";
  const hasRouteGeometry = Boolean(routeSnapshot?.route_polyline);

  return (
    <div className="sticky top-8 rounded-2xl border border-white/10 bg-background/50 p-6 shadow-xl backdrop-blur-md">
      <h3 className="mb-6 text-lg font-semibold tracking-tight">Ringkasan Biaya</h3>

      <div className="space-y-4">
        {/* Base Fare */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>Ongkos Kirim {pricing ? `(${pricing.distance_km} km)` : ""}</span>
          </div>
          <span className="font-medium text-foreground">
            {isLoading ? (
              <span className="inline-block h-4 w-16 animate-pulse rounded bg-white/10"></span>
            ) : pricing ? (
              `Rp ${pricing.base_price_idr.toLocaleString('id-ID')}`
            ) : (
              "-"
            )}
          </span>
        </div>

        {/* Volumetric / Weight Surcharge */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Package className="h-4 w-4" />
            <span>Biaya Dimensi/Berat</span>
          </div>
          <span className="font-medium text-foreground">
            {isLoading ? (
              <span className="inline-block h-4 w-16 animate-pulse rounded bg-white/10"></span>
            ) : pricing ? (
              pricing.volumetric_surcharge_idr > 0 ? `Rp ${pricing.volumetric_surcharge_idr.toLocaleString('id-ID')}` : "Gratis"
            ) : (
              "-"
            )}
          </span>
        </div>

        {/* Insurance */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            <span>Asuransi</span>
          </div>
          <span className="font-medium text-foreground">
            {isLoading ? (
              <span className="inline-block h-4 w-16 animate-pulse rounded bg-white/10"></span>
            ) : pricing ? (
              pricing.insurance_premium_idr > 0 ? `Rp ${pricing.insurance_premium_idr.toLocaleString('id-ID')}` : "-"
            ) : (
              "-"
            )}
          </span>
        </div>

        {/* Surge/Dynamic Pricing - placeholder for UI */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Zap className="h-4 w-4 text-amber-500" />
            <span>Surge / Demand</span>
          </div>
          <span className="font-medium text-foreground">
            {isLoading ? (
              <span className="inline-block h-4 w-16 animate-pulse rounded bg-white/10"></span>
            ) : pricing && surgeAmount > 0 ? (
              `Rp ${surgeAmount.toLocaleString('id-ID')}`
            ) : (
              "-"
            )}
          </span>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Package className="h-4 w-4" />
              Berat Hitung
            </span>
            <span className="font-semibold text-foreground">
              {pricing?.chargeable_weight_kg ? `${pricing.chargeable_weight_kg} kg` : "-"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Truck className="h-4 w-4" />
              Model
            </span>
            <span className="font-semibold text-foreground">
              {pricing?.delivery_model ? modelLabel[pricing.delivery_model] || pricing.delivery_model : "-"}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              ETA
            </span>
            <span className="font-semibold text-foreground">
              {pricing?.eta_minutes ? `~${pricing.eta_minutes} menit` : "-"}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Route className="mt-0.5 h-4 w-4 text-emerald-400" />
              <div>
                <p className="text-sm font-semibold tracking-tight text-foreground">Preview rute</p>
                <p className="text-xs text-muted-foreground">
                  {pricing
                    ? `${routeDistanceKm ? `${routeDistanceKm.toFixed(1)} km` : "Jarak dihitung"}${routeEtaMinutes ? ` • ~${routeEtaMinutes} menit` : ""}`
                    : "Lengkapi alamat untuk estimasi."}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              {routeProvider}
            </span>
          </div>
          <div className="relative h-24 overflow-hidden rounded-xl border border-white/10 bg-background/45">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,rgba(16,185,129,0.16),transparent_28%),radial-gradient(circle_at_78%_62%,rgba(59,130,246,0.12),transparent_26%)]" />
            <svg viewBox="0 0 320 96" className="absolute inset-0 h-full w-full" role="img" aria-label="Preview rute pengiriman">
              <path
                d="M34 70 C88 26, 126 78, 172 46 S250 30, 286 62"
                fill="none"
                stroke={hasRouteGeometry ? "#10b981" : "#64748b"}
                strokeDasharray={hasRouteGeometry ? "0" : "7 7"}
                strokeLinecap="round"
                strokeWidth="5"
              />
              <circle cx="34" cy="70" r="9" fill="#10b981" />
              <circle cx="286" cy="62" r="9" fill="#f97316" />
            </svg>
          </div>
          {pricing && (!hasRouteGeometry || routeSnapshot?.fallback_reason) && (
            <p className="mt-3 text-xs text-muted-foreground">
              Rute sedang diperbarui. Harga dan ETA tetap memakai estimasi backend terbaru.
            </p>
          )}
        </div>
      </div>

      {surgeAmount > 0 && (
        <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <div className="flex items-center gap-2 font-semibold">
            <Zap className="h-4 w-4" />
            SURGE PRICING AKTIF
          </div>
          <p className="mt-1 text-xs text-amber-100/80">Biaya tambahan ditampilkan transparan sebelum pembayaran.</p>
        </div>
      )}

      <div className="my-6 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Total */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">Total Tagihan</span>
        <div className="text-right">
          <span className="text-2xl font-bold tracking-tight text-emerald-500">
            {isLoading ? (
              <span className="inline-block h-8 w-24 animate-pulse rounded bg-emerald-500/20"></span>
            ) : pricing ? (
              `Rp ${pricing.total_price_idr.toLocaleString('id-ID')}`
            ) : (
              "Rp 0"
            )}
          </span>
        </div>
      </div>

      <motion.button
        type="submit"
        form="order-form"
        disabled={!isValid || isLoading || !pricing}
        className="mt-8 w-full rounded-xl bg-primary px-4 py-4 text-sm font-semibold text-primary-foreground shadow-lg transition-all hover:bg-primary/90 hover:shadow-primary/25 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]"
        whileTap={isValid && !isLoading && pricing ? { scale: 0.98 } : {}}
      >
        {isLoading ? "Menghitung..." : "Bayar Sekarang"}
      </motion.button>
    </div>
  );
}
