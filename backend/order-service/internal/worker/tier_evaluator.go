package worker

import (
	"context"
	"database/sql"
	"log"
	"time"
)

// TierEvaluatorWorker runs daily to promote or demote couriers based on 30-day performance.
type TierEvaluatorWorker struct {
	db *sql.DB
}

func NewTierEvaluatorWorker(db *sql.DB) *TierEvaluatorWorker {
	return &TierEvaluatorWorker{db: db}
}

func (w *TierEvaluatorWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	log.Println("[TierEvaluator] Worker started. Will run daily.")

	for {
		select {
		case <-ctx.Done():
			log.Println("[TierEvaluator] Shutting down...")
			return
		case <-ticker.C:
			w.runEvaluation(ctx)
		}
	}
}

func (w *TierEvaluatorWorker) runEvaluation(ctx context.Context) {
	log.Println("[TierEvaluator] Running daily tier evaluation for all active couriers...")

	// Query aggregates last 30 days of performance.
	// We check: Total Orders Delivered, Cancellation Rate, Acceptance Rate, Avg Rating.
	// Tier thresholds (Example):
	// God Mode: >= 150 orders, CR < 2%, AR > 90%, Rating >= 4.8
	// Gold: >= 50 orders, CR < 5%, AR > 80%, Rating >= 4.5
	// Silver: default for active.
	// Newbies (join date < 30 days) are evaluated but usually boosted at the dispatch level.

	query := `
		WITH courier_stats AS (
			SELECT 
				o.courier_id,
				COUNT(*) as total_orders,
				SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END)::float / GREATEST(COUNT(*), 1) * 100 as cancel_rate,
				AVG(COALESCE(o.courier_rating, 5.0)) as avg_rating
			FROM orders o
			WHERE o.created_at >= NOW() - INTERVAL '30 days'
			  AND o.courier_id IS NOT NULL
			GROUP BY o.courier_id
		)
		UPDATE courier_profiles cp
		SET 
			tier = CASE 
				WHEN cs.total_orders >= 150 AND cs.cancel_rate < 2.0 AND cs.avg_rating >= 4.8 THEN 'god_mode'
				WHEN cs.total_orders >= 50 AND cs.cancel_rate < 5.0 AND cs.avg_rating >= 4.5 THEN 'gold'
				ELSE 'silver'
			END,
			updated_at = NOW()
		FROM courier_stats cs
		WHERE cp.user_id = cs.courier_id
		  AND cp.created_at < NOW() - INTERVAL '30 days'; -- Only evaluate those who are not newbies (older than 30 days)
	`

	res, err := w.db.ExecContext(ctx, query)
	if err != nil {
		log.Printf("[TierEvaluator] ERROR running evaluation: %v", err)
		return
	}

	affected, _ := res.RowsAffected()
	log.Printf("[TierEvaluator] Evaluation completed. Updated %d couriers.", affected)
}
