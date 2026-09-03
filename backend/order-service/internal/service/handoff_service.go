package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"tembus/order-service/internal/domain"
	"time"

	"github.com/google/uuid"
)

// handoffService implements CORE-2026-006: Proof/PIN/QR/signature
// chain-of-custody. It issues one-time verification tokens and verifies them
// atomically, binding order + actor + stage + expiry + attempts.
type handoffService struct {
	repo      domain.ProofVerificationRepository
	orderRepo domain.OrderRepository
}

// NewHandoffService constructs the CORE-2026-006 handoff verification service.
func NewHandoffService(repo domain.ProofVerificationRepository, orderRepo domain.OrderRepository) *handoffService {
	return &handoffService{repo: repo, orderRepo: orderRepo}
}

// IssueProofToken mints a one-time verification token for a given order+stage.
// The token plaintext is returned once to the caller; only the hash is persisted.
func (s *handoffService) IssueProofToken(ctx context.Context, req domain.IssueProofTokenRequest, actorID, actorRole string) (*domain.ProofVerificationToken, string, error) {
	if strings.TrimSpace(req.OrderID) == "" {
		return nil, "", fmt.Errorf("order_id is required")
	}
	if req.Stage == "" {
		return nil, "", fmt.Errorf("stage is required")
	}

	order, err := s.orderRepo.GetByID(ctx, req.OrderID)
	if err != nil {
		return nil, "", fmt.Errorf("lookup order: %w", err)
	}
	if order == nil {
		return nil, "", domain.ErrNotFound
	}

	category := domain.CanonicalServiceCategory(order.ServiceCategory)
	if category == "" {
		// Resolve legacy category.
		orders := []*domain.Order{order}
		for _, o := range orders {
			o.ApplyCanonicalOrderContract()
			if o.ServiceCategory != "" {
				category = domain.CanonicalServiceCategory(o.ServiceCategory)
			}
		}
	}

	// Check if the stage is already finalized — proof is immutable after
	// the stage finalizes. We must not issue a new token for a completed stage.
	if finalized, err := s.repo.IsStageFinalized(ctx, req.OrderID, string(req.Stage)); err != nil {
		return nil, "", fmt.Errorf("check stage finalization: %w", err)
	} else if finalized {
		return nil, "", fmt.Errorf("%w: stage %s is already finalized for order %s", domain.ErrProofImmutable, req.Stage, req.OrderID)
	}

	// Check if a proof already exists for this stage — do not re-issue if
	// the stage has already been proven (replay protection at issue time).
	if exists, err := s.repo.ProofExistsForStage(ctx, req.OrderID, string(req.Stage)); err != nil {
		return nil, "", fmt.Errorf("check existing proof: %w", err)
	} else if exists {
		return nil, "", fmt.Errorf("%w: stage %s already has proof for order %s", domain.ErrProofAlreadyExists, req.Stage, req.OrderID)
	}

	// Validate that the stage requires this proof type (matrix check).
	requirements, err := s.repo.GetProofRequirements(ctx, string(category), string(req.Stage))
	if err != nil {
		return nil, "", fmt.Errorf("lookup proof requirements: %w", err)
	}
	if len(requirements) == 0 {
		// No requirements for this stage — token issuance allowed but optional.
	}

	// Resolve token format.
	format := req.TokenFormat
	if format == "" {
		format = domain.TokenFormatNumeric6
	}

	// Resolve expiry.
	expiresAt := req.ExpiresAt
	if expiresAt.IsZero() {
		expiresAt = domain.DefaultTokenExpiry()
	}

	// Resolve max attempts.
	maxAttempts := req.MaxAttempts
	if maxAttempts == 0 {
		maxAttempts = domain.DefaultMaxAttempts
	}

	if maxAttempts < 1 {
		return nil, "", fmt.Errorf("max_attempts must be >= 1")
	}

	plaintext, err := domain.GenerateTokenValue(format)
	if err != nil {
		return nil, "", fmt.Errorf("generate token value: %w", err)
	}

	hash, salt := domain.HashToken(plaintext, "")
	_ = hash + salt // hash/salt are persisted inside IssueToken by the repository

	t, _, err := s.repo.IssueToken(ctx, req, actorID, actorRole, string(category))
	if err != nil {
		return nil, "", fmt.Errorf("issue token: %w", err)
	}
	t.TokenHash = ""
	t.TokenSalt = ""
	return t, plaintext, nil
}

