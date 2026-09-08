package domain

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"
)

// DispatchScoringPolicy is the versioned, server-side policy used to rank
// candidates. It is deliberately data-only so a future model can consume the
// same features without becoming the source of truth for order state.
type DispatchScoringPolicy struct {
	ModelVersion          string
	RuleVersion           string
	ETAWeight             float64
	DistanceWeight        float64
	VehicleWeight         float64
	CapabilityWeight      float64
	WorkloadWeight        float64
	AcceptanceWeight      float64
	CompletionWeight      float64
	MarketplaceWeight     float64
	ReliabilityWeight     float64
	FoodMatchingWeight    float64
	AverageSpeedKMPH      float64
	MaxETAMinutes         float64
	MaxDispatchDistanceKM float64
	MaxFoodWaitMinutes    float64
	MaxBatchDetourMinutes float64
}

func DefaultDispatchScoringPolicy() DispatchScoringPolicy {
	return DispatchScoringPolicy{
		ModelVersion:          "marketplace-intelligence-2026-v1",
		RuleVersion:           "dispatch-rules-2026-v1",
		ETAWeight:             0.16,
		DistanceWeight:        0.10,
		VehicleWeight:         0.09,
		CapabilityWeight:      0.11,
		WorkloadWeight:        0.10,
		AcceptanceWeight:      0.09,
		CompletionWeight:      0.09,
		MarketplaceWeight:     0.10,
		ReliabilityWeight:     0.06,
		FoodMatchingWeight:    0.10,
		AverageSpeedKMPH:      25,
		MaxETAMinutes:         240,
		MaxDispatchDistanceKM: 20,
		MaxFoodWaitMinutes:    10,
		MaxBatchDetourMinutes: 5,
	}
}

// Normalized returns a safe policy. Invalid or zero weights are replaced by
// defaults and valid weights are normalized to one so score comparisons stay
// stable when operators tune a single key.
func (p DispatchScoringPolicy) Normalized() DispatchScoringPolicy {
	d := DefaultDispatchScoringPolicy()
	if strings.TrimSpace(p.ModelVersion) == "" {
		p.ModelVersion = d.ModelVersion
	}
	if strings.TrimSpace(p.RuleVersion) == "" {
		p.RuleVersion = d.RuleVersion
	}
	if !finitePositive(p.AverageSpeedKMPH) {
		p.AverageSpeedKMPH = d.AverageSpeedKMPH
	}
	if !finitePositive(p.MaxETAMinutes) {
		p.MaxETAMinutes = d.MaxETAMinutes
	}
	if !finitePositive(p.MaxDispatchDistanceKM) {
		p.MaxDispatchDistanceKM = d.MaxDispatchDistanceKM
	}
	if !finitePositive(p.MaxFoodWaitMinutes) {
		p.MaxFoodWaitMinutes = d.MaxFoodWaitMinutes
	}
	if !finitePositive(p.MaxBatchDetourMinutes) {
		p.MaxBatchDetourMinutes = d.MaxBatchDetourMinutes
	}
	weights := []*float64{
		&p.ETAWeight, &p.DistanceWeight, &p.VehicleWeight, &p.CapabilityWeight,
		&p.WorkloadWeight, &p.AcceptanceWeight, &p.CompletionWeight,
		&p.MarketplaceWeight, &p.ReliabilityWeight, &p.FoodMatchingWeight,
	}
	var total float64
	for _, weight := range weights {
		if !finiteNonNegative(*weight) {
			return d
		}
		total += *weight
	}
	if total <= 0 || math.IsInf(total, 0) {
		return d
	}
	for _, weight := range weights {
		*weight /= total
	}
	return p
}

type ETAPrediction struct {
	TotalMinutes          float64   `json:"total_minutes"`
	CourierArrivalMinutes float64   `json:"courier_arrival_minutes"`
	DeliveryTravelMinutes float64   `json:"delivery_travel_minutes"`
	PrepWaitMinutes       float64   `json:"prep_wait_minutes"`
	BatchingMinutes       float64   `json:"batching_minutes"`
	PredictedAt           time.Time `json:"predicted_at"`
	Confidence            string    `json:"confidence"`
	Source                string    `json:"source"`
	ModelVersion          string    `json:"model_version"`
}

type FoodMatchingSignals struct {
	PrepRemainingMinutes  float64 `json:"prep_remaining_minutes"`
	CourierArrivalMinutes float64 `json:"courier_arrival_minutes"`
	WaitingRisk           float64 `json:"waiting_risk"`
	ReadinessAlignment    float64 `json:"readiness_alignment"`
	BatchingCompatibility float64 `json:"batching_compatibility"`
	Score                 float64 `json:"score"`
}

