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
});
