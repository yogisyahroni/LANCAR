package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log"
	"math"
	"strings"
	"tembus/order-service/internal/domain"
)

// MarketplaceIntelligence owns dispatch decision policy and audit emission.
// The model is optional: deterministic rules remain the safe path whenever a
// model is absent, unavailable, or returns an invalid result.
type MarketplaceIntelligence struct {
	configRepo         domain.ConfigRepository
	canonicalPublisher domain.CanonicalEventPublisher
	model              domain.DispatchModel
}

func NewMarketplaceIntelligence(configRepo domain.ConfigRepository, publisher domain.CanonicalEventPublisher, model domain.DispatchModel) *MarketplaceIntelligence {
	return &MarketplaceIntelligence{configRepo: configRepo, canonicalPublisher: publisher, model: model}
}

func (m *MarketplaceIntelligence) SetCanonicalEventPublisher(publisher domain.CanonicalEventPublisher) {
	if m != nil {
		m.canonicalPublisher = publisher
	}
}

func (m *MarketplaceIntelligence) Evaluate(ctx context.Context, input domain.DispatchCandidateInput) domain.DispatchDecision {
	return m.EvaluateWithPolicy(ctx, input, m.loadPolicy(ctx))
}

func (m *MarketplaceIntelligence) Policy(ctx context.Context) domain.DispatchScoringPolicy {
	return m.loadPolicy(ctx)
}

func (m *MarketplaceIntelligence) EvaluateWithPolicy(ctx context.Context, input domain.DispatchCandidateInput, policy domain.DispatchScoringPolicy) domain.DispatchDecision {
	policy = policy.Normalized()
	decision, err := domain.ScoreDispatchCandidate(policy, input)
	if err != nil {
		// An invalid feature vector must never be promoted to an offer. Returning
		// a deterministic ineligible decision keeps order state untouched.
		return domain.DispatchDecision{
			CandidateID:       input.CandidateID,
			ModelVersion:      policy.ModelVersion,
			RuleVersion:       policy.RuleVersion,
			Source:            "rules",
			Confidence:        "low",
			UsedFallback:      true,
			FallbackReason:    "invalid_feature_vector",
			Eligible:          false,
			ConstraintReasons: []string{"invalid_feature_vector"},
		}
	}

	decision.UsedFallback = true
	decision.FallbackReason = "model_not_configured"
	if m != nil && m.model != nil {
		output, modelErr := m.model.Predict(ctx, input)
		switch {
		case modelErr != nil:
			decision.FallbackReason = "model_error"
			log.Printf("[MarketplaceIntelligence] model fallback candidate=%s reason=%s err=%v", hashDispatchIdentity(input.CandidateID, input.ServiceCode), decision.FallbackReason, modelErr)
		case !validModelOutput(output):
			decision.FallbackReason = "invalid_model_output"
			log.Printf("[MarketplaceIntelligence] model fallback candidate=%s reason=%s", hashDispatchIdentity(input.CandidateID, input.ServiceCode), decision.FallbackReason)
		default:
			decision.Score = clampScore(output.Score)
			decision.Source = firstIntelligenceNonEmpty(output.Source, "model")
			decision.Confidence = firstIntelligenceNonEmpty(output.Confidence, "medium")
			decision.ModelVersion = firstIntelligenceNonEmpty(output.ModelVersion, policy.ModelVersion)
			decision.UsedFallback = false
			decision.FallbackReason = ""
		}
	}
	return decision
}

