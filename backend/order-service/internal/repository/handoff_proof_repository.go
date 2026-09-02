package repository

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"tembus/order-service/internal/domain"
	"time"

	"github.com/google/uuid"
)

// CORE-2026-006: ProofVerificationRepository postgres implementation.
// All mutating operations are transactional and atomic.

// IssueToken mints a new verification token. The hash + salt are persisted
// (never the plaintext). Returns the persisted token record and the plaintext
// value for one-time delivery to the client.
func (r *postgresRepo) IssueToken(ctx context.Context, req domain.IssueProofTokenRequest, actorID, actorRole, serviceCategory string) (*domain.ProofVerificationToken, string, error) {
	var plaintext string
	var err error
	switch req.TokenFormat {
	case domain.TokenFormatNumeric6:
		plaintext, err = generateNumeric6()
	case domain.TokenFormatAlphanumeric:
		plaintext, err = generateAlphanumeric16()
	case domain.TokenFormatQR:
		plaintext, err = generateHex32()
	default:
		plaintext, err = generateNumeric6()
	}
	if err != nil {
		return nil, "", fmt.Errorf("generate token: %w", err)
	}

	salt := uuidNewString()
	hash := hmacSHA256Hex(plaintext, salt)

	tokenID := uuidNewString()

	query := `
		INSERT INTO proof_verification_tokens
			(id, order_id, actor_id, actor_role, stage, service_category,
			 token_hash, token_salt, token_format, expires_at, max_attempts)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING created_at, updated_at`

	var createdAt, updatedAt time.Time
	err = r.db.QueryRowContext(ctx, query,
		tokenID, req.OrderID, actorID, actorRole, string(req.Stage),
		serviceCategory, hash, salt, string(req.TokenFormat),
		req.ExpiresAt, req.MaxAttempts,
	).Scan(&createdAt, &updatedAt)
	if err != nil {
		return nil, "", fmt.Errorf("insert proof token: %w", err)
	}

	token := &domain.ProofVerificationToken{
		ID:              tokenID,
		OrderID:         req.OrderID,
		ActorID:         actorID,
		ActorRole:       actorRole,
		Stage:           req.Stage,
		ServiceCategory: serviceCategory,
		TokenHash:       hash,
		TokenSalt:       salt,
		TokenFormat:     req.TokenFormat,
		ExpiresAt:       req.ExpiresAt,
		MaxAttempts:     req.MaxAttempts,
		CreatedAt:       createdAt,
		UpdatedAt:       updatedAt,
	}

	token.TokenHash = ""
	token.TokenSalt = ""
	return token, plaintext, nil
}

