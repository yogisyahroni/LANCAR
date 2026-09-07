import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.resolve(__dirname, '../../../../database/migrations/20260907000011_geo_privacy_retention.sql'),
  'utf8',
);

describe('GEO-2026-007 retention migration contract', () => {
  it('scopes raw courier retention by market, purpose, and retention class', () => {
    expect(migration).toContain('market_code VARCHAR(32) NOT NULL DEFAULT \'ID-JK\'');
    expect(migration).toContain('purpose VARCHAR(32) NOT NULL DEFAULT \'active_delivery\'');
    expect(migration).toContain('retention_class VARCHAR(16) NOT NULL DEFAULT \'operational\'');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS geo_retention_policies');
    expect(migration).toContain('cl.market_code = policy.market_code');
    expect(migration).toContain('cl.purpose = policy.purpose');
    expect(migration).toContain('cl.retention_class = policy.retention_class');
    expect(migration).toContain('purposes are retained until an explicit policy exists');
  });

  it('provides a reversible Goose down migration and dry-run path', () => {
    expect(migration).toContain('dry_run BOOLEAN DEFAULT FALSE');
    expect(migration).toContain('-- +goose Down');
    expect(migration).toContain('DROP TABLE IF EXISTS geo_retention_policies');
  });
});
