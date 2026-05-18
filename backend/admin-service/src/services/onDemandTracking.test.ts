import { evaluateLocationQuality, resolveTrackingStage } from './onDemandTracking';

describe('on-demand tracking policy', () => {
  it('maps order status and proofs into customer-visible stages', () => {
    expect(resolveTrackingStage('pending', {
      pickup_scan_verified: false,
      pickup_photo_verified: false,
      pod_verified: false,
      pickup_cancelled: false,
    })).toBe('mencari_kurir');

    expect(resolveTrackingStage('accepted', {
      pickup_scan_verified: false,
      pickup_photo_verified: false,
      pod_verified: false,
      pickup_cancelled: false,
    })).toBe('kurir_menuju_pickup');

    expect(resolveTrackingStage('accepted', {
      pickup_scan_verified: true,
      pickup_photo_verified: true,
      pod_verified: false,
      pickup_cancelled: false,
    })).toBe('menuju_tujuan');

    expect(resolveTrackingStage('delivered', {
      pickup_scan_verified: true,
      pickup_photo_verified: true,
      pod_verified: true,
      pickup_cancelled: false,
    })).toBe('selesai');
  });

  it('rejects customer-visible updates from poor quality or suspicious locations', () => {
    const good = evaluateLocationQuality({
      latitude: -6.175392,
      longitude: 106.827153,
      accuracy: 12,
      timestamp: new Date().toISOString(),
    });
    expect(good.accepted).toBe(true);

    const poor = evaluateLocationQuality({
      latitude: -6.175392,
      longitude: 106.827153,
      accuracy: 250,
      timestamp: new Date().toISOString(),
    });
    expect(poor.accepted).toBe(false);
    expect(poor.reasons).toContain('poor_accuracy');

    const jump = evaluateLocationQuality(
      {
        latitude: -6.175392,
        longitude: 106.827153,
        accuracy: 10,
        timestamp: '2026-05-18T04:00:10.000Z',
      },
      {
        latitude: -7.257472,
        longitude: 112.752090,
        accuracy: 10,
        timestamp: '2026-05-18T04:00:00.000Z',
      }
    );
    expect(jump.accepted).toBe(false);
    expect(jump.reasons).toContain('impossible_location_jump');
  });
});