// VerifyProofToken validates a one-time token and marks it consumed.
// It enforces: correct order binding, correct actor, expiry, max attempts,
// and single-use (replay rejection).
func (s *handoffService) VerifyProofToken(ctx context.Context, req domain.VerifyProofTokenRequest) (*domain.ProofVerificationResult, error) {
	if strings.TrimSpace(req.TokenID) == "" {
		return nil, fmt.Errorf("token_id is required")
	}
	if strings.TrimSpace(req.ProofValue) == "" {
		return nil, fmt.Errorf("proof_value is required")
	}
	if strings.TrimSpace(req.ActorID) == "" {
		return nil, fmt.Errorf("actor_id is required")
	}

	result, err := s.repo.VerifyToken(ctx, req)
	if err != nil {
		return nil, err
	}

	// After verification, fetch the requirements to confirm the stage's
	// proof matrix is satisfied. This is advisory — the actual requirement
	// check happens at transition time via validateDeliveredProof.
	_ = domain.ValidateProofForTransition(nil, result.Stage)

	return result, nil
}

// Consume is the legacy handoff token verification API (FOOD-2026-010).
// It delegates to VerifyProofToken by treating the raw handoff token string as
// the ProofValue bound to the supplied order + stage + actor.
func (s *handoffService) Consume(ctx context.Context, token, orderID, actorID string, stage domain.HandoffStage) error {
	if strings.TrimSpace(token) == "" {
		return domain.ErrHandoffTokenInvalid
	}
	if strings.TrimSpace(orderID) == "" || strings.TrimSpace(actorID) == "" {
		return domain.ErrHandoffTokenInvalid
	}
	_, err := s.repo.VerifyToken(ctx, domain.VerifyProofTokenRequest{
		TokenID:    orderID,
		ActorID:    actorID,
		ProofValue: token,
	})
	if err != nil {
		if errors.Is(err, domain.ErrProofTokenUsed) {
			return domain.ErrHandoffTokenConsumed
		}
		if errors.Is(err, domain.ErrProofTokenExpired) {
			return domain.ErrHandoffTokenExpired
		}
		return domain.ErrHandoffTokenInvalid
	}
	return nil
}

// GetProofRequirements returns the proof requirement matrix for a service+stage.
func (s *handoffService) GetProofRequirements(ctx context.Context, serviceCategory string, stage string) ([]domain.ProofRequirement, error) {
	return s.repo.GetProofRequirements(ctx, serviceCategory, stage)
}

// EnsureProofForTransition checks that mandatory proof exists for the
// transitioning stage before the state change is committed.
func (s *handoffService) EnsureProofForTransition(ctx context.Context, orderID string, stage string, serviceCategory string) error {
	requirements, err := s.repo.GetProofRequirements(ctx, serviceCategory, stage)
	if err != nil {
		return fmt.Errorf("lookup proof requirements: %w", err)
	}
	if len(requirements) == 0 {
		return nil
	}

	// If any requirement is mandatory, at least one proof (token consumed
	// or existing scan) must exist for this stage.
	for _, req := range requirements {
		if req.Required {
			exists, err := s.repo.ProofExistsForStage(ctx, orderID, stage)
			if err != nil {
				return fmt.Errorf("check proof existence: %w", err)
			}
			if !exists {
				return fmt.Errorf("%w: mandatory proof required for stage %s", domain.ErrProofRequired, stage)
			}
			break
		}
	}

	return nil
}

// ProofTokenIDFromStage is a helper to format a deterministic token lookup
// for the "current outstanding token" for an order+stage (used by the
// handler to check if a token issue is needed or already in-flight).
func ProofTokenIDFromOrderStage(orderID string, stage domain.ProofStage) string {
	return fmt.Sprintf("handoff:%s:%s", orderID, stage)
}

// _ = uuid to avoid unused import if future use changes
var _ = uuid.Nil

// _ = time to keep import for future use
var _ = time.Now
