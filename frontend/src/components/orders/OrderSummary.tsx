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

type RoutePoint = { lat: number; lng: number };

interface OrderSummaryProps {
  isLoading: boolean;
  isRouteLoading?: boolean;
  routePreview?: RouteSnapshot | null;
  routeError?: string | null;
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

const routeCanvas = {
  width: 320,
  height: 96,
  tileSize: 256,
  padding: 24
};

const modelLabel: Record<string, string> = {
  p2p: "P2P",
  two_legs: "2-Kaki",
  three_legs: "3-Kaki"
};

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1").replace(/\/$/, "");

function decodePolyline(encoded?: string): RoutePoint[] {
  if (!encoded) return [];
  const points: RoutePoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += deltaLat;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += deltaLng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function mercatorProject(point: RoutePoint, zoom: number) {
  const sinLat = Math.sin((point.lat * Math.PI) / 180);
  const scale = routeCanvas.tileSize * 2 ** zoom;
  return {
    x: ((point.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  };
}

function buildRouteMap(points: RoutePoint[]) {
  if (points.length < 2) return null;

  let selectedZoom = 12;
  let projected = points.map((point) => mercatorProject(point, selectedZoom));

  for (let zoom = 16; zoom >= 9; zoom -= 1) {
    const candidate = points.map((point) => mercatorProject(point, zoom));
    const xs = candidate.map((point) => point.x);
    const ys = candidate.map((point) => point.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);

    if (
      spanX <= routeCanvas.width - routeCanvas.padding * 2 &&
      spanY <= routeCanvas.height - routeCanvas.padding * 2
    ) {
      selectedZoom = zoom;
      projected = candidate;
      break;
    }

    if (zoom === 9) {
      selectedZoom = zoom;
      projected = candidate;
    }
  }

  const xs = projected.map((point) => point.x);
  const ys = projected.map((point) => point.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const routePoints = projected
    .map((point) => `${(routeCanvas.width / 2 + point.x - centerX).toFixed(1)},${(routeCanvas.height / 2 + point.y - centerY).toFixed(1)}`)
    .join(" ");
  const start = projected[0];
  const end = projected[projected.length - 1];
  const toViewPoint = (point: { x: number; y: number }) => ({
    x: routeCanvas.width / 2 + point.x - centerX,
    y: routeCanvas.height / 2 + point.y - centerY
  });

  const centerTileX = Math.floor(centerX / routeCanvas.tileSize);
  const centerTileY = Math.floor(centerY / routeCanvas.tileSize);
  const tiles = [];
  const maxTile = 2 ** selectedZoom;

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const tileX = centerTileX + dx;
      const tileY = centerTileY + dy;
      if (tileX < 0 || tileY < 0 || tileX >= maxTile || tileY >= maxTile) continue;
      tiles.push({
        key: `${selectedZoom}-${tileX}-${tileY}`,
        x: tileX,
        y: tileY,
        left: routeCanvas.width / 2 + tileX * routeCanvas.tileSize - centerX,
        top: routeCanvas.height / 2 + tileY * routeCanvas.tileSize - centerY
      });
    }
  }

  return {
    zoom: selectedZoom,
    routePoints,
    start: toViewPoint(start),
    end: toViewPoint(end),
    tiles
  };
}

function RoadRoutePreview({
  routeSnapshot,
  isRouteLoading,
  routeError
}: {
  routeSnapshot: RouteSnapshot | null;
  isRouteLoading?: boolean;
  routeError?: string | null;
}) {
  const decodedPoints = decodePolyline(routeSnapshot?.route_polyline);
  const routeMap = buildRouteMap(decodedPoints);

  if (isRouteLoading) {
    return (
      <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-background/45">
        <div className="absolute inset-0 animate-pulse bg-white/[0.06]" />
        <span className="relative text-xs font-semibold text-muted-foreground">Menghitung rute jalan...</span>
      </div>
    );
  }

  if (!routeMap) {
    return (
      <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-background/45 px-4 text-center">
        <p className="text-xs font-medium text-muted-foreground">
          {routeError || "Rute jalan akan tampil setelah pickup dan tujuan lengkap."}
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-24 overflow-hidden rounded-xl border border-white/10 bg-background/45">
      <div
        className="absolute left-1/2 top-1/2 overflow-hidden"
        style={{
          width: routeCanvas.width,
          height: routeCanvas.height,
          transform: "translate(-50%, -50%)"
        }}
      >
        {routeMap.tiles.map((tile) => (
          <img
            key={tile.key}
            alt=""
            aria-hidden="true"
            src={`${apiBaseUrl}/maps/tiles/${routeMap.zoom}/${tile.x}/${tile.y}.png`}
            className="absolute max-w-none select-none"
            draggable={false}
            style={{
              left: tile.left,
              top: tile.top,
              width: routeCanvas.tileSize,
              height: routeCanvas.tileSize
            }}
          />
        ))}
        <div className="absolute inset-0 bg-black/20" />
        <svg
          viewBox={`0 0 ${routeCanvas.width} ${routeCanvas.height}`}
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label="Preview rute jalan pengiriman"
        >
          <polyline
            points={routeMap.routePoints}
            fill="none"
            stroke="rgba(6, 78, 59, 0.65)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="8"
          />
          <polyline
            points={routeMap.routePoints}
            fill="none"
            stroke="#10b981"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4"
          />
          <circle cx={routeMap.start.x} cy={routeMap.start.y} r="7" fill="#10b981" stroke="#ecfdf5" strokeWidth="3" />
          <circle cx={routeMap.end.x} cy={routeMap.end.y} r="7" fill="#f97316" stroke="#fff7ed" strokeWidth="3" />
        </svg>
        <div className="absolute bottom-1 left-2 rounded bg-white/75 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
          © OpenStreetMap contributors
        </div>
      </div>
    </div>
  );
}

export function OrderSummary({ isLoading, isRouteLoading, routePreview, routeError, pricing, isValid }: OrderSummaryProps) {
  const surgeAmount = pricing?.dynamic_price_idr || 0;
  const routeSnapshot = pricing?.route_snapshot || routePreview || null;
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
  const hasRouteEstimate = Boolean(routeSnapshot || pricing);

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
                  {hasRouteEstimate
                    ? `${routeDistanceKm ? `${routeDistanceKm.toFixed(1)} km` : "Jarak dihitung"}${routeEtaMinutes ? ` • ~${routeEtaMinutes} menit` : ""}`
                    : "Lengkapi alamat untuk estimasi."}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              {routeProvider}
            </span>
          </div>
          <RoadRoutePreview routeSnapshot={routeSnapshot} isRouteLoading={isRouteLoading} routeError={routeError} />
          {!pricing && hasRouteEstimate && (!hasRouteGeometry || routeSnapshot?.fallback_reason) && (
            <p className="mt-3 text-xs text-muted-foreground">
              Preview rute ini untuk estimasi jarak. Harga final muncul setelah detail pengiriman lengkap.
            </p>
          )}
          {pricing && !hasRouteGeometry && (
            <p className="mt-3 text-xs text-muted-foreground">
              Harga final sudah dihitung backend. Visual rute belum tersedia dari provider aktif.
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