type DispatchCandidateInput struct {
	CandidateID                string
	ServiceCode                string
	VehicleType                string
	RequiredVehicleTypes       []string
	DistanceKM                 float64
	CourierTravelMinutes       float64
	DeliveryTravelMinutes      float64
	ActiveWorkload             float64
	AcceptanceRate             float64
	CompletionRate             float64
	RelayScore                 float64
	AverageRating              float64
	CapabilityFit              float64
	VehicleFit                 float64
	MarketplaceConstraintScore float64
	FoodMatchingScore          float64
	BatchingMinutes            float64
	PrepReadyAt                *time.Time
	Now                        time.Time
	IsFood                     bool
	IsBatch                    bool
}

type DispatchScoreBreakdown struct {
	ETA         float64 `json:"eta"`
	Distance    float64 `json:"distance"`
	Vehicle     float64 `json:"vehicle"`
	Capability  float64 `json:"capability"`
	Workload    float64 `json:"workload"`
	Acceptance  float64 `json:"acceptance"`
	Completion  float64 `json:"completion"`
	Marketplace float64 `json:"marketplace"`
	Reliability float64 `json:"reliability"`
	Food        float64 `json:"food"`
}

type DispatchDecision struct {
	CandidateID       string                 `json:"candidate_id"`
	Score             float64                `json:"score"`
	Breakdown         DispatchScoreBreakdown `json:"breakdown"`
	ETA               ETAPrediction          `json:"eta"`
	FoodSignals       FoodMatchingSignals    `json:"food_signals,omitempty"`
	ModelVersion      string                 `json:"model_version"`
	RuleVersion       string                 `json:"rule_version"`
	Source            string                 `json:"source"`
	Confidence        string                 `json:"confidence"`
	UsedFallback      bool                   `json:"used_fallback"`
	FallbackReason    string                 `json:"fallback_reason,omitempty"`
	ConstraintReasons []string               `json:"constraint_reasons,omitempty"`
	Eligible          bool                   `json:"eligible"`
}

// DispatchModel is intentionally optional. A model may improve the final
// score, but it cannot mutate an order or bypass deterministic constraints.
type DispatchModel interface {
	Predict(ctx context.Context, input DispatchCandidateInput) (DispatchModelOutput, error)
}

type DispatchModelOutput struct {
	Score        float64
	Confidence   string
	Source       string
	ModelVersion string
}

func ScoreDispatchCandidate(policy DispatchScoringPolicy, input DispatchCandidateInput) (DispatchDecision, error) {
	if input.CandidateID == "" {
		return DispatchDecision{}, fmt.Errorf("candidate id is required")
	}
	values := []float64{input.DistanceKM, input.CourierTravelMinutes, input.DeliveryTravelMinutes, input.ActiveWorkload, input.AcceptanceRate, input.CompletionRate, input.RelayScore, input.AverageRating, input.CapabilityFit, input.VehicleFit, input.MarketplaceConstraintScore, input.FoodMatchingScore, input.BatchingMinutes}
	for _, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
			return DispatchDecision{}, fmt.Errorf("candidate contains invalid numeric feature")
		}
	}
	policy = policy.Normalized()
	now := input.Now
	if now.IsZero() {
		now = time.Now().UTC()
	}
	eta := PredictFoodDispatchETA(now, input.PrepReadyAt, input.CourierTravelMinutes, input.DeliveryTravelMinutes, input.BatchingMinutes, "rules", "medium", policy.ModelVersion)
	etaScore := clamp01(1 - eta.TotalMinutes/(policy.MaxETAMinutes))
	distanceScore := clamp01(1 - input.DistanceKM/policy.MaxDispatchDistanceKM)
	vehicleScore := clamp01(input.VehicleFit)
	capabilityScore := clamp01(input.CapabilityFit)
	workloadScore := 1 / (1 + input.ActiveWorkload)
	acceptanceScore := clamp01(input.AcceptanceRate / 100)
	completionScore := clamp01(input.CompletionRate / 100)
	reliabilityScore := clamp01((clamp(input.RelayScore, 0, 5) / 5 * 0.6) + (clamp(input.AverageRating, 0, 5) / 5 * 0.4))
	marketplaceScore := clamp01(input.MarketplaceConstraintScore)
	foodScore := clamp01(input.FoodMatchingScore)
	breakdown := DispatchScoreBreakdown{ETA: etaScore, Distance: distanceScore, Vehicle: vehicleScore, Capability: capabilityScore, Workload: workloadScore, Acceptance: acceptanceScore, Completion: completionScore, Marketplace: marketplaceScore, Reliability: reliabilityScore, Food: foodScore}
	score := breakdown.ETA*policy.ETAWeight + breakdown.Distance*policy.DistanceWeight + breakdown.Vehicle*policy.VehicleWeight + breakdown.Capability*policy.CapabilityWeight + breakdown.Workload*policy.WorkloadWeight + breakdown.Acceptance*policy.AcceptanceWeight + breakdown.Completion*policy.CompletionWeight + breakdown.Marketplace*policy.MarketplaceWeight + breakdown.Reliability*policy.ReliabilityWeight + breakdown.Food*policy.FoodMatchingWeight
	decision := DispatchDecision{CandidateID: input.CandidateID, Score: clamp01(score), Breakdown: breakdown, ETA: eta, ModelVersion: policy.ModelVersion, RuleVersion: policy.RuleVersion, Source: "rules", Confidence: "medium", Eligible: true}
	if input.DistanceKM > policy.MaxDispatchDistanceKM {
		decision.ConstraintReasons = append(decision.ConstraintReasons, "distance_exceeds_policy")
		decision.Eligible = false
	}
	if eta.TotalMinutes > policy.MaxETAMinutes {
		decision.ConstraintReasons = append(decision.ConstraintReasons, "eta_exceeds_policy")
		decision.Eligible = false
	}
	return decision, nil
}

