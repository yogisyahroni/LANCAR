package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"tembus/order-service/internal/domain"

	"github.com/lib/pq"
)

// PostgresRiskRepository persists risk decisions in the shared canonical
// database. The order service owns writes; admin-service only performs the
// separately audited manual-review mutation.
type PostgresRiskRepository struct {
	db *sql.DB
}

func NewPostgresRiskRepository(db *sql.DB) *PostgresRiskRepository {
	return &PostgresRiskRepository{db: db}
}

func (r *PostgresRiskRepository) SaveRiskDecision(ctx context.Context, decision *domain.RiskDecision, reviewEvidence json.RawMessage) error {
	if decision == nil {
		return fmt.Errorf("risk decision is required")
	}
	if r == nil || r.db == nil {
		return fmt.Errorf("risk repository database is not configured")
	}
	signals, err := json.Marshal(decision.Signals)
	if err != nil {
		return fmt.Errorf("marshal risk signals: %w", err)
	}
	if len(reviewEvidence) == 0 {
		reviewEvidence = json.RawMessage(`{"source":"marketplace_risk_engine"}`)
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin risk decision transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	_, err = tx.ExecContext(ctx, `
		INSERT INTO risk_decisions (
			id, operation, market_code, entity_type, entity_id, subject_key_hash,
			decision, risk_score, reason_codes, signal_snapshot, policy_version,
			failure_mode, correlation_id, idempotency_key, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15)
		ON CONFLICT (operation, idempotency_key) DO NOTHING`,
		decision.ID,
		string(decision.Operation),
		decision.MarketCode,
		decision.EntityType,
		decision.EntityID,
		decision.SubjectKeyHash,
		string(decision.Decision),
		decision.RiskScore,
		pq.Array(decision.ReasonCodes),
		signals,
		decision.PolicyVersion,
		string(decision.FailureMode),
		decision.CorrelationID,
		decision.IdempotencyKey,
		decision.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert risk decision: %w", err)
	}

	if domain.RiskReviewRequired(decision.Decision) {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO risk_manual_reviews (risk_decision_id, status, evidence, created_at, updated_at)
			VALUES ($1, 'PENDING', $2::jsonb, NOW(), NOW())
			ON CONFLICT (risk_decision_id) DO NOTHING`, decision.ID, reviewEvidence)
		if err != nil {
			return fmt.Errorf("create risk manual review: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit risk decision: %w", err)
	}
	return nil
}
