import { AddressPoint, LocationValue } from './OrderSchemas';

export const PICKUP_LOW_ACCURACY_M = 100;
export const PICKUP_PIN_MISMATCH_M = 150;

export type PickupQuality = {
  needsCorrection: boolean;
  reason: 'low_accuracy' | 'pin_mismatch' | null;
  distanceM: number | null;
};

const distanceMeters = (first: LocationValue, second: LocationValue) => {
  const radius = 6_371_000;
  const lat1 = first.lat * Math.PI / 180;
  const lat2 = second.lat * Math.PI / 180;
  const deltaLat = (second.lat - first.lat) * Math.PI / 180;
  const deltaLng = (second.lng - first.lng) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const evaluatePickupQuality = (location?: LocationValue | null, point?: AddressPoint | null): PickupQuality => {
  if (!location) return { needsCorrection: true, reason: 'pin_mismatch', distanceM: null };
  const accuracyM = Number(location.accuracy_m ?? point?.accuracy_m);
  if (Number.isFinite(accuracyM) && accuracyM > PICKUP_LOW_ACCURACY_M) {
    return { needsCorrection: true, reason: 'low_accuracy', distanceM: null };
  }
  if (point) {
    const distanceM = distanceMeters(location, point);
    if (distanceM > PICKUP_PIN_MISMATCH_M) {
      return { needsCorrection: true, reason: 'pin_mismatch', distanceM: Math.round(distanceM) };
    }
    return { needsCorrection: false, reason: null, distanceM: Math.round(distanceM) };
  }
  return { needsCorrection: false, reason: null, distanceM: null };
};