func (m *MarketplaceIntelligence) loadPolicy(ctx context.Context) domain.DispatchScoringPolicy {
	p := domain.DefaultDispatchScoringPolicy()
	if m == nil || m.configRepo == nil {
		return p
	}
	p.ModelVersion = m.configRepo.GetStringConfig(ctx, "marketplace_intelligence_model_version", p.ModelVersion)
	p.RuleVersion = m.configRepo.GetStringConfig(ctx, "marketplace_intelligence_rule_version", p.RuleVersion)
	p.ETAWeight = m.configRepo.GetFloatConfig(ctx, "marketplace_dispatch_eta_weight", p.ETAWeight)
	p.DistanceWeight = m.configRepo.GetFloatConfig(ctx, "marketplace_dispatch_distance_weight", p.DistanceWeight)
	p.VehicleWeight = m.configRepo.GetFloatConfig(ctx, "marketplace_dispatch_vehicle_weight", p.VehicleWeight)
	p.CapabilityWeight = m.configRepo.GetFloatConfig(ctx, "marketplace_dispatch_capability_weight", p.CapabilityWeight)
	p.WorkloadWeight = m.configRepo.GetFloatConfig(ctx, "marketplace_dispatch_workload_weight", p.WorkloadWeight)
	p.AcceptanceWeight = m.configRepo.GetFloatConfig(ctx, "marketplace_dispatch_acceptance_weight", p.AcceptanceWeight)
	p.CompletionWeight = m.configRepo.GetFloatConfig(ctx, "marketplace_dispatch_completion_weight", p.CompletionWeight)
	p.MarketplaceWeight = m.configRepo.GetFloatConfig(ctx, "marketplace_dispatch_marketplace_weight", p.MarketplaceWeight)
	p.ReliabilityWeight = m.configRepo.GetFloatConfig(ctx, "marketplace_dispatch_reliability_weight", p.ReliabilityWeight)
	p.FoodMatchingWeight = m.configRepo.GetFloatConfig(ctx, "marketplace_dispatch_food_weight", p.FoodMatchingWeight)
	p.AverageSpeedKMPH = m.configRepo.GetFloatConfig(ctx, "marketplace_dispatch_average_speed_kmph", p.AverageSpeedKMPH)
	p.MaxETAMinutes = m.configRepo.GetFloatConfig(ctx, "marketplace_dispatch_max_eta_minutes", p.MaxETAMinutes)
	p.MaxDispatchDistanceKM = m.configRepo.GetFloatConfig(ctx, "marketplace_dispatch_max_distance_km", p.MaxDispatchDistanceKM)
	p.MaxFoodWaitMinutes = m.configRepo.GetFloatConfig(ctx, "marketplace_dispatch_max_food_wait_minutes", p.MaxFoodWaitMinutes)
	p.MaxBatchDetourMinutes = m.configRepo.GetFloatConfig(ctx, "marketplace_dispatch_max_batch_detour_minutes", p.MaxBatchDetourMinutes)
	return p.Normalized()
}

func (m *MarketplaceIntelligence) RecordDecision(ctx context.Context, order *domain.Order, courierID string, decision domain.DispatchDecision, rank int) {
	if order == nil {
		return
	}
	candidateHash := hashDispatchIdentity(order.ID, courierID)
	log.Printf("[MarketplaceIntelligence] dispatch_decision order=%s candidate=%s rank=%d score=%.4f eta_minutes=%.2f eta_source=%s confidence=%s model=%s rule=%s fallback=%t reason=%s",
		order.ID, candidateHash, rank, decision.Score, decision.ETA.TotalMinutes, decision.ETA.Source, decision.Confidence, decision.ModelVersion, decision.RuleVersion, decision.UsedFallback, decision.FallbackReason)
	if m == nil || m.canonicalPublisher == nil {
		return
	}
	// The event intentionally contains a one-way candidate hash, not the raw
	// courier id. It is safe for governed analytics and replay/audit.
	event := domain.NewCanonicalEvent("dispatch.decision", order.ID, "", map[string]interface{}{
		"candidate_hash": candidateHash,
		"rank":           rank,
		"score":          decision.Score,
		"breakdown":      decision.Breakdown,
		"eta": map[string]interface{}{
			"total_minutes": decision.ETA.TotalMinutes,
			"predicted_at":  decision.ETA.PredictedAt,
			"source":        decision.ETA.Source,
			"confidence":    decision.ETA.Confidence,
		},
		"food_signals":        decision.FoodSignals,
		"model_version":       decision.ModelVersion,
		"rule_version":        decision.RuleVersion,
		"decision_source":     decision.Source,
		"decision_confidence": decision.Confidence,
		"used_fallback":       decision.UsedFallback,
		"fallback_reason":     decision.FallbackReason,
		"constraint_reasons":  decision.ConstraintReasons,
		"eligible":            decision.Eligible,
	})
	event.PIIClassification = "internal"
	event.FieldPIIClassification = map[string]string{"payload": "internal"}
	if strings.TrimSpace(order.CorrelationID) != "" {
		event.CorrelationID = order.CorrelationID
		event.TraceID = order.CorrelationID
	}
	if err := m.canonicalPublisher.PublishCanonical(ctx, event); err != nil {
		// Audit transport failure must not corrupt or roll back authoritative
		// matching state; the durable publisher will expose the failure in logs.
		log.Printf("[MarketplaceIntelligence] dispatch decision publish failed order=%s: %v", order.ID, err)
	}
}

func hashDispatchIdentity(orderID, courierID string) string {
	sum := sha256.Sum256([]byte(orderID + "|" + courierID))
	return hex.EncodeToString(sum[:])
}

func validModelOutput(output domain.DispatchModelOutput) bool {
	return !math.IsNaN(output.Score) && !math.IsInf(output.Score, 0) && output.Score >= 0 && output.Score <= 1
}

func clampScore(score float64) float64 {
	if score < 0 {
		return 0
	}
	if score > 1 {
		return 1
	}
	return score
}

func firstIntelligenceNonEmpty(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
