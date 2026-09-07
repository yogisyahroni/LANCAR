export type PickupLocationQualityInput = {
  pickup: { lat: number; lng: number } | null;
  reference: { lat: number; lng: number } | null;
  accuracyM?: number | null;
  source?: string | null;
};

export type PickupLocationQuality = {
  state: 'verified' | 'low_accuracy' | 'pin_mismatch' | 'invalid';
  accuracy_m: number | null;
  distance_from_reference_m: number | null;
  needs_correction: boolean;
  reason: string | null;
};

export const PICKUP_LOW_ACCURACY_M = 100;
export const PICKUP_PIN_MISMATCH_M = 150;

const isCoordinate = (point: { lat: number; lng: number } | null): point is { lat: number; lng: number } => (
  point !== null
  && Number.isFinite(point.lat)
  && Number.isFinite(point.lng)
  && point.lat >= -90
  && point.lat <= 90
  && point.lng >= -180
  && point.lng <= 180
  && !(point.lat === 0 && point.lng === 0)
);

export const distanceMeters = (
  first: { lat: number; lng: number },
  second: { lat: number; lng: number },
): number => {
  const radius = 6_371_000;
  const lat1 = first.lat * Math.PI / 180;
  const lat2 = second.lat * Math.PI / 180;
  const deltaLat = (second.lat - first.lat) * Math.PI / 180;
  const deltaLng = (second.lng - first.lng) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const evaluatePickupLocationQuality = (input: PickupLocationQualityInput): PickupLocationQuality => {
  const accuracyM = Number.isFinite(input.accuracyM) && Number(input.accuracyM) >= 0 ? Number(input.accuracyM) : null;
  if (!isCoordinate(input.pickup)) {
    return { state: 'invalid', accuracy_m: accuracyM, distance_from_reference_m: null, needs_correction: true, reason: 'pickup_coordinate_invalid' };
  }

  const distance = isCoordinate(input.reference) ? distanceMeters(input.pickup, input.reference) : null;
  if (accuracyM !== null && accuracyM > PICKUP_LOW_ACCURACY_M) {
    return { state: 'low_accuracy', accuracy_m: accuracyM, distance_from_reference_m: distance, needs_correction: true, reason: 'pickup_accuracy_low' };
  }
  if (distance !== null && distance > PICKUP_PIN_MISMATCH_M) {
    return { state: 'pin_mismatch', accuracy_m: accuracyM, distance_from_reference_m: Math.round(distance), needs_correction: true, reason: 'pickup_pin_mismatch' };
  }

  return { state: 'verified', accuracy_m: accuracyM, distance_from_reference_m: distance === null ? null : Math.round(distance), needs_correction: false, reason: null };
};
