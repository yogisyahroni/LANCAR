export type RealtimeOrderEvent = {
  order_id?: string;
  orderId?: string;
  event_version?: string | number;
  eventVersion?: string | number;
};

export function realtimeOrderId(event: RealtimeOrderEvent): string | null {
  const orderId = event.order_id ?? event.orderId;
  return typeof orderId === 'string' && orderId.trim() ? orderId : null;
}

/**
 * Returns false for duplicate/older server events. Events without a version
 * remain compatible with legacy producers and are accepted.
 */
export function shouldAcceptRealtimeEvent(
  seenVersions: Map<string, number>,
  event: RealtimeOrderEvent,
): boolean {
  const orderId = realtimeOrderId(event);
  if (!orderId) return true;
  const rawVersion = event.event_version ?? event.eventVersion;
  const version = typeof rawVersion === 'number' ? rawVersion : Number(rawVersion);
  if (!Number.isFinite(version)) return true;
  const previous = seenVersions.get(orderId);
  if (previous !== undefined && version <= previous) return false;
  seenVersions.set(orderId, version);
  return true;
}
