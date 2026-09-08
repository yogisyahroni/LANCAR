package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"tembus/order-service/internal/domain"
	"testing"
	"time"
)

type dispatchModelStub struct {
	output domain.DispatchModelOutput
	err    error
}

type canonicalEventStub struct {
	event *domain.CanonicalEventEnvelope
}

func (p *canonicalEventStub) PublishCanonical(_ context.Context, event domain.CanonicalEventEnvelope) error {
	p.event = &event
	return nil
}

func (m dispatchModelStub) Predict(context.Context, domain.DispatchCandidateInput) (domain.DispatchModelOutput, error) {
	return m.output, m.err
}

func TestScoreDispatchCandidateUsesOperationalFeaturesAndConstraints(t *testing.T) {
	policy := domain.DefaultDispatchScoringPolicy()
	decision, err := domain.ScoreDispatchCandidate(policy, domain.DispatchCandidateInput{
		CandidateID:                "courier-1",
		DistanceKM:                 2,
		CourierTravelMinutes:       5,
		DeliveryTravelMinutes:      12,
		ActiveWorkload:             0,
		AcceptanceRate:             95,
		CompletionRate:             98,
		RelayScore:                 4.8,
		AverageRating:              4.9,
		CapabilityFit:              1,
		VehicleFit:                 1,
		MarketplaceConstraintScore: 1,
		FoodMatchingScore:          1,
		Now:                        time.Date(2026, 9, 9, 10, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("score candidate: %v", err)
	}
	if !decision.Eligible || decision.Score <= 0.5 {
		t.Fatalf("expected strong eligible candidate, got %+v", decision)
	}
	if decision.Breakdown.Acceptance != 0.95 || decision.Breakdown.Completion != 0.98 {
		t.Fatalf("expected acceptance/completion components, got %+v", decision.Breakdown)
	}

	tooFar, err := domain.ScoreDispatchCandidate(policy, domain.DispatchCandidateInput{CandidateID: "far", DistanceKM: 21, CapabilityFit: 1, VehicleFit: 1, MarketplaceConstraintScore: 1, FoodMatchingScore: 1})
	if err != nil {
		t.Fatalf("score far candidate: %v", err)
	}
	if tooFar.Eligible || !containsString(tooFar.ConstraintReasons, "distance_exceeds_policy") {
		t.Fatalf("expected distance constraint, got %+v", tooFar)
	}
}

func TestFoodMatchingSignalsModelPrepReadinessWaitingAndBatchCompatibility(t *testing.T) {
	signals := domain.BuildFoodMatchingSignals(8, 2, true, true, 2, 10, 5)
	if signals.WaitingRisk <= 0 || signals.ReadinessAlignment <= 0 || signals.BatchingCompatibility != 0.6 {
		t.Fatalf("unexpected food signals: %+v", signals)
	}
	if signals.Score <= 0 || signals.Score >= 1 {
		t.Fatalf("expected bounded food score, got %+v", signals)
	}

	forbidden := domain.BuildFoodMatchingSignals(0, 0, false, true, 0, 10, 5)
	if forbidden.BatchingCompatibility != 0 {
		t.Fatalf("expected batching incompatibility when product disallows batching, got %+v", forbidden)
	}
}

func TestPredictFoodDispatchETAIsPredictionOnly(t *testing.T) {
	now := time.Date(2026, 9, 9, 10, 0, 0, 0, time.UTC)
	ready := now.Add(8 * time.Minute)
	order := &domain.Order{Status: domain.StatusSearching}
	eta := domain.PredictFoodDispatchETA(now, &ready, 3, 12, 2, "rules", "medium", "dispatch-rules-2026-v1")
	if eta.TotalMinutes != 22 || !eta.PredictedAt.Equal(now.Add(22*time.Minute)) {
		t.Fatalf("unexpected ETA: %+v", eta)
	}
	if order.Status != domain.StatusSearching {
		t.Fatal("ETA prediction must not mutate authoritative order state")
	}
	if eta.Source != "rules" || eta.Confidence != "medium" {
		t.Fatalf("expected source/confidence metadata, got %+v", eta)
	}
}

func TestMarketplaceIntelligenceFallsBackOnModelFailureOrInvalidOutput(t *testing.T) {
	input := domain.DispatchCandidateInput{CandidateID: "courier-1", DistanceKM: 1, CapabilityFit: 1, VehicleFit: 1, MarketplaceConstraintScore: 1, FoodMatchingScore: 1}
	modelError := &MarketplaceIntelligence{model: dispatchModelStub{err: errors.New("unavailable")}}
	decision := modelError.Evaluate(context.Background(), input)
	if !decision.UsedFallback || decision.FallbackReason != "model_error" || decision.Source != "rules" {
		t.Fatalf("expected model-error fallback, got %+v", decision)
	}

	invalidModel := &MarketplaceIntelligence{model: dispatchModelStub{output: domain.DispatchModelOutput{Score: 2, Source: "model", Confidence: "high"}}}
	decision = invalidModel.Evaluate(context.Background(), input)
	if !decision.UsedFallback || decision.FallbackReason != "invalid_model_output" {
		t.Fatalf("expected invalid-output fallback, got %+v", decision)
	}

	workingModel := &MarketplaceIntelligence{model: dispatchModelStub{output: domain.DispatchModelOutput{Score: 0.91, Source: "ml", Confidence: "high", ModelVersion: "model-test-v1"}}}
	decision = workingModel.Evaluate(context.Background(), input)
	if decision.UsedFallback || decision.Score != 0.91 || decision.Source != "ml" || decision.ModelVersion != "model-test-v1" {
		t.Fatalf("expected model decision, got %+v", decision)
	}
}

func TestHashDispatchIdentityDoesNotExposeCourierID(t *testing.T) {
	hash := hashDispatchIdentity("order-1", "courier-secret-id")
	if len(hash) != 64 || strings.Contains(hash, "courier-secret-id") {
		t.Fatalf("expected one-way candidate hash, got %q", hash)
	}
}

func TestRecordDecisionPublishesGovernedAuditEventWithoutRawCourierID(t *testing.T) {
	publisher := &canonicalEventStub{}
	intelligence := NewMarketplaceIntelligence(nil, publisher, nil)
	order := &domain.Order{ID: "order-1", CorrelationID: "correlation-1"}
	decision := intelligence.Evaluate(context.Background(), domain.DispatchCandidateInput{CandidateID: "courier-secret-id", DistanceKM: 1, CapabilityFit: 1, VehicleFit: 1, MarketplaceConstraintScore: 1, FoodMatchingScore: 1})
	intelligence.RecordDecision(context.Background(), order, "courier-secret-id", decision, 1)
	if publisher.event == nil || publisher.event.EventType != "dispatch.decision" {
		t.Fatalf("expected dispatch audit event, got %+v", publisher.event)
	}
	if publisher.event.CorrelationID != order.CorrelationID || publisher.event.PIIClassification != "internal" {
		t.Fatalf("expected correlation and privacy classification, got %+v", publisher.event)
	}
	payload, err := json.Marshal(publisher.event.Data)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(payload), "courier-secret-id") {
		t.Fatalf("raw courier id leaked into audit payload: %s", payload)
	}
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
