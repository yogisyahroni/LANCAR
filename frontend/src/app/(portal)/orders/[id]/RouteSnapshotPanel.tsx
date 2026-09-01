import { Order, TrackingData } from './orderDetailTypes';
import { decodePolyline, buildSvgRoute } from './orderDetailUtils';
export function RouteSnapshotPanel({ order, tracking }: { order: Order; tracking: TrackingData | null }) {
  const snapshot = tracking?.order_route_snapshot || order.route_snapshot || null;
  const routePolyline =
    tracking?.route_polyline ||
    tracking?.order_route_polyline ||
    snapshot?.route_polyline ||
    order.route_polyline ||
    null;
  const routePoints = decodePolyline(routePolyline);
  const distanceMeters =
    tracking?.order_route_distance_meters ||
    snapshot?.distance_meters ||
    order.route_distance_meters ||
    (snapshot?.distance_km ? Math.round(snapshot.distance_km * 1000) : null);
  const durationSeconds =
    tracking?.order_route_duration_seconds ||
    snapshot?.duration_seconds ||
    order.route_duration_seconds ||
    (snapshot?.eta_minutes ? snapshot.eta_minutes * 60 : null);
  const provider =
    snapshot?.active_provider ||
    tracking?.order_route_provider ||
    tracking?.route_provider ||
    order.route_provider ||
    snapshot?.provider ||
    "runtime";
  const routeProfile = snapshot?.route_profile || tracking?.order_route_profile || order.route_profile || "on-demand";
  const distanceLabel = distanceMeters ? `${(distanceMeters / 1000).toFixed(1)} km` : "Estimasi jarak";
  const etaLabel = durationSeconds ? `~${Math.ceil(durationSeconds / 60)} menit` : snapshot?.eta || tracking?.eta || "ETA diperbarui";
  const svgPath = buildSvgRoute(routePoints);
  const hasProviderFallback = !routePolyline || Boolean(snapshot?.fallback_reason);

  const isCancelled = order.status.toLowerCase() === 'cancelled';

  return (
    <div className={`rounded-2xl border ${isCancelled ? 'border-slate-500/20 bg-slate-500/10' : 'border-brand-emerald-500/15 bg-brand-emerald-500/[0.06]'} p-4 shadow-sm`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-bold uppercase tracking-wider ${isCancelled ? 'text-slate-400' : 'text-brand-emerald-300'}`}>Route snapshot</p>
          <h3 className={`mt-1 text-base font-bold tracking-tight ${isCancelled ? 'text-slate-300' : 'text-white'}`}>{isCancelled ? 'Rute dibatalkan' : 'Rute pengiriman'}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{isCancelled ? '-' : distanceLabel} • {isCancelled ? '-' : etaLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${isCancelled ? 'bg-slate-500/20 text-slate-300' : 'bg-brand-emerald-500/10 text-brand-emerald-300'}`}>
            {provider}
          </span>
          <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {routeProfile}
          </span>
        </div>
      </div>
      <div className="relative h-36 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
        {/* Professional Map Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0f_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0f_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className={`absolute inset-0 bg-[radial-gradient(circle_at_18%_28%,${isCancelled ? 'rgba(100,116,139,0.15)' : 'rgba(16,185,129,0.18)'},transparent_28%),radial-gradient(circle_at_80%_68%,rgba(249,115,22,0.14),transparent_26%)]`} />
        
        {isCancelled ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px]">
            <p className="text-sm font-bold text-slate-300 uppercase tracking-widest text-center">RUTE DIBATALKAN</p>
            <p className="text-[10px] text-slate-500 mt-1">Sistem pelacakan dihentikan</p>
          </div>
        ) : (
          <svg viewBox="0 0 400 160" className="absolute inset-0 h-full w-full opacity-90" role="img" aria-label="Polyline rute order">
            <path
              d={svgPath}
              fill="none"
              stroke={routePoints.length >= 2 ? "#10b981" : "#64748b"}
              strokeDasharray={routePoints.length >= 2 ? "0" : "8 8"}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="6"
            />
            <circle cx="28" cy={routePoints.length >= 2 ? "112" : "112"} r="10" fill="#10b981" />
            <circle cx="372" cy={routePoints.length >= 2 ? "96" : "96"} r="10" fill="#f97316" />
          </svg>
        )}
      </div>
      {hasProviderFallback && (
        <p className="mt-3 text-xs text-muted-foreground">
          Rute sedang diperbarui. Customer dan kurir tetap memakai estimasi backend yang sama sampai provider peta mengirim geometri terbaru.
        </p>
      )}
    </div>
  );
}
