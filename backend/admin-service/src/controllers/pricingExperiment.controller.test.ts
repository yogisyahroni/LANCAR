import { Request, Response } from 'express';
import { configurePricingExperiment, evaluatePricingExperiment, killPricingExperiment } from './pricingExperiment.controller';
import { db, readDb } from '../db';

jest.mock('../db', () => ({
  db: { connect: jest.fn() },
  readDb: { query: jest.fn() },
}));
jest.mock('../utils/authUtils', () => ({ getActorId: jest.fn(() => '00000000-0000-4000-8000-000000000001') }));
jest.mock('../security/logRedaction', () => ({ securityLog: { error: jest.fn(), warn: jest.fn() } }));

const key = 'marketplace_pricing_experiment_food_delivery';
const currentConfig = {
  experiment_id: 'food-pricing-guardrail-v1',
  service_code: 'food_delivery',
  market: 'default',
  enabled: false,
  killed: false,
  assignment_salt: 'salt',
  traffic_percent: 0,
  control_pricing_rule_version: 'marketplace-pricing-2026-v2',
  treatment_pricing_rule_version: 'marketplace-pricing-2026-food-treatment-v1',
  treatment_multiplier: 1.05,
  guardrails: {
    min_sample_size: 100,
    max_cancellation_delta_pp: 2,
    max_eta_increase_minutes: 5,
    max_support_contact_delta_pp: 1,
    max_courier_earnings_drop_pct: 5,
    max_margin_drop_pct: 5,
  },
};

const response = (): Response => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
} as unknown as Response);

const request = (body: Record<string, unknown>): Request => ({ params: { key }, body } as unknown as Request);

describe('pricing experiment control endpoints', () => {
  beforeEach(() => jest.clearAllMocks());

  it('activates only bounded configuration and audits the change', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    (db.connect as jest.Mock).mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ value: currentConfig }] })
      .mockResolvedValueOnce({ rows: [{ key, value: { ...currentConfig, enabled: true, traffic_percent: 10 } }] })
      .mockResolvedValueOnce({ rows: [] }) // audit
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = response();
    await configurePricingExperiment(request({ enabled: true, traffic_percent: 10 }), res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(client.query.mock.calls.some(([sql]: [string]) => String(sql).includes('INSERT INTO audit_logs'))).toBe(true);
    const updateArgs = client.query.mock.calls.find(([sql]: [string]) => String(sql).includes('UPDATE system_configs'))?.[1] as unknown[];
    expect(JSON.parse(String(updateArgs[0]))).toEqual(expect.objectContaining({ enabled: true, traffic_percent: 10 }));
  });

  it('kills the experiment without touching active order snapshots', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    (db.connect as jest.Mock).mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ value: { ...currentConfig, enabled: true, traffic_percent: 10 } }] })
      .mockResolvedValueOnce({ rows: [{ key, value: { ...currentConfig, enabled: false, killed: true } }] })
      .mockResolvedValueOnce({ rows: [] }) // audit
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = response();
    await killPricingExperiment({ params: { key }, body: { reason: 'ETA guardrail breached' } } as unknown as Request, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: expect.stringContaining('active quote snapshots are unchanged'),
    }));
    const auditArgs = client.query.mock.calls.find(([sql]: [string]) => String(sql).includes('INSERT INTO audit_logs'))?.[1] as unknown[];
    expect(JSON.parse(String(auditArgs[2]))).toEqual(expect.objectContaining({ active_quote_contracts_unchanged: true }));
  });

  it('evaluates guardrails from server-side order/ledger aggregates', async () => {
    (readDb.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ value: currentConfig }] })
      .mockResolvedValueOnce({ rows: [
        { variant: 'control', sample_size: 100, cancellation_rate_pct: 5, eta_delta_minutes: 1, support_contact_rate_pct: 2, courier_earnings_avg_idr: 20000, margin_avg_idr: 5000 },
        { variant: 'treatment', sample_size: 100, cancellation_rate_pct: 9, eta_delta_minutes: 8, support_contact_rate_pct: 4, courier_earnings_avg_idr: 18000, margin_avg_idr: 4000 },
      ] });

    const res = response();
    await evaluatePricingExperiment({ params: { key }, body: { window_hours: 24 } } as unknown as Request, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, data: expect.objectContaining({ decision: expect.objectContaining({ approved: false }) }) }));
  });
});