// VerifyToken atomically validates and consumes a proof token.
// Checks: token exists, actor matches, not already used, not expired,
// attempts within limit, hash matches. On failure: increments attempts.
func (r *postgresRepo) VerifyToken(ctx context.Context, req domain.VerifyProofTokenRequest) (*domain.ProofVerificationResult, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin verify transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var token domain.ProofVerificationToken
	var usedAt sql.NullTime
	var usedBy sql.NullString
	err = tx.QueryRowContext(ctx, `
		SELECT id, order_id, actor_id, actor_role, stage, service_category,
		       token_hash, token_salt, token_format, expires_at,
		       attempts, max_attempts, used_at, used_by
		FROM proof_verification_tokens
		WHERE id = $1
		FOR UPDATE`, req.TokenID).Scan(
		&token.ID, &token.OrderID, &token.ActorID, &token.ActorRole, &token.Stage,
		&token.ServiceCategory, &token.TokenHash, &token.TokenSalt, &token.TokenFormat,
		&token.ExpiresAt, &token.Attempts, &token.MaxAttempts, &usedAt, &usedBy,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("%w: token not found", domain.ErrProofTokenInvalid)
	}
	if err != nil {
		return nil, fmt.Errorf("select proof token: %w", err)
	}

	// Single-use: reject if already consumed (replay protection).
	if usedAt.Valid {
		return nil, fmt.Errorf("%w: token already consumed", domain.ErrProofTokenUsed)
	}

	// Actor binding: wrong actor rejected.
	if token.ActorID != req.ActorID {
		if errInc := r.incrementAttempts(ctx, tx, req.TokenID); errInc != nil {
			return nil, fmt.Errorf("increment attempts: %w", errInc)
		}
		if errCommit := tx.Commit(); errCommit != nil {
			return nil, fmt.Errorf("commit attempts: %w", errCommit)
		}
		return nil, fmt.Errorf("%w: actor mismatch (expected %s, got %s)", domain.ErrProofTokenInvalid, token.ActorID, req.ActorID)
	}

	// Expiry check.
	if time.Now().UTC().After(token.ExpiresAt) {
		if errInc := r.incrementAttempts(ctx, tx, req.TokenID); errInc != nil {
			return nil, fmt.Errorf("increment attempts: %w", errInc)
		}
		if errCommit := tx.Commit(); errCommit != nil {
			return nil, fmt.Errorf("commit attempts: %w", errCommit)
		}
		return nil, fmt.Errorf("%w: token expired at %s", domain.ErrProofTokenExpired, token.ExpiresAt)
	}

	// Max attempts check.
	if token.Attempts >= token.MaxAttempts {
		return nil, fmt.Errorf("%w: maximum attempts (%d) reached", domain.ErrProofTokenExhausted, token.MaxAttempts)
	}

	// Hash verification (constant-time).
	expectedHash := hmacSHA256Hex(req.ProofValue, token.TokenSalt)
	if !hmacEqual(expectedHash, token.TokenHash) {
		newAttempts := token.Attempts + 1
		if errInc := r.setAttempts(ctx, tx, req.TokenID, newAttempts); errInc != nil {
			return nil, fmt.Errorf("set attempts: %w", errInc)
		}
		if errCommit := tx.Commit(); errCommit != nil {
			return nil, fmt.Errorf("commit attempts: %w", errCommit)
		}
		if newAttempts >= token.MaxAttempts {
			return nil, fmt.Errorf("%w: maximum attempts (%d) reached", domain.ErrProofTokenExhausted, token.MaxAttempts)
		}
		return nil, fmt.Errorf("%w: invalid token value", domain.ErrProofTokenInvalid)
	}

	// Success: mark consumed atomically.
	now := time.Now().UTC()
	if _, errMark := tx.ExecContext(ctx,
		`UPDATE proof_verification_tokens SET used_at = $1, used_by = $2, updated_at = $1 WHERE id = $3`,
		now, req.ActorID, req.TokenID); errMark != nil {
		return nil, fmt.Errorf("mark token used: %w", errMark)
	}

	if errCommit := tx.Commit(); errCommit != nil {
		return nil, fmt.Errorf("commit verify transaction: %w", errCommit)
	}

	return &domain.ProofVerificationResult{
		TokenID:         token.ID,
		OrderID:         token.OrderID,
		Consumed:        true,
		Stage:           string(token.Stage),
		ServiceCategory: token.ServiceCategory,
	}, nil
}

// GetProofRequirements returns seeded proof requirements for a service+stage.
func (r *postgresRepo) GetProofRequirements(ctx context.Context, serviceCategory, stage string) ([]domain.ProofRequirement, error) {
	query := `
		SELECT service_category, stage, proof_type, required, min_value, max_value
		FROM proof_requirements
		WHERE service_category = $1 AND stage = $2`

	rows, err := r.readDB.QueryContext(ctx, query, serviceCategory, stage)
	if err != nil {
		return nil, fmt.Errorf("query proof requirements: %w", err)
	}
	defer rows.Close()

	var reqs []domain.ProofRequirement
	for rows.Next() {
		var req domain.ProofRequirement
		var minVal, maxVal sql.NullInt32
		if err := rows.Scan(
			&req.ServiceCategory, &req.Stage, &req.ProofType,
			&req.Required, &minVal, &maxVal,
		); err != nil {
			return nil, fmt.Errorf("scan proof requirement: %w", err)
		}
		req.ServiceCategory = domain.CanonicalServiceCategory(req.ServiceCategory)
		req.ProofType = domain.ProofType(req.ProofType)
		if minVal.Valid {
			v := int(minVal.Int32)
			req.MinValue = &v
		}
		if maxVal.Valid {
			v := int(maxVal.Int32)
			req.MaxValue = &v
		}
		reqs = append(reqs, req)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate proof requirements: %w", err)
	}
	return reqs, nil
}

