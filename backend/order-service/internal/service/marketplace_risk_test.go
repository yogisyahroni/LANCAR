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

type riskConfigStub struct{ values map[string]json.RawMessage }

func (s riskConfigStub) GetConfig(_ context.Context, key string) (*domain.SystemConfig, error) {
	value, ok := s.values[key]
	if !ok {
		return nil, nil
	}
	return &domain.SystemConfig{Key: key, Value: value}, nil
}
func (riskConfigStub) GetFloatConfig(context.Context, string, float64) float64 { return 0 }
func (riskConfigStub) GetIntConfig(context.Context, string, int) int           { return 0 }
func (riskConfigStub) GetStringConfig(context.Context, string, string) string  { return "" }

type riskRepositoryStub struct {
	decisions []*domain.RiskDecision
}

func (r *riskRepositoryStub) SaveRiskDecision(_ context.Context, decision *domain.RiskDecision, _ json.RawMessage) error {
	r.decisions = append(r.decisions, decision)
	return nil
}

type riskPublisherStub struct {
	events []domain.CanonicalEventEnvelope
}

func (p *riskPublisherStub) PublishCanonical(_ context.Context, event domain.CanonicalEventEnvelope) error {
	p.events = append(p.events, event)
	return nil
}

type riskModelStub struct {
	result domain.RiskModelResult
	err    error
	delay  time.Duration
}

func (m riskModelStub) Evaluate(ctx context.Context, _ domain.RiskEvaluationRequest) (domain.RiskModelResult, error) {
	if m.delay > 0 {
		timer := time.NewTimer(m.delay)
		defer timer.Stop()
		select {
		case <-timer.C:
		case <-ctx.Done():
			return domain.RiskModelResult{}, ctx.Err()
		}
	}
	return m.result, m.err
}

func riskRequest(operation domain.RiskOperation) domain.RiskEvaluationRequest {
	return domain.RiskEvaluationRequest{
		Operation:      operation,
		MarketCode:     "id-jk",
		EntityType:     "order",
		EntityID:       "order-1",
		SubjectID:      "user-1",
		CorrelationID:  "correlation-1",
		IdempotencyKey: "risk-test-order-1",
	}
}

func TestAssessRiskCoversSignalCategoriesAndStandardDecisions(t *testing.T) {
	request := riskRequest(domain.RiskOperationOrderCreate)
	categories := []domain.RiskSignalCategory{
		domain.RiskSignalAccount, domain.RiskSignalDevice, domain.RiskSignalPayment,
		domain.RiskSignalPromo, domain.RiskSignalGPS, domain.RiskSignalHandoff,
		domain.RiskSignalRefund, domain.RiskSignalClaim, domain.RiskSignalProvider,
		domain.RiskSignalCollusion,
	}
	for _, category := range categories {
		request.Signals = append(request.Signals, domain.RiskSignal{
			Category: category, Code: string(category) + ".velocity", Score: 10, Source: "risk.test", ObservedAt: time.Now(),
		})
	}
	decision, err := domain.AssessRisk(request, domain.DefaultRiskPolicy("id-jk", request.Operation), nil)
	if err != nil {
		t.Fatal(err)
	}
	if decision.Decision != domain.RiskDecisionBlock || decision.RiskScore != 100 {
		t.Fatalf("expected capped BLOCK decision, got decision=%s score=%v", decision.Decision, decision.RiskScore)
	}
	if len(decision.ReasonCodes) != len(categories) {
		t.Fatalf("expected one reason per category, got %v", decision.ReasonCodes)
	}
}

func TestAssessRiskRejectsSensitiveAttributes(t *testing.T) {
	request := riskRequest(domain.RiskOperationOrderCreate)
	request.Signals = []domain.RiskSignal{{
		Category: domain.RiskSignalAccount, Code: "account.profile", Score: 1, Source: "risk.test",
		Attributes: map[string]string{"religion": "private"}, ObservedAt: time.Now(),
	}}
	if _, err := domain.AssessRisk(request, domain.DefaultRiskPolicy("id-jk", request.Operation), nil); !errors.Is(err, domain.ErrInvalidRiskSignal) {
		t.Fatalf("expected sensitive attribute rejection, got %v", err)
	}
}

