package repository

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"tembus/order-service/internal/domain"
	"time"
)

// consumeHandoffTokenForTransition is deliberately used by the canonical
// order transition transaction. It makes proof verification and picked_up /
// delivered state atomic: a failed state transition rolls the token back.
func (r *postgresRepo) consumeHandoffTokenForTransition(ctx context.Context, tx *sql.Tx, token, orderID, actorID string, stage domain.HandoffStage, now time.Time) error {
	var storedOrderID, storedActorID, storedStage, storedStatus string
	var consumedAt sql.NullTime
	var attempts, maxAttempts int
	var expiresAt time.Time
	err := tx.QueryRowContext(ctx, `
		SELECT order_id::text, actor_id::text, stage, status, attempts, max_attempts, expires_at, consumed_at
		  FROM handoff_tokens
		 WHERE token_hash = $1
		 FOR UPDATE`, hashHandoffTokenForTransition(token)).Scan(
		&storedOrderID, &storedActorID, &storedStage, &storedStatus, &attempts, &maxAttempts, &expiresAt, &consumedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.ErrHandoffTokenInvalid
	}
	if err != nil {
		return fmt.Errorf("load handoff token for transition: %w", err)
	}
	if consumedAt.Valid || storedStatus == "consumed" {
		return domain.ErrHandoffTokenConsumed
	}
	if !now.Before(expiresAt) {
		return domain.ErrHandoffTokenExpired
	}
	if attempts >= maxAttempts {
		return domain.ErrHandoffTokenAttemptsLimit
	}
	if storedOrderID != orderID {
		return domain.ErrHandoffOrderMismatch
	}
	if storedActorID != actorID {
		return domain.ErrHandoffActorMismatch
	}
	if storedStage != string(stage) {
		return domain.ErrHandoffStageMismatch
	}
	_, err = tx.ExecContext(ctx, `
		UPDATE handoff_tokens
		   SET status = 'consumed', attempts = attempts + 1, consumed_at = $1, updated_at = $1
		 WHERE token_hash = $2 AND status = 'active'`, now, hashHandoffTokenForTransition(token))
	if err != nil {
		return fmt.Errorf("consume handoff token for transition: %w", err)
	}
	return nil
}

func hashHandoffTokenForTransition(token string) string {
	digest := sha256.Sum256([]byte(token))
	return hex.EncodeToString(digest[:])
}

func (r *postgresRepo) CreateHandoffToken(ctx context.Context, token *domain.HandoffToken) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO handoff_tokens
			(id, order_id, actor_id, stage, token_hash, attempts, max_attempts, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		token.ID, token.OrderID, token.ActorID, token.Stage, token.TokenHash, token.Attempts,
		token.MaxAttempts, token.ExpiresAt, token.CreatedAt)
	if err != nil {
		return fmt.Errorf("create handoff token: %w", err)
	}
	return nil
}

func (r *postgresRepo) ConsumeHandoffToken(ctx context.Context, tokenHash, orderID, actorID string, stage domain.HandoffStage, now time.Time) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin handoff consume: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var token domain.HandoffToken
	var consumedAt sql.NullTime
	err = tx.QueryRowContext(ctx, `
		SELECT id::text, order_id::text, actor_id::text, stage, token_hash,
		       attempts, max_attempts, expires_at, consumed_at, created_at
		  FROM handoff_tokens
		 WHERE token_hash = $1
		 FOR UPDATE`, tokenHash).Scan(
		&token.ID, &token.OrderID, &token.ActorID, &token.Stage, &token.TokenHash,
		&token.Attempts, &token.MaxAttempts, &token.ExpiresAt, &consumedAt, &token.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.ErrHandoffTokenInvalid
	}
	if err != nil {
		return fmt.Errorf("load handoff token: %w", err)
	}
	if consumedAt.Valid {
		return domain.ErrHandoffTokenConsumed
	}
	if !now.Before(token.ExpiresAt) {
		_, _ = tx.ExecContext(ctx, `UPDATE handoff_tokens SET status = 'expired', updated_at = NOW() WHERE id = $1`, token.ID)
		return domain.ErrHandoffTokenExpired
	}
	if token.Attempts >= token.MaxAttempts {
		_, _ = tx.ExecContext(ctx, `UPDATE handoff_tokens SET status = 'blocked', updated_at = NOW() WHERE id = $1`, token.ID)
		return domain.ErrHandoffTokenAttemptsLimit
	}
	if token.OrderID != orderID {
		if err := incrementHandoffAttempt(ctx, tx, token.ID, token.Attempts+1, token.MaxAttempts); err != nil {
			return err
		}
		return domain.ErrHandoffOrderMismatch
	}
	if token.ActorID != actorID {
		if err := incrementHandoffAttempt(ctx, tx, token.ID, token.Attempts+1, token.MaxAttempts); err != nil {
			return err
		}
		return domain.ErrHandoffActorMismatch
	}
	if token.Stage != stage {
		if err := incrementHandoffAttempt(ctx, tx, token.ID, token.Attempts+1, token.MaxAttempts); err != nil {
			return err
		}
		return domain.ErrHandoffStageMismatch
	}
	_, err = tx.ExecContext(ctx, `UPDATE handoff_tokens SET status = 'consumed', attempts = attempts + 1, consumed_at = $1, updated_at = $1 WHERE id = $2`, now, token.ID)
	if err != nil {
		return fmt.Errorf("consume handoff token: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit handoff consume: %w", err)
	}
	return nil
}

func incrementHandoffAttempt(ctx context.Context, tx *sql.Tx, id string, attempts, maxAttempts int) error {
	status := "active"
	if attempts >= maxAttempts {
		status = "blocked"
	}
	_, err := tx.ExecContext(ctx, `UPDATE handoff_tokens SET status = $1, attempts = $2, updated_at = NOW() WHERE id = $3`, status, attempts, id)
	if err != nil {
		return fmt.Errorf("record handoff attempt: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit handoff attempt: %w", err)
	}
	return nil
}