func PredictFoodDispatchETA(now time.Time, prepReadyAt *time.Time, courierArrivalMinutes, deliveryTravelMinutes, batchingMinutes float64, source, confidence, modelVersion string) ETAPrediction {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	prepWait := 0.0
	if prepReadyAt != nil && prepReadyAt.After(now) {
		prepWait = prepReadyAt.Sub(now).Minutes()
	}
	courierArrivalMinutes = nonNegative(courierArrivalMinutes)
	deliveryTravelMinutes = nonNegative(deliveryTravelMinutes)
	batchingMinutes = nonNegative(batchingMinutes)
	start := math.Max(prepWait, courierArrivalMinutes)
	total := start + deliveryTravelMinutes + batchingMinutes
	if strings.TrimSpace(source) == "" {
		source = "rules"
	}
	if strings.TrimSpace(confidence) == "" {
		confidence = "medium"
	}
	return ETAPrediction{TotalMinutes: total, CourierArrivalMinutes: courierArrivalMinutes, DeliveryTravelMinutes: deliveryTravelMinutes, PrepWaitMinutes: prepWait, BatchingMinutes: batchingMinutes, PredictedAt: now.Add(time.Duration(total * float64(time.Minute))), Confidence: confidence, Source: source, ModelVersion: modelVersion}
}

func BuildFoodMatchingSignals(prepRemainingMinutes, courierArrivalMinutes float64, batchingAllowed, isBatch bool, batchingMinutes, maxWaitMinutes, maxBatchDetourMinutes float64) FoodMatchingSignals {
	prepRemainingMinutes = nonNegative(prepRemainingMinutes)
	courierArrivalMinutes = nonNegative(courierArrivalMinutes)
	maxWaitMinutes = positiveOr(maxWaitMinutes, 10)
	maxBatchDetourMinutes = positiveOr(maxBatchDetourMinutes, 5)
	waitingRisk := clamp01(math.Max(prepRemainingMinutes-courierArrivalMinutes, 0) / maxWaitMinutes)
	denominator := math.Max(math.Max(prepRemainingMinutes, courierArrivalMinutes), 1)
	readiness := clamp01(1 - math.Abs(prepRemainingMinutes-courierArrivalMinutes)/denominator)
	batchCompatibility := 1.0
	if isBatch {
		if !batchingAllowed {
			batchCompatibility = 0
		} else {
			batchCompatibility = clamp01(1 - nonNegative(batchingMinutes)/maxBatchDetourMinutes)
		}
	}
	score := clamp01((readiness*0.45 + (1-waitingRisk)*0.30 + batchCompatibility*0.25))
	return FoodMatchingSignals{PrepRemainingMinutes: prepRemainingMinutes, CourierArrivalMinutes: courierArrivalMinutes, WaitingRisk: waitingRisk, ReadinessAlignment: readiness, BatchingCompatibility: batchCompatibility, Score: score}
}

func clamp(value, minValue, maxValue float64) float64 {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}
func clamp01(value float64) float64 { return clamp(value, 0, 1) }
func nonNegative(value float64) float64 {
	if value < 0 || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	return value
}
func positiveOr(value, fallback float64) float64 {
	if !finitePositive(value) {
		return fallback
	}
	return value
}
func finitePositive(value float64) bool {
	return value > 0 && !math.IsNaN(value) && !math.IsInf(value, 0)
}
func finiteNonNegative(value float64) bool {
	return value >= 0 && !math.IsNaN(value) && !math.IsInf(value, 0)
}
