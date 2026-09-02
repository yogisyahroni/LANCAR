import { describe, expect, it } from 'vitest';
import { shouldAcceptRealtimeEvent } from './realtimeEventGuard';

describe('shouldAcceptRealtimeEvent', () => {
  it('accepts increasing versions and rejects duplicates/older events', () => {
    const seen = new Map<string, number>();
    expect(shouldAcceptRealtimeEvent(seen, { order_id: 'o-1', event_version: '2' })).toBe(true);
    expect(shouldAcceptRealtimeEvent(seen, { order_id: 'o-1', event_version: 2 })).toBe(false);
    expect(shouldAcceptRealtimeEvent(seen, { order_id: 'o-1', event_version: 1 })).toBe(false);
    expect(shouldAcceptRealtimeEvent(seen, { order_id: 'o-1', event_version: 3 })).toBe(true);
  });

  it('keeps legacy unversioned events compatible', () => {
    expect(shouldAcceptRealtimeEvent(new Map(), { order_id: 'o-1' })).toBe(true);
  });
});
