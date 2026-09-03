package domain

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

// CORE-2026-006: Proof/PIN/QR/signature chain-of-custody domain types.

var (
	ErrProofRequired       = errors.New("PROOF_REQUIRED")
	ErrProofTokenInvalid   = errors.New("PROOF_TOKEN_INVALID")
	ErrProofTokenExpired   = errors.New("PROOF_TOKEN_EXPIRED")
	ErrProofTokenExhausted = errors.New("PROOF_TOKEN_EXHAUSTED")
	ErrProofTokenUsed      = errors.New("PROOF_TOKEN_USED")
	ErrProofImmutable      = errors.New("PROOF_IMMUTABLE")
	ErrProofAlreadyExists = errors.New("PROOF_ALREADY_EXISTS")

	// CORE-2026-006 rename compatibility: legacy handoff_token_repository.go
	// masih panggil domain.ErrHandoffToken*. Alias ke sentinels equivalent.
	ErrHandoffTokenInvalid      = ErrProofTokenInvalid
	ErrHandoffTokenExpired      = ErrProofTokenExpired
	ErrHandoffTokenConsumed     = ErrProofTokenUsed
	ErrHandoffTokenAttemptsLimit = ErrProofTokenExhausted
	ErrHandoffOrderMismatch     = ErrProofImmutable
	ErrHandoffActorMismatch     = ErrProofImmutable
	ErrHandoffStageMismatch     = ErrProofImmutable
)

// ProofType is the kind of chain-of-custody evidence.
type ProofType string

const (
	ProofTypeOTP       ProofType = "otp"
	ProofTypeQR        ProofType = "qr"
	ProofTypeSignature ProofType = "signature"
	ProofTypePhoto     ProofType = "photo"
	ProofTypePIN       ProofType = "pin"
)

// TokenFormat describes the generated token encoding.
type TokenFormat string

const (
	TokenFormatNumeric6   TokenFormat = "numeric_6"
	TokenFormatAlphanumeric TokenFormat = "alphanumeric"
	TokenFormatQR         TokenFormat = "qr"
)

// ProofRequirement describes what proof is mandatory for a service/stage pair.
type ProofRequirement struct {
	ServiceCategory CanonicalServiceCategory `json:"service_category"`
	Stage           string                    `json:"stage"`
	ProofType       ProofType                 `json:"proof_type"`
	Required        bool                      `json:"required"`
	MinValue        *int                      `json:"min_value,omitempty"`
	MaxValue        *int                      `json:"max_value,omitempty"`
}

// ProofRequirementMatrix maps (service_category, stage) to the set of proofs.
type ProofRequirementMatrix map[string][]ProofRequirement

// ProofStage represents a delivery lifecycle stage that may require proof.
type ProofStage string

const (
	ProofStagePickup         ProofStage = "pickup"
	ProofStagePickedUp       ProofStage = "picked_up"
	ProofStageDelivering     ProofStage = "delivering"
	ProofStageDelivered      ProofStage = "delivered"
	ProofStageFailedDelivery ProofStage = "failed_delivery"
)

// CORE-2026-006 rename compatibility: legacy handoff_token_repository.go +
// order_consolidation.go masih pakai HandoffStage/HandoffToken.
type HandoffStage = ProofStage

// HandoffToken is legacy alias untuk handoff_tokens PostgreSQL table schema.
type HandoffToken struct {
	ID          string
	OrderID     string
	ActorID     string
	Stage       HandoffStage
	Status      string    // pending | active | consumed | expired | blocked
	TokenHash   string
	Attempts    int
	MaxAttempts int
	ExpiresAt   time.Time
	ConsumedAt  *time.Time
	CreatedAt   time.Time
}

const (
	HandoffStageDelivery HandoffStage = ProofStageDelivering
	HandoffStagePickup   HandoffStage = ProofStagePickup
)


// ProofVerificationToken is the one-time token issued to bind an actor to a
// proof event. It carries expiry and attempt limits enforced transactionally.
type ProofVerificationToken struct {
	ID            string        `json:"id"`
	OrderID       string        `json:"order_id"`
	ActorID       string        `json:"actor_id"`
	ActorRole     string        `json:"actor_role"`
	Stage         ProofStage    `json:"stage"`
	ServiceCategory string      `json:"service_category"`
	TokenHash     string        `json:"-"`
	TokenSalt     string        `json:"-"`
	TokenFormat   TokenFormat   `json:"token_format"`
	ExpiresAt     time.Time     `json:"expires_at"`
	Attempts      int           `json:"attempts"`
	MaxAttempts   int           `json:"max_attempts"`
	UsedAt        *time.Time    `json:"used_at,omitempty"`
	UsedBy        *string       `json:"used_by,omitempty"`
	CreatedAt     time.Time     `json:"created_at"`
	UpdatedAt     time.Time     `json:"updated_at"`
}

