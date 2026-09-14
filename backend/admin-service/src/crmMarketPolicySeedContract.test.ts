import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.resolve(__dirname, '../../../database/migrations/20260914000004_crm_market_policy_seed.sql'),
  'utf8',
);

describe('CRM market policy seed contract', () => {
  it('seeds only the initial market configuration without overwriting operator rows', () => {
    expect(migration).toContain("'id-jk', 'standard'");
    expect(migration).toContain("'id-jk', 'referral-2026-v1'");
    expect(migration).toContain('WHERE NOT EXISTS');
    expect(migration).toContain("SET referral_code = 'REF'");
    expect(migration).toContain('first_completed_order');
    expect(migration).toContain('anti_abuse');
    expect(migration).toContain('reviewed');
    expect(migration).toContain('compensating');
  });
});
