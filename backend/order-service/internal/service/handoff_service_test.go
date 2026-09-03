package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"tembus/order-service/internal/domain"
)

// handoffRepoStub implements domain.ProofVerificationRepository for tests.
type handoffRepoStub struct {
	token        *domain.HandoffToken
	consumeErr   error
	verifyErr    error
	requirements []domain.ProofRequirement
}

func (r *handoffRepoStub) IssueToken(_ context.Context, req domain.IssueProofTokenRequest, actorID, actorRole string, serviceCategory string) (*domain.ProofVerificationToken, string, error) {
	plaintext := "secret-handoff-code"
	record := &domain.ProofVerificationToken{
		ID:              req.OrderID,
		OrderID:         req.OrderID,
		ServiceCategory: serviceCategory,
		Stage:           req.Stage,
		ActorID:         actorID,
		ActorRole:       actorRole,
		ExpiresAt:       time.Now().Add(time.Minute),
	}
	r.token = &domain.HandoffToken{
		TokenHash:   plaintext,
		OrderID:     req.OrderID,
		Stage:       domain.HandoffStage(req.Stage),
		ActorID:     actorID,
		ExpiresAt:   record.ExpiresAt,
		Attempts:    0,
		MaxAttempts: 3,
	}
	return record, plaintext, nil
}

func (r *handoffRepoStub) VerifyToken(_ context.Context, req domain.VerifyProofTokenRequest) (*domain.ProofVerificationResult, error) {
	if r.verifyErr != nil {
		return nil, r.verifyErr
	}
	if r.token == nil {
		return nil, domain.ErrProofTokenInvalid
	}
	return &domain.ProofVerificationResult{
		TokenID:  r.token.ID,
		OrderID:  r.token.OrderID,
		Consumed: false,
		Stage:    string(r.token.Stage),
	}, nil
}

func (r *handoffRepoStub) GetProofRequirements(_ context.Context, serviceCategory, stage string) ([]domain.ProofRequirement, error) {
	return r.requirements, nil
}

func (r *handoffRepoStub) ProofExistsForStage(_ context.Context, orderID, stage string) (bool, error) {
	return r.token != nil, nil
}

func (r *handoffRepoStub) IsStageFinalized(_ context.Context, orderID, stage string) (bool, error) {
	return r.token != nil && r.token.ConsumedAt != nil, nil
}

// minimal stub methods to satisfy remaining interface methods if any
func (r *handoffRepoStub) CreateHandoffToken(_ context.Context, token *domain.HandoffToken) error {
	r.token = token
	return nil
}
func (r *handoffRepoStub) ConsumeHandoffToken(_ context.Context, hash, orderID, actorID string, stage domain.HandoffStage, now time.Time) error {
	if r.consumeErr != nil {
		return r.consumeErr
	}
	if r.token == nil || r.token.TokenHash != hash || r.token.OrderID != orderID || r.token.ActorID != actorID {
		return domain.ErrHandoffTokenInvalid
	}
	return nil
}

func TestHandoffServiceIssueAndConsumeIsOneTime(t *testing.T) {
	repo := &handoffRepoStub{}
	svc := &handoffService{repo: repo}
	orderID := "11111111-1111-4111-8111-111111111111"
	actorID := "22222222-2222-4222-8222-222222222222"
	_, code, err := svc.IssueProofToken(context.Background(), domain.IssueProofTokenRequest{
		OrderID: orderID,
		Stage:   "delivery",
	}, actorID, "courier")
	if err != nil || code == "" {
		t.Fatalf("issue token failed: code=%q err=%v", code, err)
	}
	// Consume via legacy path (FOOD-2026-010)
	if err := svc.Consume(context.Background(), code, orderID, actorID, domain.HandoffStageDelivery); err != nil {
		t.Fatalf("first consume failed: %v", err)
	}
	// Replay rejection via stub error
	repo.consumeErr = domain.ErrHandoffTokenConsumed
	if err := svc.Consume(context.Background(), code, orderID, actorID, domain.HandoffStageDelivery); !errors.Is(err, domain.ErrHandoffTokenConsumed) {
		t.Fatalf("expected replay rejection, got %v", err)
	}
}

func TestHandoffServiceRejectsWrongActorOrderAndStage(t *testing.T) {
	repo := &handoffRepoStub{}
	svc := &handoffService{repo: repo}
	orderID := "11111111-1111-4111-8111-111111111111"
	actorID := "22222222-2222-4222-8222-222222222222"
	_, code, err := svc.IssueProofToken(context.Background(), domain.IssueProofTokenRequest{
		OrderID: orderID,
		Stage:   "pickup",
	}, actorID, "courier")
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.Consume(context.Background(), code, "33333333-3333-4333-8333-333333333333", actorID, domain.HandoffStagePickup); !errors.Is(err, domain.ErrHandoffTokenInvalid) {
		t.Fatalf("expected wrong-order rejection, got %v", err)
	}
	if err := svc.Consume(context.Background(), code, orderID, "44444444-4444-4444-8444-444444444444", domain.HandoffStagePickup); !errors.Is(err, domain.ErrHandoffTokenInvalid) {
		t.Fatalf("expected wrong-actor rejection, got %v", err)
	}
}
