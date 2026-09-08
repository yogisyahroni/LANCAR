import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.resolve(__dirname, '../../../../database/migrations/20260908000024_canonical_event_envelope.sql'),
  'utf8',
);

describe('canonical event envelope migration', () => {
  it('adds canonical identity, governance and replay fields', () => {
    for (const field of [
      'schema_version',
      'occurred_at',
      'produced_at',
      'market_code',
      'service_name',
      'actor_pseudonymous_id',
      'entity_id',
      'correlation_id',
      'trace_id',
      'pii_classification',
      'field_pii_classification',
      'retention_class',
      'dedupe_key',
    ]) {
      expect(migration).toContain(field);
    }
    expect(migration).toContain('-- +goose Down');
    expect(migration).toContain('idx_event_outbox_dedupe');
  });
});
