-- +goose Up

-- APP-2026-012: keep the canonical experience event stream queryable for the
-- one-hour guardrail window and dashboard release breakdowns. The event
-- payload remains the source of truth; these are query accelerators only.
CREATE INDEX IF NOT EXISTS idx_event_outbox_experience_observability
  ON event_outbox (occurred_at, event_type, market_code)
  WHERE aggregate_type IN ('experience_banner', 'experience_runtime')
    AND event_type LIKE 'experience.%';

CREATE INDEX IF NOT EXISTS idx_event_outbox_experience_release
  ON event_outbox (
    occurred_at,
    (payload->>'manifest_id'),
    (payload->>'manifest_revision'),
    market_code
  )
  WHERE aggregate_type IN ('experience_banner', 'experience_runtime')
    AND event_type LIKE 'experience.%';

-- +goose Down
DROP INDEX IF EXISTS idx_event_outbox_experience_release;
DROP INDEX IF EXISTS idx_event_outbox_experience_observability;
