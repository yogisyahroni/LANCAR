package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"tembus/auth-service/internal/domain"
)

// ─────────────────────────────────────────────
// CustomerAuthIdentityRepository implementation
// ─────────────────────────────────────────────

func (r *postgresRepo) GetByProviderSubject(ctx context.Context, provider, providerSubject string) (*domain.CustomerAuthIdentity, error) {
	query := `
		SELECT id, user_id, provider, provider_subject, provider_email, email_verified,
		       linked_at, last_used_at, revoked_at, created_at, updated_at
		FROM customer_auth_identities
		WHERE provider = $1
		  AND provider_subject = $2
		  AND revoked_at IS NULL
		LIMIT 1`

	id := &domain.CustomerAuthIdentity{}
	err := r.readDB.QueryRowContext(ctx, query, provider, providerSubject).Scan(
		&id.ID, &id.UserID, &id.Provider, &id.ProviderSubject, &id.ProviderEmail,
		&id.EmailVerified, &id.LinkedAt, &id.LastUsedAt, &id.RevokedAt,
		&id.CreatedAt, &id.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return id, nil
}

func (r *postgresRepo) GetIdentitiesByUserID(ctx context.Context, userID string) ([]*domain.CustomerAuthIdentity, error) {
	query := `
		SELECT id, user_id, provider, provider_subject, provider_email, email_verified,
		       linked_at, last_used_at, revoked_at, created_at, updated_at
		FROM customer_auth_identities
		WHERE user_id = $1
		ORDER BY linked_at DESC`

	rows, err := r.readDB.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var identities []*domain.CustomerAuthIdentity
	for rows.Next() {
		id := &domain.CustomerAuthIdentity{}
		if err := rows.Scan(
			&id.ID, &id.UserID, &id.Provider, &id.ProviderSubject, &id.ProviderEmail,
			&id.EmailVerified, &id.LinkedAt, &id.LastUsedAt, &id.RevokedAt,
			&id.CreatedAt, &id.UpdatedAt,
		); err != nil {
			return nil, err
		}
		identities = append(identities, id)
	}
	return identities, rows.Err()
}

func (r *postgresRepo) CreateIdentity(ctx context.Context, identity *domain.CustomerAuthIdentity) error {
	query := `
		INSERT INTO customer_auth_identities
		    (user_id, provider, provider_subject, provider_email, email_verified, linked_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW())
		RETURNING id, linked_at, created_at, updated_at`

	return r.db.QueryRowContext(ctx, query,
		identity.UserID, identity.Provider, identity.ProviderSubject,
		identity.ProviderEmail, identity.EmailVerified,
	).Scan(&identity.ID, &identity.LinkedAt, &identity.CreatedAt, &identity.UpdatedAt)
}

func (r *postgresRepo) MarkIdentityLastUsed(ctx context.Context, identityID string) error {
	query := `UPDATE customer_auth_identities SET last_used_at = NOW(), updated_at = NOW() WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, identityID)
	return err
}

func (r *postgresRepo) RevokeIdentity(ctx context.Context, identityID string) error {
	query := `UPDATE customer_auth_identities SET revoked_at = NOW(), updated_at = NOW() WHERE id = $1 AND revoked_at IS NULL`
	_, err := r.db.ExecContext(ctx, query, identityID)
	return err
}

func (r *postgresRepo) RevokeIdentityByUserProvider(ctx context.Context, userID, provider string) error {
	query := `UPDATE customer_auth_identities SET revoked_at = NOW(), updated_at = NOW()
	          WHERE user_id = $1 AND provider = $2 AND revoked_at IS NULL`
	_, err := r.db.ExecContext(ctx, query, userID, provider)
	return err
}

// ─────────────────────────────────────────────
// CustomerAuthTransactionRepository implementation
// ─────────────────────────────────────────────

func (r *postgresRepo) CreateAuthTransaction(ctx context.Context, tx *domain.CustomerAuthTransaction) error {
	metadataJSON := []byte("{}")
	if tx.Metadata != nil && len(tx.Metadata) > 0 {
		metadataJSON = tx.Metadata
	}

	query := `
		INSERT INTO customer_auth_transactions
		    (type, status, provider, user_id, identifier_hash, state_hash, nonce_hash,
		     device_id_hash, platform, expires_at, metadata, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW(), NOW())
		RETURNING id, created_at, updated_at`

	return r.db.QueryRowContext(ctx, query,
		string(tx.Type), string(tx.Status), tx.Provider, tx.UserID,
		tx.IdentifierHash, tx.StateHash, tx.NonceHash, tx.DeviceIDHash,
		tx.Platform, tx.ExpiresAt, string(metadataJSON),
	).Scan(&tx.ID, &tx.CreatedAt, &tx.UpdatedAt)
}

func (r *postgresRepo) GetAuthTransactionByID(ctx context.Context, id string) (*domain.CustomerAuthTransaction, error) {
	query := `
		SELECT id, type, status, provider, user_id, identifier_hash, state_hash, nonce_hash,
		       device_id_hash, platform, expires_at, consumed_at, metadata, created_at, updated_at
		FROM customer_auth_transactions
		WHERE id = $1
		LIMIT 1`

	tx := &domain.CustomerAuthTransaction{}
	var metadata []byte
	err := r.readDB.QueryRowContext(ctx, query, id).Scan(
		&tx.ID, &tx.Type, &tx.Status, &tx.Provider, &tx.UserID,
		&tx.IdentifierHash, &tx.StateHash, &tx.NonceHash, &tx.DeviceIDHash,
		&tx.Platform, &tx.ExpiresAt, &tx.ConsumedAt, &metadata,
		&tx.CreatedAt, &tx.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	tx.Metadata = metadata
	return tx, nil
}

func (r *postgresRepo) ConsumeAuthTransaction(ctx context.Context, id string) error {
	query := `
		UPDATE customer_auth_transactions
		SET status = 'consumed', consumed_at = NOW(), updated_at = NOW()
		WHERE id = $1
		  AND status = 'pending'
		  AND expires_at > NOW()`

	res, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}
	count, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("transaction %s is not consumable (already consumed, expired, or not found)", id)
	}
	return nil
}

func (r *postgresRepo) UpdateAuthTransactionStatus(ctx context.Context, id string, status domain.CustomerAuthTransactionStatus) error {
	query := `UPDATE customer_auth_transactions SET status = $1, updated_at = NOW() WHERE id = $2`
	_, err := r.db.ExecContext(ctx, query, string(status), id)
	return err
}

func (r *postgresRepo) SetAuthTransactionUserID(ctx context.Context, id string, userID string) error {
	query := `UPDATE customer_auth_transactions SET user_id = $1, updated_at = NOW() WHERE id = $2`
	_, err := r.db.ExecContext(ctx, query, userID, id)
	return err
}

func (r *postgresRepo) CleanExpiredAuthTransactions(ctx context.Context) error {
	query := `DELETE FROM customer_auth_transactions WHERE expires_at < NOW() - INTERVAL '1 hour'`
	_, err := r.db.ExecContext(ctx, query)
	return err
}

// ─────────────────────────────────────────────
// CustomerOTPChallengeRepository implementation
// ─────────────────────────────────────────────

func (r *postgresRepo) CreateOTPChallenge(ctx context.Context, challenge *domain.CustomerOTPChallenge) error {
	query := `
		INSERT INTO customer_otp_challenges
		    (transaction_id, user_id, purpose, identifier_hash, recipient_mask,
		     channel, provider, code_hash, max_attempts, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
		RETURNING id, created_at`

	return r.db.QueryRowContext(ctx, query,
		challenge.TransactionID, challenge.UserID,
		string(challenge.Purpose), challenge.IdentifierHash, challenge.RecipientMask,
		string(challenge.Channel), string(challenge.Provider), challenge.CodeHash,
		challenge.MaxAttempts, challenge.ExpiresAt,
	).Scan(&challenge.ID, &challenge.CreatedAt)
}

func (r *postgresRepo) GetOTPChallengeByID(ctx context.Context, id string) (*domain.CustomerOTPChallenge, error) {
	query := `
		SELECT id, transaction_id, user_id, purpose, identifier_hash, recipient_mask,
		       channel, provider, code_hash, attempts, max_attempts, expires_at,
		       used_at, locked_until, created_at
		FROM customer_otp_challenges
		WHERE id = $1
		LIMIT 1`

	c := &domain.CustomerOTPChallenge{}
	err := r.readDB.QueryRowContext(ctx, query, id).Scan(
		&c.ID, &c.TransactionID, &c.UserID, &c.Purpose, &c.IdentifierHash,
		&c.RecipientMask, &c.Channel, &c.Provider, &c.CodeHash,
		&c.Attempts, &c.MaxAttempts, &c.ExpiresAt, &c.UsedAt, &c.LockedUntil, &c.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (r *postgresRepo) GetActiveOTPChallengeByTransaction(ctx context.Context, transactionID string) (*domain.CustomerOTPChallenge, error) {
	query := `
		SELECT id, transaction_id, user_id, purpose, identifier_hash, recipient_mask,
		       channel, provider, code_hash, attempts, max_attempts, expires_at,
		       used_at, locked_until, created_at
		FROM customer_otp_challenges
		WHERE transaction_id = $1
		  AND used_at IS NULL
		  AND expires_at > NOW()
		ORDER BY created_at DESC
		LIMIT 1`

	c := &domain.CustomerOTPChallenge{}
	err := r.readDB.QueryRowContext(ctx, query, transactionID).Scan(
		&c.ID, &c.TransactionID, &c.UserID, &c.Purpose, &c.IdentifierHash,
		&c.RecipientMask, &c.Channel, &c.Provider, &c.CodeHash,
		&c.Attempts, &c.MaxAttempts, &c.ExpiresAt, &c.UsedAt, &c.LockedUntil, &c.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (r *postgresRepo) IncrementOTPAttempts(ctx context.Context, id string, lockDurationSeconds *int) error {
	var query string
	var args []interface{}

	if lockDurationSeconds != nil && *lockDurationSeconds > 0 {
		query = `
			UPDATE customer_otp_challenges
			SET attempts = attempts + 1,
			    locked_until = CASE
			        WHEN (attempts + 1) >= max_attempts
			        THEN NOW() + ($2 || ' seconds')::INTERVAL
			        ELSE locked_until
			    END
			WHERE id = $1`
		args = []interface{}{id, fmt.Sprintf("%d", *lockDurationSeconds)}
	} else {
		query = `UPDATE customer_otp_challenges SET attempts = attempts + 1 WHERE id = $1`
		args = []interface{}{id}
	}
	_, err := r.db.ExecContext(ctx, query, args...)
	return err
}

func (r *postgresRepo) MarkOTPChallengeUsed(ctx context.Context, id string) error {
	query := `
		UPDATE customer_otp_challenges
		SET used_at = NOW()
		WHERE id = $1 AND used_at IS NULL`

	res, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}
	count, _ := res.RowsAffected()
	if count == 0 {
		return fmt.Errorf("OTP challenge %s already used or not found", id)
	}
	return nil
}

func (r *postgresRepo) RecordOTPDelivery(ctx context.Context, delivery *domain.CustomerOTPDelivery) error {
	query := `
		INSERT INTO customer_otp_deliveries
		    (challenge_id, provider, channel, provider_message_id, status, error_code,
		     sent_at, delivered_at, failed_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
		RETURNING id, created_at
		ON CONFLICT (provider, provider_message_id) WHERE provider_message_id IS NOT NULL
		DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`

	return r.db.QueryRowContext(ctx, query,
		delivery.ChallengeID, string(delivery.Provider), string(delivery.Channel),
		delivery.ProviderMessageID, string(delivery.Status), delivery.ErrorCode,
		delivery.SentAt, delivery.DeliveredAt, delivery.FailedAt,
	).Scan(&delivery.ID, &delivery.CreatedAt)
}

func (r *postgresRepo) GetOTPDeliveries(ctx context.Context, challengeID string) ([]*domain.CustomerOTPDelivery, error) {
	query := `
		SELECT id, challenge_id, provider, channel, provider_message_id, status, error_code,
		       sent_at, delivered_at, failed_at, created_at
		FROM customer_otp_deliveries
		WHERE challenge_id = $1
		ORDER BY created_at ASC`

	rows, err := r.readDB.QueryContext(ctx, query, challengeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deliveries []*domain.CustomerOTPDelivery
	for rows.Next() {
		d := &domain.CustomerOTPDelivery{}
		if err := rows.Scan(
			&d.ID, &d.ChallengeID, &d.Provider, &d.Channel, &d.ProviderMessageID,
			&d.Status, &d.ErrorCode, &d.SentAt, &d.DeliveredAt, &d.FailedAt, &d.CreatedAt,
		); err != nil {
			return nil, err
		}
		deliveries = append(deliveries, d)
	}
	return deliveries, rows.Err()
}

func (r *postgresRepo) UpdateOTPDeliveryStatus(ctx context.Context, providerMessageID string, status domain.OTPDeliveryStatus, deliveredAtUnix, failedAtUnix *int64) error {
	var deliveredAt, failedAt *time.Time
	if deliveredAtUnix != nil {
		t := time.Unix(*deliveredAtUnix, 0)
		deliveredAt = &t
	}
	if failedAtUnix != nil {
		t := time.Unix(*failedAtUnix, 0)
		failedAt = &t
	}
	query := `
		UPDATE customer_otp_deliveries
		SET status = $1, delivered_at = $2, failed_at = $3
		WHERE provider_message_id = $4`
	_, err := r.db.ExecContext(ctx, query, string(status), deliveredAt, failedAt, providerMessageID)
	return err
}

// ─────────────────────────────────────────────
// Feature flag helpers (already in postgresRepo, this extends usage)
// ─────────────────────────────────────────────

// IsCustomerGoogleLoginEnabled returns whether customer Google login is enabled.
func (r *postgresRepo) IsCustomerGoogleLoginEnabled(ctx context.Context) bool {
	enabled, _ := r.IsFeatureFlagEnabled(ctx, "customer_google_login_enabled", false)
	return enabled
}

// IsCustomerGoogleRegistrationEnabled returns whether customer Google registration is enabled.
func (r *postgresRepo) IsCustomerGoogleRegistrationEnabled(ctx context.Context) bool {
	enabled, _ := r.IsFeatureFlagEnabled(ctx, "customer_google_registration_enabled", false)
	return enabled
}

// IsCustomerAuthOTPRequired returns whether customer OTP is required.
func (r *postgresRepo) IsCustomerAuthOTPRequired(ctx context.Context) bool {
	enabled, _ := r.IsFeatureFlagEnabled(ctx, "customer_auth_otp_required", true) // defaulting to true for safety
	return enabled
}

// IsOTPProviderLive returns whether the live OTP provider should be used.
func (r *postgresRepo) IsOTPProviderLive(ctx context.Context) bool {
	enabled, _ := r.IsFeatureFlagEnabled(ctx, "otp_provider_live", false)
	return enabled
}

// Ensure we have json import for metadata usage
var _ = json.Marshal