// ProofExistsForStage checks whether any proof (scan or consumed token)
// exists for the given order+stage.
func (r *postgresRepo) ProofExistsForStage(ctx context.Context, orderID string, stage string) (bool, error) {
	scanType := stageToScanType(stage)
	if scanType == "" {
		var exists bool
		err := r.readDB.QueryRowContext(ctx,
			`SELECT EXISTS(
				SELECT 1 FROM proof_verification_tokens
				WHERE order_id = $1 AND stage = $2 AND used_at IS NOT NULL
			)`, orderID, stage).Scan(&exists)
		return exists, err
	}

	var exists bool
	query := `SELECT EXISTS(
		SELECT 1 FROM package_scans
		WHERE order_id = $1 AND scan_type = $2
		  AND COALESCE(NULLIF(TRIM(photo_url), ''), NULL) IS NOT NULL
	)`
	err := r.readDB.QueryRowContext(ctx, query, orderID, scanType).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check proof existence: %w", err)
	}
	if exists {
		return true, nil
	}

	err = r.readDB.QueryRowContext(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM proof_verification_tokens
			WHERE order_id = $1 AND stage = $2 AND used_at IS NOT NULL
		)`, orderID, stage).Scan(&exists)
	return exists, err
}

// IsStageFinalized returns true if the order status indicates the stage
// has transitioned past the point where proof can be modified.
func (r *postgresRepo) IsStageFinalized(ctx context.Context, orderID string, stage string) (bool, error) {
	var status string
	err := r.readDB.QueryRowContext(ctx,
		`SELECT status FROM orders WHERE id = $1`, orderID).Scan(&status)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read order status: %w", err)
	}

	switch stage {
	case string(domain.ProofStageDelivered):
		return status == string(domain.StatusDelivered) ||
			status == string(domain.StatusCancelled) ||
			status == string(domain.StatusReturnToSender) ||
			status == string(domain.StatusFailedDelivery), nil
	case string(domain.ProofStagePickedUp):
		return status == string(domain.StatusInboundOrigin) ||
			status == string(domain.StatusInboundDestination) ||
			status == string(domain.StatusOutboundOrigin) ||
			status == string(domain.StatusOutboundDestination) ||
			status == string(domain.StatusDelivering) ||
			status == string(domain.StatusDelivered) ||
			status == string(domain.StatusCancelled), nil
	case string(domain.ProofStageDelivering):
		return status == string(domain.StatusDelivered) ||
			status == string(domain.StatusFailedDelivery) ||
			status == string(domain.StatusCancelled), nil
	default:
		return false, nil
	}
}

// stageToScanType maps a proof stage to the corresponding package_scans scan_type.
func stageToScanType(stage string) string {
	switch stage {
	case "pickup":
		return "pickup"
	case "picked_up":
		return "pickup"
	case "delivering":
		return "out_for_delivery"
	case "delivered":
		return "delivered"
	case "failed_delivery":
		return "failed_delivery"
	default:
		return ""
	}
}

// incrementAttempts increments the attempts counter for a token.
func (r *postgresRepo) incrementAttempts(ctx context.Context, tx *sql.Tx, tokenID string) error {
	_, err := tx.ExecContext(ctx,
		`UPDATE proof_verification_tokens SET attempts = attempts + 1, updated_at = NOW() WHERE id = $1`,
		tokenID)
	return err
}

// setAttempts sets the attempts counter to an absolute value.
func (r *postgresRepo) setAttempts(ctx context.Context, tx *sql.Tx, tokenID string, attempts int) error {
	_, err := tx.ExecContext(ctx,
		`UPDATE proof_verification_tokens SET attempts = $1, updated_at = NOW() WHERE id = $2`,
		attempts, tokenID)
	return err
}

// --- local crypto helpers (avoid cross-package domain imports) ---

func generateNumeric6() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func generateAlphanumeric16() (string, error) {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 16)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		if err != nil {
			return "", err
		}
		b[i] = chars[n.Int64()]
	}
	return string(b), nil
}

func generateHex32() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func hmacSHA256Hex(plaintext, salt string) string {
	mac := hmac.New(sha256.New, []byte(salt))
	mac.Write([]byte(plaintext))
	return hex.EncodeToString(mac.Sum(nil))
}

func hmacEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// uuidNewString generates a UUID v4 for token IDs.
func uuidNewString() string {
	return uuid.NewString()
}
