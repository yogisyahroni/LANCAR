package domain

import "context"

// ─────────────────────────────────────────────
// OTP Provider Interface
// ─────────────────────────────────────────────

// OTPSendRequest carries everything a provider needs to send an OTP.
type OTPSendRequest struct {
	RecipientPhone  string          // E.164 normalized phone number
	Channel         OTPChannel      // "whatsapp" or "sms"
	Purpose         OTPPurpose      // reason for OTP
	OTPCode         string          // the plaintext code — only lives in memory during send
	TemplateID      string          // provider template id (may be empty for SMS)
	IdempotencyKey  string          // unique key to prevent duplicate sends
	CorrelationID   string          // tracing correlation id
}

// OTPSendResult is what a provider returns after a send attempt.
type OTPSendResult struct {
	ProviderMessageID string          // provider's message reference id
	Channel           OTPChannel      // channel actually used for delivery
	Status            OTPDeliveryStatus
	Retryable         bool            // true if the error is transient
	NormalizedError   string          // internal error code (not for customer)
	LatencyMS         int64           // roundtrip to provider in milliseconds
}

// OTPDeliveryStatusResult is returned when polling delivery status.
type OTPDeliveryStatusResult struct {
	ProviderMessageID string
	Status            OTPDeliveryStatus
	DeliveredAt       *int64 // unix timestamp if delivered
}

// OTPProvider is the provider-neutral interface all OTP backends must implement.
// Implementations: DryRunOTPProvider, ZenzivaOTPProvider.
type OTPProvider interface {
	// SendOTP sends a one-time password via the specified channel.
	SendOTP(ctx context.Context, req OTPSendRequest) (OTPSendResult, error)

	// CheckDeliveryStatus queries the delivery status for a given provider message id.
	CheckDeliveryStatus(ctx context.Context, providerMessageID string) (OTPDeliveryStatusResult, error)

	// VerifyWebhookSignature validates the HMAC/signature of an incoming webhook payload.
	// Returns nil if the signature is valid.
	VerifyWebhookSignature(payload []byte, signature string, timestamp string) error

	// Name returns the canonical provider name.
	Name() OTPProviderName
}

// ─────────────────────────────────────────────
// Google Auth Repositories
// ─────────────────────────────────────────────

// CustomerAuthIdentityRepository manages external identity links.
type CustomerAuthIdentityRepository interface {
	// GetByProviderSubject finds an active identity by provider+subject.
	// Returns (nil, nil) if no active identity exists — NOT an error.
	GetByProviderSubject(ctx context.Context, provider, providerSubject string) (*CustomerAuthIdentity, error)

	// GetByUserID returns all identities for a customer.
	GetByUserID(ctx context.Context, userID string) ([]*CustomerAuthIdentity, error)

	// Create inserts a new identity record.
	Create(ctx context.Context, identity *CustomerAuthIdentity) error

	// MarkLastUsed updates last_used_at for the identity.
	MarkLastUsed(ctx context.Context, identityID string) error

	// Revoke soft-deletes the identity by setting revoked_at = now().
	Revoke(ctx context.Context, identityID string) error

	// RevokeByUserProvider revokes all identities for a user+provider combination.
	RevokeByUserProvider(ctx context.Context, userID, provider string) error
}

// CustomerAuthTransactionRepository manages short-lived auth transactions.
type CustomerAuthTransactionRepository interface {
	// Create inserts a new transaction.
	Create(ctx context.Context, tx *CustomerAuthTransaction) error

	// GetByID returns a transaction by its ID.
	// Returns (nil, nil) if not found.
	GetByID(ctx context.Context, id string) (*CustomerAuthTransaction, error)

	// Consume atomically marks a pending transaction as consumed.
	// Returns an error if the transaction is already consumed, expired, or not found.
	Consume(ctx context.Context, id string) error

	// UpdateStatus sets the status of a transaction.
	UpdateStatus(ctx context.Context, id string, status CustomerAuthTransactionStatus) error

	// SetUserID sets the user_id field on a transaction (once user is identified).
	SetUserID(ctx context.Context, id string, userID string) error

	// CleanExpired deletes all expired transactions (for periodic maintenance).
	CleanExpired(ctx context.Context) error
}

// CustomerOTPChallengeRepository manages OTP challenge lifecycle.
type CustomerOTPChallengeRepository interface {
	// Create inserts a new challenge. OTP code is already hashed before insertion.
	Create(ctx context.Context, challenge *CustomerOTPChallenge) error

	// GetByID returns a challenge by its ID.
	GetByID(ctx context.Context, id string) (*CustomerOTPChallenge, error)

	// GetActiveByTransaction returns the latest unexpired, unused challenge for a transaction.
	GetActiveByTransaction(ctx context.Context, transactionID string) (*CustomerOTPChallenge, error)

	// IncrementAttempts atomically increments the attempt counter.
	// If attempts >= max_attempts, the challenge is locked for a configurable duration.
	IncrementAttempts(ctx context.Context, id string, lockDuration *int) error

	// MarkUsed atomically marks a challenge as used (set used_at = now()).
	// Returns error if already used.
	MarkUsed(ctx context.Context, id string) error

	// RecordDelivery saves a delivery audit entry for a challenge.
	RecordDelivery(ctx context.Context, delivery *CustomerOTPDelivery) error

	// GetDeliveries returns the delivery audit for a challenge.
	GetDeliveries(ctx context.Context, challengeID string) ([]*CustomerOTPDelivery, error)

	// UpdateDeliveryStatus updates a delivery record's status (for webhook processing).
	UpdateDeliveryStatus(ctx context.Context, providerMessageID string, status OTPDeliveryStatus, deliveredAt, failedAt *int64) error
}
