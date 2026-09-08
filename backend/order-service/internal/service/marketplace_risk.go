package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"tembus/order-service/internal/domain"
	"time"

	"github.com/google/uuid"
)

// MarketplaceRiskService is the canonical risk decision boundary for
// transactional order operations. It deliberately lives beside the order
// transaction boundary so a risk outage cannot create a second source of
// order truth or introduce a distributed transaction.
type MarketplaceRiskService struct {
	configRepo         domain.ConfigRepository
	repository         domain.RiskRepository
	canonicalPublisher domain.CanonicalEventPublisher
	model              domain.RiskModel
}

func NewMarketplaceRiskService(configRepo domain.ConfigRepository, repository domain.RiskRepository, publisher domain.CanonicalEventPublisher, model domain.RiskModel) *MarketplaceRiskService {
	return &MarketplaceRiskService{
		configRepo:         configRepo,
		repository:         repository,
		canonicalPublisher: publisher,
		model:              model,
	}
}

func (s *MarketplaceRiskService) SetCanonicalEventPublisher(publisher domain.CanonicalEventPublisher) {
	s.canonicalPublisher = publisher
}

func (s *MarketplaceRiskService) SetModel(model domain.RiskModel) {
	s.model = model
}

func (s *MarketplaceRiskService) Policy(ctx context.Context, market string, operation domain.RiskOperation) domain.RiskPolicy {
	market = normalizeRiskMarket(market)
	policy := domain.DefaultRiskPolicy(market, operation)
	if s.configRepo == nil {
		return policy
	}
	key := fmt.Sprintf("risk.policy.%s.%s", market, operation)
	config, err := s.configRepo.GetConfig(ctx, key)
	if err != nil || config == nil || len(config.Value) == 0 {
		return policy
	}
	var configured domain.RiskPolicy
	if err := json.Unmarshal(config.Value, &configured); err != nil {
		log.Printf("[Risk] invalid policy config %s; using safe default: %v", key, err)
		return policy
	}
	return normalizeRiskPolicy(configured, policy)
}

func (s *MarketplaceRiskService) Evaluate(ctx context.Context, request domain.RiskEvaluationRequest) (domain.RiskDecision, error) {
	request.MarketCode = normalizeRiskMarket(request.MarketCode)
	policy := s.Policy(ctx, request.MarketCode, request.Operation)
	if err := request.Validate(policy); err != nil {
		return domain.RiskDecision{}, err
	}
	if request.CorrelationID == "" {
		request.CorrelationID = correlationIDFromContext(ctx)
	}
	if request.IdempotencyKey == "" {
		request.IdempotencyKey = fmt.Sprintf("risk:%s:%s:%s", request.Operation, request.EntityType, request.EntityID)
	}

	decision := domain.RiskDecision{}
	var modelResult *domain.RiskModelResult
	if s.model != nil {
		modelCtx, cancel := context.WithTimeout(ctx, time.Duration(policy.TimeoutMillis)*time.Millisecond)
		result, err := s.model.Evaluate(modelCtx, request)
		modelContextErr := modelCtx.Err()
		cancel()
		if err != nil {
			timedOut := errors.Is(err, context.DeadlineExceeded) || errors.Is(modelContextErr, context.DeadlineExceeded)
			mode := policy.OnEngineError
			if timedOut {
				mode = policy.OnTimeout
			}
			if mode != domain.RiskFailureMode("fail_open") && mode != domain.RiskFailureMode("fail_closed") {
				mode = "fail_closed"
			}
			decision = domain.FallbackRiskDecision(request, policy, mode, "risk.engine_error")
			if timedOut {
				decision.FailureMode = domain.RiskFailureTimeout
				decision.ReasonCodes = []string{"risk.timeout"}
			} else {
				decision.FailureMode = domain.RiskFailureEngineError
			}
		} else {
			modelResult = &result
		}
	}
	if decision.Decision == "" {
		var err error
		decision, err = domain.AssessRisk(request, policy, modelResult)
		if err != nil {
			return domain.RiskDecision{}, err
		}
	}

	// Stable decision identity makes a retried checkpoint idempotent while
	// retaining separate decisions for separately keyed operations.
	decision.IdempotencyKey = request.IdempotencyKey
	decision.ID = uuid.NewSHA1(uuid.NameSpaceURL, []byte(string(request.Operation)+"|"+request.MarketCode+"|"+request.IdempotencyKey)).String()
	decision.SubjectKeyHash = domain.HashRiskSubject(request.SubjectID)
	decision.CreatedAt = time.Now().UTC()
	for i := range decision.Signals {
		decision.Signals[i].SubjectKeyHash = decision.SubjectKeyHash
	}
	if s.repository != nil {
		reviewEvidence, marshalErr := json.Marshal(map[string]interface{}{
			"source":       "marketplace_risk_engine",
			"signal_count": len(decision.Signals),
			"reason_codes": decision.ReasonCodes,
		})
		if marshalErr != nil {
			return domain.RiskDecision{}, marshalErr
		}
		if err := s.repository.SaveRiskDecision(ctx, &decision, reviewEvidence); err != nil {
			fallbackMode := policy.OnEngineError
			if fallbackMode != "fail_open" && fallbackMode != "fail_closed" {
				fallbackMode = "fail_closed"
			}
			fallback := domain.FallbackRiskDecision(request, policy, fallbackMode, "risk.persistence_error")
			fallback.ID = decision.ID
			fallback.IdempotencyKey = decision.IdempotencyKey
			fallback.SubjectKeyHash = decision.SubjectKeyHash
			fallback.CreatedAt = decision.CreatedAt
			decision.FailureMode = domain.RiskFailurePersistError
			fallback.FailureMode = domain.RiskFailurePersistError
			return fallback, fmt.Errorf("persist risk decision: %w", err)
		}
	}
	s.publishDecision(ctx, decision)
	return decision, nil
}

