-- +goose Up
-- MERCH-2026-006: versioned merchant quality scorecard, explicit eligibility
-- policy, reviewed policy/safety inputs, and an auditable appeal lifecycle.

CREATE TABLE IF NOT EXISTS merchant_quality_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version VARCHAR(100) NOT NULL,
  market_code VARCHAR(32) NOT NULL DEFAULT '*',
  window_days INTEGER NOT NULL CHECK (window_days BETWEEN 1 AND 365),
  minimum_orders INTEGER NOT NULL DEFAULT 0 CHECK (minimum_orders >= 0),
  acceptance_weight NUMERIC(6,5) NOT NULL CHECK (acceptance_weight BETWEEN 0 AND 1),
  prep_accuracy_weight NUMERIC(6,5) NOT NULL CHECK (prep_accuracy_weight BETWEEN 0 AND 1),
  item_availability_weight NUMERIC(6,5) NOT NULL CHECK (item_availability_weight BETWEEN 0 AND 1),
  customer_review_weight NUMERIC(6,5) NOT NULL CHECK (customer_review_weight BETWEEN 0 AND 1),
  refund_cancel_weight NUMERIC(6,5) NOT NULL CHECK (refund_cancel_weight BETWEEN 0 AND 1),
  safety_policy_weight NUMERIC(6,5) NOT NULL CHECK (safety_policy_weight BETWEEN 0 AND 1),
  search_min_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (search_min_score BETWEEN 0 AND 100),
  ads_min_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (ads_min_score BETWEEN 0 AND 100),
  apply_to_search BOOLEAN NOT NULL DEFAULT FALSE,
  apply_to_ads BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  CHECK (ABS((acceptance_weight + prep_accuracy_weight + item_availability_weight +
              customer_review_weight + refund_cancel_weight + safety_policy_weight) - 1.0) < 0.00001),
  UNIQUE (policy_version, market_code)
);

CREATE INDEX IF NOT EXISTS idx_merchant_quality_policies_active
  ON merchant_quality_policies (market_code, is_active, effective_from DESC);

