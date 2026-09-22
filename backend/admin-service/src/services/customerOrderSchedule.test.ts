import {
  CustomerOrderScheduleError,
  normalizeCustomerOrderSchedule,
  paidCustomerOrderStatus,
  scheduledPickupLeadMinutes,
} from './customerOrderSchedule';

describe('customer order scheduling', () => {
  const now = new Date('2026-09-21T10:00:00.000Z');

  it('normalizes an immediate pickup without carrying a stale timestamp', () => {
    expect(normalizeCustomerOrderSchedule('now', '2026-09-30T10:00:00.000Z', { now })).toEqual({
      scheduleType: 'now',
      scheduledAt: null,
    });
  });

  it('requires at least the product lead time for a scheduled pickup', () => {
    expect(() => normalizeCustomerOrderSchedule('scheduled', '2026-09-21T10:29:59.999Z', { now }))
      .toThrow('minimal 30 menit');
    expect(normalizeCustomerOrderSchedule('scheduled', '2026-09-21T10:30:00.000Z', { now }).scheduledAt)
      .toEqual(new Date('2026-09-21T10:30:00.000Z'));
    expect(scheduledPickupLeadMinutes).toBe(30);
  });

  it('rejects scheduled pickup when the service capability is disabled', () => {
    expect(() => normalizeCustomerOrderSchedule('scheduled', '2026-09-21T11:00:00.000Z', {
      now,
      allowScheduled: false,
    })).toThrow(CustomerOrderScheduleError);
  });

  it('keeps scheduled orders out of immediate dispatch for both parcel and food status callers', () => {
    const schedule = normalizeCustomerOrderSchedule('scheduled', '2026-09-21T11:00:00.000Z', { now });
    expect(paidCustomerOrderStatus(schedule, false)).toBe('scheduled');
    expect(paidCustomerOrderStatus(schedule, true)).toBe('scheduled');
    expect(paidCustomerOrderStatus(normalizeCustomerOrderSchedule('now', null, { now }), false)).toBe('pending');
  });
});
