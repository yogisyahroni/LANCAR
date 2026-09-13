-- +goose Up
-- A review may move through moderation states, but its raw rating signal must
-- never be rewritten or deleted. Corrections are represented by moderation
-- actions/appeals and a new versioned signal, not by mutating the source.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION reject_reputation_source_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'reputation_reviews rows are append-only; use moderation or appeal actions';
  END IF;

  IF NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
     OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.service_code IS DISTINCT FROM OLD.service_code
     OR NEW.market_code IS DISTINCT FROM OLD.market_code
     OR NEW.stars IS DISTINCT FROM OLD.stars
     OR NEW.dimensions IS DISTINCT FROM OLD.dimensions
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.confidence IS DISTINCT FROM OLD.confidence
     OR NEW.signal_version IS DISTINCT FROM OLD.signal_version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'raw reputation signal fields are immutable; use a new versioned signal';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_reputation_reviews_source_immutable ON reputation_reviews;
CREATE TRIGGER trg_reputation_reviews_source_immutable
BEFORE UPDATE OR DELETE ON reputation_reviews
FOR EACH ROW EXECUTE FUNCTION reject_reputation_source_mutation();

DROP TRIGGER IF EXISTS trg_reputation_snapshots_immutable ON reputation_signal_snapshots;
CREATE TRIGGER trg_reputation_snapshots_immutable
BEFORE UPDATE OR DELETE ON reputation_signal_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_platform_financial_history_update();

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM reputation_reviews LIMIT 1)
     OR EXISTS (SELECT 1 FROM reputation_signal_snapshots LIMIT 1) THEN
    RAISE EXCEPTION 'reputation history exists; use a reviewed compensating migration';
  END IF;
END $$;
-- +goose StatementEnd
DROP TRIGGER IF EXISTS trg_reputation_snapshots_immutable ON reputation_signal_snapshots;
DROP TRIGGER IF EXISTS trg_reputation_reviews_source_immutable ON reputation_reviews;
DROP FUNCTION IF EXISTS reject_reputation_source_mutation();
