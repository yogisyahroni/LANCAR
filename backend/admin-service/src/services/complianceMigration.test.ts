import fs from 'fs';
import path from 'path';

describe('GLOB-2026-003 compliance migration contract', () => {
  const migrationPath = path.resolve(__dirname, '../../../../database/migrations/20260908000023_global_compliance_boundary.sql');
  const migration = fs.readFileSync(migrationPath, 'utf8');

  it('defines market and role scoped requirements, data policies, and artifact policies', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS market_compliance_requirements');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS market_compliance_data_policies');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS market_compliance_artifact_policies');
    expect(migration).toContain("CHECK (role_code IN ('customer', 'courier', 'merchant'))");
    expect(migration).toContain("CHECK (storage_access_class IN ('restricted', 'compliance_only'))");
  });

  it('captures immutable consent events and supports withdrawal/re-grant history', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS market_compliance_consent_events');
    expect(migration).toContain('consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
    expect(migration).toContain('actor_id UUID NOT NULL');
    expect(migration).toContain('document_version VARCHAR(64) NOT NULL');
    expect(migration).toContain('purpose VARCHAR(120) NOT NULL');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON market_compliance_consent_events');
    expect(migration).toContain('withdrawal followed by re-grant');
    expect(migration).not.toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_market_compliance_active_consent');
  });

  it('extends readiness with explicit compliance reasons and restores baseline on Down', () => {
    expect(migration).toContain("'compliance_requirements_missing'");
    expect(migration).toContain("'compliance_data_policy_missing'");
    expect(migration).toContain('-- +goose Down');
    expect(migration.match(/CREATE OR REPLACE FUNCTION market_config_readiness/g)?.length).toBe(2);
    expect(migration).not.toMatch(/FROM market_service_availability[\s\S]{0,300}effective_to/);
  });
});
