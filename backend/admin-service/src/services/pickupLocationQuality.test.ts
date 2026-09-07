import { distanceMeters, evaluatePickupLocationQuality, PICKUP_LOW_ACCURACY_M } from './pickupLocationQuality';

describe('pickup location quality', () => {
  it('requires correction for low GPS accuracy', () => {
    const quality = evaluatePickupLocationQuality({
      pickup: { lat: -6.2, lng: 106.8 },
      reference: { lat: -6.2, lng: 106.8 },
      accuracyM: PICKUP_LOW_ACCURACY_M + 1,
      source: 'gps',
    });
    expect(quality).toMatchObject({ state: 'low_accuracy', needs_correction: true, reason: 'pickup_accuracy_low' });
  });

  it('requires correction when the pin diverges from the selected place', () => {
    const quality = evaluatePickupLocationQuality({
      pickup: { lat: -6.2, lng: 106.8 },
      reference: { lat: -6.202, lng: 106.8 },
      source: 'manual',
    });
    expect(quality.state).toBe('pin_mismatch');
    expect(quality.distance_from_reference_m).toBeGreaterThan(150);
  });

  it('keeps a matching searched point verified', () => {
    const point = { lat: -6.2, lng: 106.8 };
    expect(evaluatePickupLocationQuality({ pickup: point, reference: point })).toMatchObject({
      state: 'verified',
      needs_correction: false,
      distance_from_reference_m: 0,
    });
    expect(distanceMeters(point, point)).toBe(0);
  });
});