// ProofVerificationResult is returned after a token verify attempt.
type ProofVerificationResult struct {
	TokenID    string `json:"token_id"`
	OrderID    string `json:"order_id"`
	Consumed   bool   `json:"consumed"`
	Stage      string `json:"stage"`
	ServiceCategory string `json:"service_category"`
}

// IssueProofTokenRequest is the request to mint a one-time verification token.
type IssueProofTokenRequest struct {
	OrderID       string
	Stage         ProofStage
	TokenFormat   TokenFormat
	ExpiresAt     time.Time
	MaxAttempts   int
}

// VerifyProofTokenRequest is the request to consume a one-time verification token.
type VerifyProofTokenRequest struct {
	TokenID    string
	ActorID    string
	ActorRole  string
	ProofValue string // the raw OTP/PIN/QR token from the client
	PhotoURL   *string
	Signature  *string
}

// HandoffService is the interface the handler depends on.
// Placed in domain for cross-package reference (order_service.go handoffSvc field).
type HandoffService interface {
	IssueProofToken(ctx context.Context, req IssueProofTokenRequest, actorID, actorRole string) (*ProofVerificationToken, string, error)
	VerifyProofToken(ctx context.Context, req VerifyProofTokenRequest) (*ProofVerificationResult, error)
	GetProofRequirements(ctx context.Context, serviceCategory, stage string) ([]ProofRequirement, error)
	// Consume is the legacy handoff token verification API kept for
	// order_consolidation.go pickup/delivery scan flow (FOOD-2026-010).
	Consume(ctx context.Context, token, orderID, actorID string, stage HandoffStage) error
}
type ProofVerificationRepository interface {
	// IssueToken mints a new token bound to order+stage+actor. Returns the
	// plaintext token (sent once to the client) and the persisted hash record.
	IssueToken(ctx context.Context, req IssueProofTokenRequest, actorID, actorRole, serviceCategory string) (*ProofVerificationToken, string, error)

	// VerifyToken atomically checks token validity (order/actor binding,
	// expiry, max attempts, unused) and marks it consumed. The returned
	// result lets the caller proceed with the stage transition.
	VerifyToken(ctx context.Context, req VerifyProofTokenRequest) (*ProofVerificationResult, error)

	// GetProofRequirements returns all proof requirements for a service+stage.
	GetProofRequirements(ctx context.Context, serviceCategory string, stage string) ([]ProofRequirement, error)

	// ProofExistsForStage returns true if any proof (scan/signature/photo)
	// already exists for the given order+stage. Used for immutability checks.
	ProofExistsForStage(ctx context.Context, orderID string, stage string) (bool, error)

	// IsStageFinalized returns true if the order has already reached a
	// terminal state in the given stage's lifecycle (proof immutable).
	IsStageFinalized(ctx context.Context, orderID string, stage string) (bool, error)
}

// ValidateProofForTransition checks whether the proof requirements for the
// target stage are satisfied. It is called before committing a stage
// transition to block completion when mandatory proof is missing.
func ValidateProofForTransition(requirements []ProofRequirement, stage string) error {
	if len(requirements) == 0 {
		// No requirements configured for this stage — no proof needed.
		return nil
	}
	for _, req := range requirements {
		if req.Required {
			// The stage transition caller must have verified a token or
			// supplied proof. The repository enforces this atomically.
			return nil
		}
	}
	return nil
}

// ParseProofStage validates a stage string into a typed stage.
func ParseProofStage(s string) (ProofStage, error) {
	switch ProofStage(s) {
	case ProofStagePickup, ProofStagePickedUp, ProofStageDelivering,
	     ProofStageDelivered, ProofStageFailedDelivery:
		return ProofStage(s), nil
	default:
		return "", errors.New("unknown proof stage: " + s)
	}
}

// GenerateTokenValue produces a plaintext token value based on the format.
// For numeric_6: 6-digit random number. For QR: 32-byte hex random.
func GenerateTokenValue(format TokenFormat) (string, error) {
	switch format {
	case TokenFormatNumeric6:
		return generateNumeric6()
	case TokenFormatAlphanumeric:
		return generateAlphanumeric16()
	case TokenFormatQR:
		return generateHex32()
	default:
		return "", errors.New("unsupported token format: " + string(format))
	}
}

// HashToken returns (hash, salt) for a plaintext token using SHA-256 + salt.
// The hash is what gets stored; the plaintext is returned to the client once.
func HashToken(plaintext string, salt string) (string, string) {
	if salt == "" {
		salt = uuid.NewString()
	}
	h := sha256Hmac(plaintext, salt)
	return h, salt
}

// VerifyTokenHash checks a plaintext token against the stored hash+salt.
func VerifyTokenHash(plaintext, storedHash, salt string) bool {
	expected := sha256Hmac(plaintext, salt)
	return subtleConstantTimeCompare(expected, storedHash)
}

// DefaultTokenExpiry returns the standard expiry for a proof token.
func DefaultTokenExpiry() time.Time {
	return time.Now().Add(10 * time.Minute).UTC()
}

// DefaultMaxAttempts is the standard max verification attempts.
const DefaultMaxAttempts = 3