// ServerRiskSignals builds only facts already validated by the transaction
// service. Client-supplied risk scores, exact GPS, identity attributes, and
// payment credentials are never accepted here.
func ServerRiskSignals(order *domain.Order, source string) []domain.RiskSignal {
	if order == nil {
		return nil
	}
	now := time.Now().UTC()
	signals := []domain.RiskSignal{
		{Category: domain.RiskSignalAccount, Code: "account.authenticated", Score: 0, Source: source, ObservedAt: now},
	}
	if strings.TrimSpace(order.PromoCode) != "" {
		signals = append(signals, domain.RiskSignal{
			Category: domain.RiskSignalPromo, Code: "promo.code_present", Score: 8, Source: source, ObservedAt: now,
			Attributes: map[string]string{"velocity_band": "unknown"},
		})
	}
	if order.TotalPriceMinor >= 100000000 {
		signals = append(signals, domain.RiskSignal{
			Category: domain.RiskSignalPayment, Code: "payment.amount_high", Score: 25, Source: source, ObservedAt: now,
			Attributes: map[string]string{"amount_band": "high", "currency": order.Currency},
		})
	}
	if order.LogisticsProvider != "" {
		signals = append(signals, domain.RiskSignal{
			Category: domain.RiskSignalProvider, Code: "provider.selected", Score: 0, Source: source, ObservedAt: now,
			Attributes: map[string]string{"provider_code": strings.ToLower(strings.TrimSpace(order.LogisticsProvider))},
		})
	}
	return signals
}

func (s *orderServiceImpl) evaluateRiskCheckpoint(ctx context.Context, operation domain.RiskOperation, order *domain.Order, subjectID, idempotencyKey string, extra []domain.RiskSignal) (domain.RiskDecision, error) {
	return s.evaluateRiskCheckpointForMarket(ctx, operation, order, "id-jk", subjectID, idempotencyKey, extra)
}

func (s *orderServiceImpl) evaluateRiskCheckpointForMarket(ctx context.Context, operation domain.RiskOperation, order *domain.Order, market, subjectID, idempotencyKey string, extra []domain.RiskSignal) (domain.RiskDecision, error) {
	if s.riskService == nil || order == nil {
		return domain.RiskDecision{Decision: domain.RiskDecisionAllow}, nil
	}
	signals := ServerRiskSignals(order, "order-service."+string(operation))
	signals = append(signals, extra...)
	return s.riskService.Evaluate(ctx, domain.RiskEvaluationRequest{
		Operation:      operation,
		MarketCode:     market,
		EntityType:     "order",
		EntityID:       order.ID,
		SubjectID:      subjectID,
		CorrelationID:  order.CorrelationID,
		IdempotencyKey: idempotencyKey,
		Signals:        signals,
	})
}

