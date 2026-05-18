import { buildOnDemandRealtimePayload, ON_DEMAND_REALTIME_EVENTS } from './onDemandRealtime';

describe('on-demand realtime scale contract', () => {
  it('builds thousands of room-safe tracking payloads without mutating identifiers', () => {
    const startedAt = Date.now();
    const totalOrders = 2500;
    const totalCouriers = 5000;

    for (let index = 0; index < totalOrders; index += 1) {
      const payload = buildOnDemandRealtimePayload(ON_DEMAND_REALTIME_EVENTS.TRACKING_UPDATED, {
        order_id: `order-${index}`,
        customer_id: `customer-${index}`,
        courier_user_id: `courier-${index % totalCouriers}`,
        courier_profile_id: `profile-${index % totalCouriers}`,
        stage: 'tracking',
        location: {
          latitude: -6.2 + index / 100000,
          longitude: 106.8 + index / 100000,
          accuracy: 12,
          timestamp: new Date(1_800_000_000_000 + index).toISOString(),
        },
        metadata: {
          scale_test: true,
          room: `order:order-${index}`,
        },
      });

      expect(payload.order_id).toBe(`order-${index}`);
      expect(payload.customer_id).toBe(`customer-${index}`);
      expect(payload.courier_user_id).toBe(`courier-${index % totalCouriers}`);
      expect(payload.event).toBe('tracking_updated');
      expect(payload.location?.accuracy).toBe(12);
    }

    expect(Date.now() - startedAt).toBeLessThan(5000);
  });
});