-- Only reviewed safety/policy findings affect the score. The source is kept
-- explicit so a future issue type can be added without changing score math.
CREATE TABLE IF NOT EXISTS merchant_quality_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  issue_code VARCHAR(80) NOT NULL,
  severity_points INTEGER NOT NULL DEFAULT 0 CHECK (severity_points BETWEEN 0 AND 100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'dismissed')),
  source_type VARCHAR(80) NOT NULL,
  source_id VARCHAR(120) NOT NULL,
  summary TEXT NOT NULL CHECK (char_length(trim(summary)) BETWEEN 1 AND 2000),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_merchant_quality_review_events_score
  ON merchant_quality_review_events (merchant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS merchant_quality_scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  market_code VARCHAR(32) NOT NULL,
  policy_id UUID NOT NULL REFERENCES merchant_quality_policies(id) ON DELETE RESTRICT,
  scorecard_version VARCHAR(100) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  score NUMERIC(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  component_scores JSONB NOT NULL,
  evidence_counts JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (window_end > window_start)
);

CREATE INDEX IF NOT EXISTS idx_merchant_quality_scorecards_latest
  ON merchant_quality_scorecards (merchant_id, market_code, computed_at DESC);

CREATE TABLE IF NOT EXISTS merchant_quality_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  scorecard_id UUID NOT NULL REFERENCES merchant_quality_scorecards(id) ON DELETE RESTRICT,
  metric_code VARCHAR(80) NOT NULL CHECK (metric_code IN (
    'acceptance_timeout', 'prep_accuracy', 'item_availability',
    'customer_review', 'refund_cancel', 'safety_policy', 'overall'
  )),
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) BETWEEN 10 AND 2000),
  status VARCHAR(20) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'in_review', 'approved', 'rejected')),
  review_note TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_role VARCHAR(80),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_quality_appeals_merchant
  ON merchant_quality_appeals (merchant_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_quality_appeals_open
  ON merchant_quality_appeals (merchant_id, scorecard_id, metric_code)
  WHERE status IN ('submitted', 'in_review');

-- Scorecards are evidence snapshots. Corrections are represented by a newer
-- snapshot, never by rewriting historical evidence.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION prevent_merchant_quality_scorecard_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'merchant quality scorecards are immutable; create a new snapshot';
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_prevent_merchant_quality_scorecard_mutation ON merchant_quality_scorecards;
CREATE TRIGGER trg_prevent_merchant_quality_scorecard_mutation
BEFORE UPDATE OR DELETE ON merchant_quality_scorecards
FOR EACH ROW EXECUTE FUNCTION prevent_merchant_quality_scorecard_mutation();

-- Existing catalog moderation is a reviewed policy input. A rejection becomes
-- a confirmed issue; a later approval dismisses the same source finding.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION sync_merchant_quality_menu_review()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.moderation_status = 'rejected' THEN
    INSERT INTO merchant_quality_review_events (
      merchant_id, issue_code, severity_points, status, source_type, source_id,
      summary, reviewed_by, reviewed_at
    ) VALUES (
      NEW.merchant_id, 'policy_menu_rejected', 20, 'confirmed',
      'merchant_menu_item', NEW.id::text,
      COALESCE(NULLIF(NEW.moderation_reason, ''), 'Menu ditolak saat review kebijakan'),
      NEW.moderated_by, COALESCE(NEW.moderated_at, NOW())
    )
    ON CONFLICT (merchant_id, source_type, source_id) DO UPDATE SET
      issue_code = EXCLUDED.issue_code,
      severity_points = EXCLUDED.severity_points,
      status = 'confirmed',
      summary = EXCLUDED.summary,
      reviewed_by = EXCLUDED.reviewed_by,
      reviewed_at = EXCLUDED.reviewed_at,
      updated_at = NOW();
  ELSIF NEW.moderation_status = 'approved' THEN
    UPDATE merchant_quality_review_events
    SET status = 'dismissed', reviewed_by = NEW.moderated_by,
        reviewed_at = COALESCE(NEW.moderated_at, NOW()), updated_at = NOW()
    WHERE merchant_id = NEW.merchant_id
      AND source_type = 'merchant_menu_item'
      AND source_id = NEW.id::text
      AND status = 'confirmed';
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_sync_merchant_quality_menu_review ON merchant_menu_items;
CREATE TRIGGER trg_sync_merchant_quality_menu_review
AFTER INSERT OR UPDATE OF moderation_status, moderation_reason, moderated_by, moderated_at
ON merchant_menu_items
FOR EACH ROW EXECUTE FUNCTION sync_merchant_quality_menu_review();

INSERT INTO merchant_quality_review_events (
  merchant_id, issue_code, severity_points, status, source_type, source_id,
  summary, reviewed_by, reviewed_at
)
SELECT merchant_id, 'policy_menu_rejected', 20, 'confirmed',
       'merchant_menu_item', id::text,
       COALESCE(NULLIF(moderation_reason, ''), 'Menu ditolak saat review kebijakan'),
       moderated_by, COALESCE(moderated_at, NOW())
FROM merchant_menu_items
WHERE moderation_status = 'rejected'
ON CONFLICT (merchant_id, source_type, source_id) DO NOTHING;

INSERT INTO merchant_quality_policies (
  policy_version, market_code, window_days, minimum_orders,
  acceptance_weight, prep_accuracy_weight, item_availability_weight,
  customer_review_weight, refund_cancel_weight, safety_policy_weight,
  search_min_score, ads_min_score, apply_to_search, apply_to_ads
) VALUES (
  'merchant-quality-v1', '*', 30, 0,
  0.20, 0.20, 0.15, 0.20, 0.15, 0.10,
  70, 70, FALSE, FALSE
)
ON CONFLICT (policy_version, market_code) DO NOTHING;

-- Live calculation uses the authoritative order, refund, item, rating, and
-- reviewed-policy facts. It is also used by discovery gating, so a stale
-- client-provided score can never decide eligibility.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION merchant_quality_calculate(
  p_merchant_id UUID,
  p_policy_id UUID
)
RETURNS TABLE (
  market_code VARCHAR,
  score NUMERIC,
  acceptance_score NUMERIC,
  prep_accuracy_score NUMERIC,
  item_availability_score NUMERIC,
  customer_review_score NUMERIC,
  refund_cancel_score NUMERIC,
  safety_policy_score NUMERIC,
  total_orders BIGINT,
  accepted_orders BIGINT,
  timeout_orders BIGINT,
  prep_sample_orders BIGINT,
  unavailable_items BIGINT,
  ordered_items BIGINT,
  rating_count BIGINT,
  merchant_issue_orders BIGINT,
  confirmed_policy_issues BIGINT,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  component_scores JSONB,
  evidence_counts JSONB
)
LANGUAGE SQL STABLE AS $$
WITH policy AS (
  SELECT p.*, m.market_code AS merchant_market_code
  FROM merchant_quality_policies p
  JOIN merchants m ON m.id = p_merchant_id
  WHERE p.id = p_policy_id AND p.is_active
),
base_orders AS (
  SELECT o.*,
         (o.merchant_accepted_at IS NULL
          AND o.reject_reason IS NULL
          AND COALESCE(o.cancellation_reason, '') ~* '(pelanggan|customer|sebelum diproses)') AS customer_cancel,
         (o.merchant_accepted_at IS NULL
          AND (COALESCE(o.reject_reason, '') ~* 'timeout|time_out|waktu[_ ]habis|tidak[_ ]merespon'
               OR COALESCE(o.cancellation_reason, '') ~* 'timeout|time_out|waktu[_ ]habis|tidak[_ ]merespon')) AS timeout_order
  FROM orders o
  CROSS JOIN policy p
  WHERE o.merchant_id = p_merchant_id
    AND o.service_sub_type = 'food_delivery'
    AND o.created_at >= NOW() - make_interval(days => p.window_days)
),
order_stats AS (
  SELECT COUNT(*) AS total_orders,
         COUNT(*) FILTER (WHERE merchant_accepted_at IS NOT NULL) AS accepted_orders,
         COUNT(*) FILTER (WHERE timeout_order) AS timeout_orders,
         COUNT(*) FILTER (WHERE customer_cancel) AS customer_cancel_orders
  FROM base_orders
),
prep_stats AS (
  SELECT COUNT(*) FILTER (WHERE food_ready_at IS NOT NULL AND merchant_accepted_at IS NOT NULL
                           AND prep_time_minutes IS NOT NULL) AS prep_sample_orders,
         COUNT(*) FILTER (WHERE food_ready_at IS NOT NULL AND merchant_accepted_at IS NOT NULL
                           AND prep_time_minutes IS NOT NULL
                           AND food_ready_at <= merchant_accepted_at + make_interval(mins => prep_time_minutes)) AS prep_on_time_orders
  FROM base_orders
),
item_stats AS (
  SELECT COALESCE((SELECT SUM(i.quantity)::BIGINT FROM food_order_items i
                   JOIN base_orders o ON o.id = i.order_id), 0)::BIGINT AS ordered_items,
         COALESCE((SELECT SUM(u.quantity)::BIGINT FROM food_item_unavailable u
                   JOIN base_orders o ON o.id = u.order_id), 0)::BIGINT AS unavailable_items
),
rating_stats AS (
  SELECT COUNT(*)::BIGINT AS rating_count, COALESCE(AVG(r.stars), 0)::NUMERIC AS avg_stars
  FROM merchant_ratings r
  CROSS JOIN policy p
  WHERE r.merchant_id = p_merchant_id
    AND r.created_at >= NOW() - make_interval(days => p.window_days)
),
merchant_issue_stats AS (
  SELECT COUNT(DISTINCT o.id)::BIGINT AS merchant_issue_orders
  FROM base_orders o
  LEFT JOIN refunds rf ON rf.order_id = o.id
  WHERE o.reject_reason IS NOT NULL
     OR COALESCE(o.cancellation_reason, '') ~* '(merchant|resto|stok|tidak tersedia|unavailable)'
     OR COALESCE(rf.reason, '') ~* '(merchant|resto|stok|tidak tersedia|unavailable)'
),
policy_issue_stats AS (
  SELECT COUNT(*)::BIGINT AS confirmed_policy_issues,
         COALESCE(SUM(e.severity_points), 0)::NUMERIC AS severity_points
  FROM merchant_quality_review_events e
  CROSS JOIN policy p
  WHERE e.merchant_id = p_merchant_id
    AND e.status = 'confirmed'
    AND COALESCE(e.reviewed_at, e.created_at) >= NOW() - make_interval(days => p.window_days)
),
metrics AS (
  SELECT p.*, os.*, ps.prep_sample_orders, ps.prep_on_time_orders,
         ist.ordered_items, ist.unavailable_items, rs.rating_count, rs.avg_stars,
         mis.merchant_issue_orders, pis.confirmed_policy_issues, pis.severity_points,
         CASE WHEN (os.total_orders - os.customer_cancel_orders) > 0
              THEN GREATEST(0::NUMERIC, LEAST(100::NUMERIC,
                   (os.accepted_orders - os.timeout_orders)::NUMERIC
                   / (os.total_orders - os.customer_cancel_orders)::NUMERIC * 100))
              ELSE 100::NUMERIC END AS acceptance_score,
         CASE WHEN ps.prep_sample_orders > 0
              THEN ps.prep_on_time_orders::NUMERIC / ps.prep_sample_orders::NUMERIC * 100
              ELSE 100::NUMERIC END AS prep_accuracy_score,
         CASE WHEN ist.ordered_items > 0
              THEN GREATEST(0::NUMERIC, LEAST(100::NUMERIC,
                   (ist.ordered_items - ist.unavailable_items)::NUMERIC
                   / ist.ordered_items::NUMERIC * 100))
              ELSE 100::NUMERIC END AS item_availability_score,
         CASE WHEN rs.rating_count > 0 THEN rs.avg_stars / 5 * 100 ELSE 100::NUMERIC END AS customer_review_score,
         CASE WHEN os.total_orders > 0
              THEN GREATEST(0::NUMERIC, LEAST(100::NUMERIC,
                   100 - mis.merchant_issue_orders::NUMERIC / os.total_orders::NUMERIC * 100))
              ELSE 100::NUMERIC END AS refund_cancel_score,
         GREATEST(0::NUMERIC, LEAST(100::NUMERIC, 100 - pis.severity_points)) AS safety_policy_score
  FROM policy p
  CROSS JOIN order_stats os
  CROSS JOIN prep_stats ps
  CROSS JOIN item_stats ist
  CROSS JOIN rating_stats rs
  CROSS JOIN merchant_issue_stats mis
  CROSS JOIN policy_issue_stats pis
)
SELECT m.merchant_market_code::VARCHAR,
       ROUND(GREATEST(0::NUMERIC, LEAST(100::NUMERIC,
         m.acceptance_score * m.acceptance_weight +
         m.prep_accuracy_score * m.prep_accuracy_weight +
         m.item_availability_score * m.item_availability_weight +
         m.customer_review_score * m.customer_review_weight +
         m.refund_cancel_score * m.refund_cancel_weight +
         m.safety_policy_score * m.safety_policy_weight)), 2),
       ROUND(m.acceptance_score, 2), ROUND(m.prep_accuracy_score, 2),
       ROUND(m.item_availability_score, 2), ROUND(m.customer_review_score, 2),
       ROUND(m.refund_cancel_score, 2), ROUND(m.safety_policy_score, 2),
       m.total_orders, m.accepted_orders, m.timeout_orders, m.prep_sample_orders,
       m.unavailable_items, m.ordered_items, m.rating_count, m.merchant_issue_orders,
       m.confirmed_policy_issues,
       NOW() - make_interval(days => m.window_days), NOW(),
       jsonb_build_object(
         'acceptance_timeout', ROUND(m.acceptance_score, 2),
         'prep_accuracy', ROUND(m.prep_accuracy_score, 2),
         'item_availability', ROUND(m.item_availability_score, 2),
         'customer_review', ROUND(m.customer_review_score, 2),
         'refund_cancel', ROUND(m.refund_cancel_score, 2),
         'safety_policy', ROUND(m.safety_policy_score, 2)
       ),
       jsonb_build_object(
         'total_orders', m.total_orders,
         'accepted_orders', m.accepted_orders,
         'timeout_orders', m.timeout_orders,
         'prep_sample_orders', m.prep_sample_orders,
         'unavailable_items', m.unavailable_items,
         'ordered_items', m.ordered_items,
         'rating_count', m.rating_count,
         'merchant_issue_orders', m.merchant_issue_orders,
         'confirmed_policy_issues', m.confirmed_policy_issues,
         'minimum_orders', m.minimum_orders,
         'window_days', m.window_days
       )
FROM metrics m;
$$;
-- +goose StatementEnd

-- Explicit policy is the only path that can remove a merchant from organic
-- search or sponsored Ads. With both flags false, legacy discovery remains
-- available while the policy is safely deployed and can be enabled per market.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION merchant_quality_is_eligible(
  p_merchant_id UUID,
  p_surface VARCHAR
)
RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
WITH selected_policy AS (
  SELECT p.*, m.market_code AS merchant_market_code
  FROM merchant_quality_policies p
  JOIN merchants m ON m.id = p_merchant_id
  WHERE p.is_active
    AND p.effective_from <= NOW()
    AND (p.effective_until IS NULL OR p.effective_until > NOW())
    AND (p.market_code = m.market_code OR p.market_code = '*')
  ORDER BY CASE WHEN p.market_code = m.market_code THEN 0 ELSE 1 END,
           p.effective_from DESC, p.created_at DESC
  LIMIT 1
), computed AS (
  SELECT sp.*, c.score, c.total_orders
  FROM selected_policy sp
  CROSS JOIN LATERAL merchant_quality_calculate(p_merchant_id, sp.id) c
)
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM computed) THEN TRUE
  WHEN p_surface = 'search' AND NOT (SELECT apply_to_search FROM computed) THEN TRUE
  WHEN p_surface = 'ads' AND NOT (SELECT apply_to_ads FROM computed) THEN TRUE
  WHEN p_surface NOT IN ('search', 'ads') THEN FALSE
  WHEN (SELECT total_orders FROM computed) < (SELECT minimum_orders FROM computed) THEN FALSE
  WHEN p_surface = 'search' THEN (SELECT score >= search_min_score FROM computed)
  WHEN p_surface = 'ads' THEN (SELECT score >= ads_min_score FROM computed)
  ELSE FALSE
