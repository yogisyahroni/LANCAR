-- +goose Up

-- A cancelled canonical order must not retain an active courier leg. The
-- courier feed uses leg status to determine active work, so repair stale rows
-- left by older cancellation paths before the next UAT sync.
UPDATE order_legs AS ol
   SET status = 'cancelled',
       updated_at = NOW()
  FROM orders AS o
 WHERE o.id = ol.order_id
   AND o.status = 'cancelled'
   AND ol.status NOT IN ('delivered', 'completed', 'cancelled', 'failed', 'rejected');

-- +goose Down
-- Irreversible data repair: cancelled legs must remain cancelled.
