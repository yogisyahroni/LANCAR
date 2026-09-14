jest.mock('../db', () => ({
  db: { query: jest.fn() },
  readDb: { query: jest.fn() },
}));

import { db } from '../db';
import { experienceKillSwitchInputSchema, isExperienceKillSwitchActive } from './experienceKillSwitches';

const base = {
  name: 'Food operational control',
  description: 'Controlled service availability action',
  service_code: 'food_delivery',
  market_codes: ['id-jk'],
  city_codes: [],
  zone_codes: [],
  preserve_active_orders: true,
  active: true,
  reason: 'Provider timeout incident',
  rollback_plan: 'Verify provider health and restore after the incident is resolved.',
};

describe('experience kill switch schema', () => {
  it.each([
    ['marketing_hide', 'hide_entry'],
    ['new_order_gate', 'reject_new_orders'],
    ['provider_gate', 'use_provider_fallback'],
    ['checkout_gate', 'reject_checkout'],
  ] as const)('accepts typed control %s with fallback %s', (kill_switch_type, fallback_behavior) => {
    expect(experienceKillSwitchInputSchema.parse({ ...base, kill_switch_type, fallback_behavior })).toMatchObject({ kill_switch_type, fallback_behavior });
  });

  it('rejects a fallback belonging to another semantic type', () => {
    expect(experienceKillSwitchInputSchema.safeParse({ ...base, kill_switch_type: 'marketing_hide', fallback_behavior: 'reject_new_orders' }).success).toBe(false);
  });

  it('requires expiry after start and a meaningful rollback plan', () => {
    expect(experienceKillSwitchInputSchema.safeParse({
      ...base,
      kill_switch_type: 'new_order_gate',
      starts_at: '2026-09-10T10:00:00.000Z',
      expires_at: '2026-09-10T09:00:00.000Z',
      fallback_behavior: 'reject_new_orders',
    }).success).toBe(false);
    expect(experienceKillSwitchInputSchema.safeParse({
      ...base,
      kill_switch_type: 'new_order_gate',
      rollback_plan: 'short',
      fallback_behavior: 'reject_new_orders',
    }).success).toBe(false);
  });
});

describe('transactional new-order gate evaluation', () => {
  const query = db.query as jest.Mock;

  beforeEach(() => query.mockReset());

  it('matches an active scoped new-order gate', async () => {
    query.mockResolvedValue({ rows: [{ is_enabled: true, config: {
      control_plane: 'experience',
      kill_switch_type: 'new_order_gate',
      service_code: 'food_delivery',
      market_codes: ['id-jk'],
      city_codes: ['jakarta'],
      preserve_active_orders: true,
    } }] });

    await expect(isExperienceKillSwitchActive({
      kill_switch_type: 'new_order_gate',
      service_code: 'food_delivery',
      market_code: 'id-jk',
      city_code: 'jakarta',
    })).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("config->>'kill_switch_type' = $1"), ['new_order_gate']);
  });

  it('does not gate a different city or an expired control', async () => {
    query.mockResolvedValue({ rows: [
      { is_enabled: true, config: { service_code: 'food_delivery', market_codes: ['id-jk'], city_codes: ['bandung'] } },
      { is_enabled: true, config: { service_code: 'food_delivery', market_codes: ['id-jk'], expires_at: '2026-01-01T00:00:00.000Z' } },
    ] });

    await expect(isExperienceKillSwitchActive({
      kill_switch_type: 'new_order_gate',
      service_code: 'food_delivery',
      market_code: 'id-jk',
      city_code: 'jakarta',
    })).resolves.toBe(false);
  });
});
