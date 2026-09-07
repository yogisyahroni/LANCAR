import { evaluatePickupQuality } from '../../components/orders/pickupLocationQuality';
import { describe, expect, it } from 'vitest';

describe('pickup location quality', () => {
  it('flags low GPS accuracy before order creation', () => {
    expect(evaluatePickupQuality({ lat: -6.2, lng: 106.8, accuracy_m: 101 }, null)).toMatchObject({
      needsCorrection: true,
      reason: 'low_accuracy',
    });
  });

  it('flags a pin that moved away from the selected place', () => {
    expect(evaluatePickupQuality(
      { lat: -6.2, lng: 106.8 },
      { id: 'place', label: 'Place', address: 'Address', lat: -6.202, lng: 106.8, source: 'search', resolved_at: new Date().toISOString() },
    ).reason).toBe('pin_mismatch');
  });

  it('does not silently move a customer pin based on matching', () => {
    const selected = { id: 'place', label: 'Place', address: 'Address', lat: -6.2, lng: 106.8, source: 'search' as const, resolved_at: new Date().toISOString() };
    const result = evaluatePickupQuality({ lat: -6.2, lng: 106.8 }, selected);
    expect(result.needsCorrection).toBe(false);
    expect(selected.lat).toBe(-6.2);
    expect(selected.lng).toBe(106.8);
  });
});
