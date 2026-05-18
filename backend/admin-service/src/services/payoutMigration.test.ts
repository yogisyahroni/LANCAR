import fs from 'fs';
import path from 'path';

const migration = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../../database/migrations', name), 'utf8');

describe('courier payout migrations', () => {
  it('keeps payout request creation guarded against double payouts', () => {
    const sql = migration('20260518000002_courier_payout_api_security.sql');

    expect(sql).toContain('pg_advisory_xact_lock(hashtext(p_courier_id::text))');
    expect(sql).toContain('WHERE courier_id = p_courier_id');
    expect(sql).toContain('AND idempotency_key = p_idempotency_key');
    expect(sql).toContain('INSERT INTO courier_earnings_ledger');
    expect(sql).toContain("'payout_requested'");
  });

  it('adds enterprise audit fields and alert event types', () => {
    const sql = migration('20260518000003_courier_payout_audit_observability.sql');

    expect(sql).toContain('actor_id UUID');
    expect(sql).toContain('actor_role VARCHAR(40)');
    expect(sql).toContain('old_status VARCHAR(40)');
    expect(sql).toContain('new_status VARCHAR(40)');
    expect(sql).toContain("'account_status_changed'");
    expect(sql).toContain("'request_status_changed'");
    expect(sql).toContain("'observability_alert'");
    expect(sql).toContain("'saldo_mismatch_detected'");
  });

  it('adds risk engine decisions and automatic approval statuses', () => {
    const sql = migration('20260518000004_courier_payout_risk_engine.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS courier_payout_risk_decisions');
    expect(sql).toContain("'risk_screening'");
    expect(sql).toContain("'approved_auto'");
    expect(sql).toContain("'risk_hold'");
    expect(sql).toContain("'manual_review'");
    expect(sql).toContain("'risk_decision_created'");
    expect(sql).toContain("status := 'risk_screening'");
  });

  it('adds payout provider dispatch audit and webhook idempotency', () => {
    const sql = migration('20260518000005_courier_payout_provider_dispatch.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS courier_payout_dispatches');
    expect(sql).toContain('idempotency_key TEXT NOT NULL UNIQUE');
    expect(sql).toContain('request_payload_hash TEXT NOT NULL');
    expect(sql).toContain('response_hash TEXT');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS courier_payout_provider_webhook_events');
    expect(sql).toContain('provider_event_id TEXT NOT NULL');
    expect(sql).toContain("'payout_dispatch_created'");
    expect(sql).toContain("'payout_provider_callback'");
    expect(sql).toContain("'payout_provider_signature_failed'");
  });

  it('adds payout velocity limits and emergency kill switch configs', () => {
    const sql = migration('20260518000006_courier_payout_limits_kill_switch.sql');

    expect(sql).toContain('payout_emergency_kill_switch_enabled');
    expect(sql).toContain('payout_bank_hourly_request_limit');
    expect(sql).toContain('payout_device_hourly_request_limit');
    expect(sql).toContain('payout_ip_hourly_request_limit');
    expect(sql).toContain('payout_bank_daily_auto_limit_idr');
    expect(sql).toContain('payout_provider_daily_limit_idr');
    expect(sql).toContain('idx_courier_payout_risk_decisions_device');
    expect(sql).toContain('idx_courier_payout_risk_decisions_ip');
  });

  it('adds payout reconciliation runs and ops alert configs', () => {
    const sql = migration('20260518000007_courier_payout_reconciliation_ops.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS courier_payout_reconciliation_runs');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS courier_payout_reconciliation_items');
    expect(sql).toContain('ledger_vs_request');
    expect(sql).toContain('request_vs_provider');
    expect(sql).toContain('paid_amount_vs_ledger');
    expect(sql).toContain('provider_latency_high');
    expect(sql).toContain('pending_too_long');
    expect(sql).toContain('webhook_missing');
    expect(sql).toContain('payout_reconciliation_run');
  });
});