func TestMarketplaceRiskPersistsReviewAndUsesStableIdempotency(t *testing.T) {
	repo := &riskRepositoryStub{}
	service := NewMarketplaceRiskService(nil, repo, nil, nil)
	request := riskRequest(domain.RiskOperationOrderCreate)
	request.Signals = []domain.RiskSignal{{
		Category: domain.RiskSignalPayment, Code: "payment.amount_high", Score: 95, Source: "risk.test", ObservedAt: time.Now(),
	}}
	first, err := service.Evaluate(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.Evaluate(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if first.Decision != domain.RiskDecisionBlock || first.ID != second.ID || len(repo.decisions) != 2 {
		t.Fatalf("expected stable BLOCK identities, first=%+v second=%+v saves=%d", first, second, len(repo.decisions))
	}
	if first.SubjectKeyHash == "" || first.SubjectKeyHash == request.SubjectID {
		t.Fatalf("subject must be pseudonymized: %q", first.SubjectKeyHash)
	}
}

func TestMarketplaceRiskPublishesPseudonymousCanonicalDecision(t *testing.T) {
	publisher := &riskPublisherStub{}
	service := NewMarketplaceRiskService(nil, nil, publisher, nil)
	request := riskRequest(domain.RiskOperationOrderCreate)
	if _, err := service.Evaluate(context.Background(), request); err != nil {
		t.Fatal(err)
	}
	if len(publisher.events) != 1 || publisher.events[0].EventType != "risk.decision" {
		t.Fatalf("expected one risk.decision event, got %+v", publisher.events)
	}
	payload, err := json.Marshal(publisher.events[0].Data)
	if err != nil {
		t.Fatal(err)
	}
	if string(payload) == "" || strings.Contains(string(payload), request.SubjectID) {
		t.Fatalf("canonical risk payload must not contain raw subject id: %s", payload)
	}
}

func TestMarketplaceRiskFailClosedOnPayoutEngineError(t *testing.T) {
	repo := &riskRepositoryStub{}
	service := NewMarketplaceRiskService(nil, repo, nil, riskModelStub{err: errors.New("provider unavailable")})
	decision, err := service.Evaluate(context.Background(), riskRequest(domain.RiskOperationPayoutRequest))
	if err != nil {
		t.Fatal(err)
	}
	if decision.Decision != domain.RiskDecisionHold || decision.FailureMode != domain.RiskFailureEngineError {
		t.Fatalf("expected fail-closed HOLD, got decision=%s mode=%s", decision.Decision, decision.FailureMode)
	}
}

func TestMarketplaceRiskFailOpenOnOrderModelTimeout(t *testing.T) {
	service := NewMarketplaceRiskService(nil, nil, nil, riskModelStub{delay: time.Second})
	decision, err := service.Evaluate(context.Background(), riskRequest(domain.RiskOperationOrderCreate))
	if err != nil {
		t.Fatal(err)
	}
	if decision.Decision != domain.RiskDecisionAllow || decision.FailureMode != domain.RiskFailureTimeout {
		t.Fatalf("expected fail-open ALLOW timeout, got decision=%s mode=%s", decision.Decision, decision.FailureMode)
	}
}

func TestMarketplaceRiskUsesOperationTimeoutPolicy(t *testing.T) {
	service := NewMarketplaceRiskService(nil, nil, nil, riskModelStub{delay: time.Second})
	decision, err := service.Evaluate(context.Background(), riskRequest(domain.RiskOperationPayoutRequest))
	if err != nil {
		t.Fatal(err)
	}
	if decision.Decision != domain.RiskDecisionHold || decision.FailureMode != domain.RiskFailureTimeout {
		t.Fatalf("expected fail-closed HOLD timeout, got decision=%s mode=%s", decision.Decision, decision.FailureMode)
	}
}

func TestMarketplaceRiskDefaultsMissingMarketToConfiguredDefault(t *testing.T) {
	request := riskRequest(domain.RiskOperationOrderCreate)
	request.MarketCode = ""
	decision, err := NewMarketplaceRiskService(nil, nil, nil, nil).Evaluate(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if decision.MarketCode != "id-jk" {
		t.Fatalf("expected default market id-jk, got %q", decision.MarketCode)
	}
}
