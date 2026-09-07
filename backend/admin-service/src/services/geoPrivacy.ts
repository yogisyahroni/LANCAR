import { db } from '../db';
import { securityLog } from '../security/logRedaction';

// Three decimal places are roughly 100–110 metres at Jakarta latitudes. This
// is sufficient for public/analytics density without exposing a household pin.
export const PUBLIC_LOCATION_GRID_DEGREES = 0.001;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const configuredGeoMarket = (): string => {
  const configured = String(process.env.MARKET_CODE || 'ID-JK').trim().toUpperCase();
  return /^[A-Z0-9_-]{2,32}$/.test(configured) ? configured : 'ID-JK';
};

export const coarsenCoordinate = (value: unknown): number | null => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number((Math.round(numeric / PUBLIC_LOCATION_GRID_DEGREES) * PUBLIC_LOCATION_GRID_DEGREES).toFixed(3));
};

export const coarsenLocationRow = <T extends Record<string, unknown>>(row: T): T => {
  const coordinateKeys = [
    'pickup_latitude', 'pickup_longitude',
    'drop_latitude', 'drop_longitude',
    'courier_latitude', 'courier_longitude',
    'latitude', 'longitude', 'lat', 'lng',
  ];
  const next = { ...row } as Record<string, unknown>;
  for (const key of coordinateKeys) {
    if (key in next) next[key] = coarsenCoordinate(next[key]);
  }
  return next as T;
};

export const recordExactLocationAccess = (input: {
  actorId?: string | null;
  actorRole?: string | null;
  orderId: string;
  surface: string;
}) => {
  if (!input.actorId || !UUID_PATTERN.test(input.actorId)) return;

  // Deliberately store only the access context. Exact coordinates remain in
  // courier_locations and are never copied into audit payloads or logs.
  void Promise.resolve()
    .then(() => db.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, 'geo.exact_location.read', $2, $3)`,
      [
        input.actorId,
        input.orderId,
        JSON.stringify({
          actor_role: input.actorRole || null,
          surface: input.surface,
          purpose: 'support_or_dispute_review',
          exact_coordinates: true,
        }),
      ],
    ))
    .catch((error) => {
      securityLog.error('Failed to audit exact location access', {
        actor_id: input.actorId,
        target_id: input.orderId,
        surface: input.surface,
        error,
      });
    });
};
