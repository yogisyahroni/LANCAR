import { normalizeMerchantOperatingStateEvent } from './merchant-operating-state-consumer';

describe('normalizeMerchantOperatingStateEvent', () => {
  it('accepts the canonical envelope and exposes only safe invalidation fields', () => {
    expect(normalizeMerchantOperatingStateEvent({
      event_id: 'evt-1',
      event_type: 'merchant.operating_state.changed',
      aggregate_id: 'merchant-1',
      occurred_at: '2026-10-04T10:00:00.000Z',
      data: {
        merchant_id: 'merchant-1',
        state: 'paused',
        previous_state: 'open',
        is_open: true,
        state_version: 12,
        reason: 'merchant_pause',
        unexpected_secret: 'must not escape',
      },
    })).toEqual({
      event_id: 'evt-1',
      event_type: 'merchant.operating_state.changed',
      merchant_id: 'merchant-1',
      previous_state: 'open',
      state: 'paused',
      is_open: true,
      reason: 'merchant_pause',
      effective_until: null,
      source: null,
      state_version: 12,
      updated_at: null,
      occurred_at: '2026-10-04T10:00:00.000Z',
    });
  });

  it('supports the legacy payload alias during envelope migration', () => {
    expect(normalizeMerchantOperatingStateEvent({
      id: 'evt-legacy',
      event_type: 'merchant.operating_state.changed',
      aggregate_id: 'merchant-2',
      payload: { state: 'open' },
    })?.merchant_id).toBe('merchant-2');
  });

  it.each([
    {},
    { event_id: 'evt', event_type: 'order.updated', data: {} },
    { event_id: 'evt', event_type: 'merchant.operating_state.changed', data: { state: 'open' } },
  ])('rejects an invalid contract: %j', (event) => {
    expect(normalizeMerchantOperatingStateEvent(event)).toBeNull();
  });
});