END;
$$;
-- +goose StatementEnd

-- +goose Down
DROP TRIGGER IF EXISTS trg_sync_merchant_quality_menu_review ON merchant_menu_items;
DROP FUNCTION IF EXISTS sync_merchant_quality_menu_review();
DROP TRIGGER IF EXISTS trg_prevent_merchant_quality_scorecard_mutation ON merchant_quality_scorecards;
DROP FUNCTION IF EXISTS prevent_merchant_quality_scorecard_mutation();
DROP FUNCTION IF EXISTS merchant_quality_is_eligible(UUID, VARCHAR);
DROP FUNCTION IF EXISTS merchant_quality_calculate(UUID, UUID);
DROP INDEX IF EXISTS uq_merchant_quality_appeals_open;
DROP INDEX IF EXISTS idx_merchant_quality_appeals_merchant;
DROP TABLE IF EXISTS merchant_quality_appeals;
DROP INDEX IF EXISTS idx_merchant_quality_scorecards_latest;
DROP TABLE IF EXISTS merchant_quality_scorecards;
DROP INDEX IF EXISTS idx_merchant_quality_review_events_score;
DROP TABLE IF EXISTS merchant_quality_review_events;
DROP INDEX IF EXISTS idx_merchant_quality_policies_active;
DROP TABLE IF EXISTS merchant_quality_policies;