func riskCheckpointError(decision domain.RiskDecision, evaluationErr error) error {
	// An explicitly fail-open policy may continue when persistence/model
	// infrastructure is unavailable and the returned fallback is ALLOW. Every
	// fail-closed fallback is HOLD and therefore stops the checkpoint.
	if evaluationErr != nil && decision.Decision == domain.RiskDecisionAllow {
		log.Printf("[Risk] fail-open checkpoint continuation: operation=%s entity_type=%s entity_id=%s mode=%s", decision.Operation, decision.EntityType, decision.EntityID, decision.FailureMode)
		return nil
	}
	if evaluationErr != nil {
		return fmt.Errorf("risk checkpoint unavailable: %w", evaluationErr)
	}
	if decision.Decision == domain.RiskDecisionAllow {
		return nil
	}
	return fmt.Errorf("risk decision %s requires verification before continuing (reason=%s)", decision.Decision, strings.Join(decision.ReasonCodes, ","))
}

// Assess is a pure helper for callers that need to validate a decision
// without persisting it. Production checkpoints use Evaluate.
func (s *MarketplaceRiskService) Assess(ctx context.Context, request domain.RiskEvaluationRequest) (domain.RiskDecision, error) {
	request.MarketCode = normalizeRiskMarket(request.MarketCode)
	policy := s.Policy(ctx, request.MarketCode, request.Operation)
	decision, err := domain.AssessRisk(request, policy, nil)
	if err != nil {
		return domain.RiskDecision{}, err
	}
	decision.ID = uuid.NewString()
	decision.SubjectKeyHash = domain.HashRiskSubject(request.SubjectID)
	decision.CreatedAt = time.Now().UTC()
	return decision, nil
}

func normalizeRiskMarket(market string) string {
	market = strings.ToLower(strings.TrimSpace(market))
	if market == "" {
		return "id-jk"
	}
	return market
}

func normalizeRiskPolicy(configured, fallback domain.RiskPolicy) domain.RiskPolicy {
	// The config key is authoritative for scope. A malformed payload must not
	// make an order operation inherit another market or operation's policy.
	configured.MarketCode = fallback.MarketCode
	configured.Operation = fallback.Operation
	if strings.TrimSpace(configured.Version) == "" {
		configured.Version = fallback.Version
	}
	if configured.TimeoutMillis < 10 || configured.TimeoutMillis > 5000 {
		configured.TimeoutMillis = fallback.TimeoutMillis
	}
	if configured.OnTimeout != "fail_open" && configured.OnTimeout != "fail_closed" {
		configured.OnTimeout = fallback.OnTimeout
	}
	if configured.OnEngineError != "fail_open" && configured.OnEngineError != "fail_closed" {
		configured.OnEngineError = fallback.OnEngineError
	}
	if configured.ChallengeScore <= 0 {
		configured.ChallengeScore = fallback.ChallengeScore
	}
	if configured.ReviewScore <= configured.ChallengeScore {
		configured.ReviewScore = fallback.ReviewScore
	}
	if configured.HoldScore <= configured.ReviewScore {
		configured.HoldScore = fallback.HoldScore
	}
	if configured.BlockScore <= configured.HoldScore || configured.BlockScore > 100 {
		configured.BlockScore = fallback.BlockScore
	}
	configured.SensitiveAllowed = false
	return configured
}

func (s *MarketplaceRiskService) publishDecision(ctx context.Context, decision domain.RiskDecision) {
	if s.canonicalPublisher == nil {
		return
	}
	// The event contains only a pseudonymous subject and coarse signals. Raw
	// user/courier IDs and exact location/payment data are intentionally absent.
	event := domain.NewCanonicalEvent("risk.decision", decision.EntityID, "", map[string]interface{}{
		"decision_id":    decision.ID,
		"operation":      decision.Operation,
		"market_code":    decision.MarketCode,
		"entity_type":    decision.EntityType,
		"decision":       decision.Decision,
		"risk_score":     decision.RiskScore,
		"reason_codes":   decision.ReasonCodes,
		"policy_version": decision.PolicyVersion,
		"failure_mode":   decision.FailureMode,
		"subject_hash":   decision.SubjectKeyHash,
	})
	if decision.CorrelationID != "" {
		event.CorrelationID = decision.CorrelationID
		event.TraceID = decision.CorrelationID
	}
	if err := s.canonicalPublisher.PublishCanonical(ctx, event); err != nil {
		log.Printf("[Risk] canonical decision event publish failed: %v", err)
	}
}

func correlationIDFromContext(ctx context.Context) string {
	if value, ok := ctx.Value(correlationContextKey{}).(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
}

type correlationContextKey struct{}
