jest.mock('../websocket', () => ({
  getIO: jest.fn(),
}));

import { getIO } from '../websocket';
import { emitOperatingState, normalizeMerchantOperatingStateEvent } from './merchant-operating-state-consumer';
import { MERCHANT_AVAILABILITY_ROOM } from '../realtimeRooms';

const mockedGetIO = jest.mocked(getIO);

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

describe('emitOperatingState', () => {
  it('fans out a public availability invalidation without leaking internal fields', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    mockedGetIO.mockReturnValue({ to } as never);

    emitOperatingState({
      event_id: 'evt-public',
      event_type: 'merchant.operating_state.changed',
      merchant_id: 'merchant-1',
      previous_state: 'open',
      state: 'paused',
      is_open: false,
      reason: 'internal_reason',
      effective_until: '2026-10-04T12:00:00.000Z',
      source: 'admin_internal',
      state_version: 13,
      updated_at: '2026-10-04T10:00:00.000Z',
      occurred_at: '2026-10-04T10:00:00.000Z',
    });

    expect(to).toHaveBeenCalledWith(`merchant:merchant-1`);
    expect(to).toHaveBeenCalledWith(MERCHANT_AVAILABILITY_ROOM);
    expect(emit).toHaveBeenCalledWith('merchant_operating_state_changed', expect.objectContaining({
      event_id: 'evt-public',
      merchant_id: 'merchant-1',
      state: 'paused',
      is_open: false,
      state_version: 13,
    }));
    const availabilityCall = emit.mock.calls.find(([eventName, payload]) =>
      eventName === 'merchant_operating_state_changed' && payload.merchant_id === 'merchant-1' &&
      payload.reason === undefined,
    );
    expect(availabilityCall?.[1]).toEqual(expect.not.objectContaining({
      previous_state: 'open',
      reason: 'internal_reason',
      effective_until: '2026-10-04T12:00:00.000Z',
      source: 'admin_internal',
      updated_at: '2026-10-04T10:00:00.000Z',
    }));
  });
});
