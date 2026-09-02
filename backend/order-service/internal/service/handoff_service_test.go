package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"tembus/order-service/internal/domain"
)

type handoffRepoStub struct {
	token      *domain.HandoffToken
	consumeErr error
}

func (r *handoffRepoStub) CreateHandoffToken(_ context.Context, token *domain.HandoffToken) error {
	r.token = token
	return nil
}
func (r *handoffRepoStub) ConsumeHandoffToken(_ context.Context, hash, orderID, actorID string, stage domain.HandoffStage, now time.Time) error {
	if r.consumeErr != nil {
		return r.consumeErr
	}
	if r.token == nil || r.token.TokenHash != hash || r.token.OrderID != orderID || r.token.ActorID != actorID || r.token.Stage != stage {
		return domain.ErrHandoffTokenInvalid
	}
	if !now.Before(r.token.ExpiresAt) {
		return domain.ErrHandoffTokenExpired
	}
	if r.token.ConsumedAt != nil {
		return domain.ErrHandoffTokenConsumed
	}
	r.token.Attempts++
	consumed := now
	r.token.ConsumedAt = &consumed
	return nil
}

func TestHandoffServiceIssueAndConsumeIsOneTime(t *testing.T) {
	repo := &handoffRepoStub{}
	svc := &handoffService{
		repo:    repo,
		now:     func() time.Time { return time.Date(2026, 9, 2, 0, 0, 0, 0, time.UTC) },
		newCode: func() (string, error) { return "secret-handoff-code", nil },
	}
	orderID := "11111111-1111-4111-8111-111111111111"
	actorID := "22222222-2222-4222-8222-222222222222"
	code, record, err := svc.Issue(context.Background(), orderID, actorID, domain.HandoffStageDelivery, time.Minute)
	if err != nil || code != "secret-handoff-code" || record.ExpiresAt.IsZero() {
		t.Fatalf("issue token failed: code=%q record=%#v err=%v", code, record, err)
	}
	if err := svc.Consume(context.Background(), code, orderID, actorID, domain.HandoffStageDelivery); err != nil {
		t.Fatalf("first consume failed: %v", err)
	}
	repo.consumeErr = domain.ErrHandoffTokenConsumed
	if err := svc.Consume(context.Background(), code, orderID, actorID, domain.HandoffStageDelivery); !errors.Is(err, domain.ErrHandoffTokenConsumed) {
		t.Fatalf("expected replay rejection, got %v", err)
	}
}

func TestHandoffServiceRejectsWrongActorOrderAndStage(t *testing.T) {
	repo := &handoffRepoStub{}
	svc := &handoffService{repo: repo, now: time.Now, newCode: func() (string, error) { return "code", nil }}
	orderID := "11111111-1111-4111-8111-111111111111"
	actorID := "22222222-2222-4222-8222-222222222222"
	code, _, err := svc.Issue(context.Background(), orderID, actorID, domain.HandoffStagePickup, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.Consume(context.Background(), code, "33333333-3333-4333-8333-333333333333", actorID, domain.HandoffStagePickup); !errors.Is(err, domain.ErrHandoffTokenInvalid) {
		t.Fatalf("expected wrong-order rejection, got %v", err)
	}
	if err := svc.Consume(context.Background(), code, orderID, "44444444-4444-4444-8444-444444444444", domain.HandoffStagePickup); !errors.Is(err, domain.ErrHandoffTokenInvalid) {
		t.Fatalf("expected wrong-actor rejection, got %v", err)
	}
	if err := svc.Consume(context.Background(), code, orderID, actorID, domain.HandoffStageDelivery); !errors.Is(err, domain.ErrHandoffTokenInvalid) {
		t.Fatalf("expected wrong-stage rejection, got %v", err)
	}
}
