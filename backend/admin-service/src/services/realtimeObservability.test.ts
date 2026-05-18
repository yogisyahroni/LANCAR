jest.mock('../redis', () => ({
  redis: {
    incrbyfloat: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  },
}));

import {
  evaluateOnDemandRealtimeAlerts,
  recordPushDelivery,
  recordRealtimeEventDelivery,
  recordRealtimeMetric,
} from './realtimeObservability';
import { redis } from '../redis';

describe('on-demand realtime observability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records structured metrics into Redis with safe bounded keys', async () => {
    await recordRealtimeMetric('tracking_emit_latency_ms', {
      stage: 'kurir_menuju_pickup',
      weird: 'value with spaces and symbols !@#',
    }, 123);

    expect(redis.incrbyfloat).toHaveBeenCalledWith(
      expect.stringContaining('metrics:on_demand_realtime:tracking_emit_latency_ms:'),
      123,
    );
    expect(redis.expire).toHaveBeenCalledWith(expect.any(String), 86400);
  });

  it('records tracking latency and push delivery attention without throwing', () => {
    const oldTimestamp = new Date(Date.now() - 45_000).toISOString();

    recordRealtimeEventDelivery('tracking_updated', {
      order_id: 'order-1',
      customer_id: 'customer-1',
      courier_user_id: 'courier-1',
      stage: 'tracking',
      location: { timestamp: oldTimestamp },
    });

    recordPushDelivery({
      user_id: 'customer-1',
      type: 'courier_assigned',
      order_id: 'order-1',
      device_count: 1,
      success_count: 0,
      failure_count: 1,
    });

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('"event":"tracking_emit_latency_high"'));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('"event":"push_delivery_attention"'));
  });

  it('writes order alerts for stale tracking and accepted orders without customer-visible location', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            order_id: 'order-stale',
            status: 'in_transit',
            last_location_at: '2026-05-18T04:00:00.000Z',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            order_id: 'order-no-location',
            status: 'accepted',
            updated_at: '2026-05-18T04:05:00.000Z',
          }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    await evaluateOnDemandRealtimeAlerts(client);

    const insertedAlerts = client.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO order_events'));
    expect(insertedAlerts).toHaveLength(2);
    expect(insertedAlerts[0][1][0]).toBe('order-stale');
    expect(insertedAlerts[0][1][2]).toContain('tracking_update_stale');
    expect(insertedAlerts[1][1][0]).toBe('order-no-location');
    expect(insertedAlerts[1][1][2]).toContain('accepted_without_customer_tracking_update');
  });
});
