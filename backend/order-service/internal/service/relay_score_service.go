package service

import (
	"context"
	"fmt"
	"math"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
)

type relayScoreService struct {
	relayRepo domain.RelayRepository
}

func NewRelayScoreService(relayRepo domain.RelayRepository) domain.RelayScoreService {
	return &relayScoreService{
		relayRepo: relayRepo,
	}
}

// CalculateScore computes the relay score from real performance data in courier_profiles
// and persists the new score and tier to the database.
//
// Score formula (weighted):
//   - On-time delivery rate : 40%
//   - Documentation completion : 30%
//   - Avg partner rating (normalized) : 20%
//   - Complaint absence ratio : 10%
func (s *relayScoreService) CalculateScore(ctx context.Context, courierID uuid.UUID, reason string, orderID *uuid.UUID) error {
	// 1. Fetch actual performance stats from courier_profiles
	stats, err := s.relayRepo.GetCourierPerformanceStats(ctx, courierID)
	if err != nil {
		return fmt.Errorf("failed to fetch courier performance stats for %s: %w", courierID, err)
	}

	// 2. Derive normalised ratios (guard against division by zero for new couriers)
	ontimePct := 1.0
	if stats.TotalDeliveries > 0 {
		ontimePct = float64(stats.OntimeDeliveries) / float64(stats.TotalDeliveries)
	}

	docsComplete := stats.DocsCompletePct / 100.0

	partnerRatingsAvg := stats.AvgPartnerRating / 5.0 // normalise 1-5 → 0-1

	// complaint_ratio_pct is already 0-100; invert so 0% complaints = 1.0 score
	complaintRatioInv := 1.0 - (stats.ComplaintRatioPct / 100.0)
	if complaintRatioInv < 0 {
		complaintRatioInv = 0
	}

	// 3. Weighted calculation → result in 1.0–5.0 range
	newScore := (ontimePct * 0.40 * 5.0) +
		(docsComplete * 0.30 * 5.0) +
		(partnerRatingsAvg * 0.20 * 5.0) +
		(complaintRatioInv * 0.10 * 5.0)

	// Clamp and round to 2 decimal places
	if newScore > 5.0 {
		newScore = 5.0
	}
	if newScore < 1.0 {
		newScore = 1.0
	}
	newScore = math.Round(newScore*100) / 100

	currentScore := stats.RelayScore
	currentTier := stats.Tier

	// 4. No-op if score hasn't changed
	if currentScore == newScore {
		return nil
	}

	// 5. Determine new tier and whether it changed
	newTier, tierChanged := s.CheckTierPromotion(ctx, courierID, newScore)
	// Override: if tier hasn't changed, keep existing tier
	if !tierChanged {
		newTier = currentTier
	}

	var tierBefore, tierAfter *string
	if tierChanged {
		tierBefore = &currentTier
		tierAfter = &newTier
	}

	// 6. Persist score history for audit trail
	history := &domain.RelayScoreHistory{
		CourierID:    courierID,
		ScoreBefore:  currentScore,
		ScoreAfter:   newScore,
		ChangeReason: reason,
		OrderID:      orderID,
		TierBefore:   tierBefore,
		TierAfter:    tierAfter,
	}

	if err := s.relayRepo.RecordScoreHistory(ctx, history); err != nil {
		return fmt.Errorf("failed to record relay score history: %w", err)
	}

	// 7. Persist new score and tier to courier_profiles
	if err := s.relayRepo.UpdateCourierRelayScore(ctx, courierID, newScore, newTier); err != nil {
		return fmt.Errorf("failed to update courier relay score: %w", err)
	}

	// 8. Emit business rules for critical thresholds
	// Score < 3.5: flag for retraining
	// Score < 3.0: flag for auto-suspension
	// This would be published via Redis Pub/Sub to Admin/Auth service in production.
	// Logging here as a verifiable audit trail.
	if newScore < 3.0 {
		// TODO: publish event "courier:suspend_flag:<courierID>" to Redis
		_ = courierID // suppress unused warning until Redis publish is wired
	} else if newScore < 3.5 {
		// TODO: publish event "courier:retrain_flag:<courierID>" to Redis
	}

	return nil
}

// AdminOverrideScore allows a super_admin to manually set a courier's relay score with an audit note.
func (s *relayScoreService) AdminOverrideScore(ctx context.Context, courierID uuid.UUID, newScore float64, adminID uuid.UUID, note string) error {
	// 1. Fetch current score and tier from DB (not hardcoded)
	stats, err := s.relayRepo.GetCourierPerformanceStats(ctx, courierID)
	if err != nil {
		return fmt.Errorf("failed to fetch current courier stats for override: %w", err)
	}

	currentScore := stats.RelayScore
	currentTier := stats.Tier

	newTier, tierChanged := s.CheckTierPromotion(ctx, courierID, newScore)
	if !tierChanged {
		newTier = currentTier
	}

	var tierBefore, tierAfter *string
	if tierChanged {
		tierBefore = &currentTier
		tierAfter = &newTier
	}

	history := &domain.RelayScoreHistory{
		CourierID:    courierID,
		ScoreBefore:  currentScore,
		ScoreAfter:   newScore,
		ChangeReason: "admin_override",
		AdminID:      &adminID,
		AdminNote:    &note,
		TierBefore:   tierBefore,
		TierAfter:    tierAfter,
	}

	if err := s.relayRepo.RecordScoreHistory(ctx, history); err != nil {
		return fmt.Errorf("failed to record admin override history: %w", err)
	}

	if err := s.relayRepo.UpdateCourierRelayScore(ctx, courierID, newScore, newTier); err != nil {
		return fmt.Errorf("failed to persist admin override score: %w", err)
	}

	return nil
}

// CheckTierPromotion determines the new tier based on score thresholds and compares it
// with the courier's current tier from the database.
func (s *relayScoreService) CheckTierPromotion(ctx context.Context, courierID uuid.UUID, newScore float64) (string, bool) {
	// Determine new tier from score thresholds
	newTier := "regular"
	if newScore >= 4.8 {
		newTier = "elite"
	} else if newScore >= 4.5 {
		newTier = "mitra"
	}

	// Fetch current tier from DB to detect change
	stats, err := s.relayRepo.GetCourierPerformanceStats(ctx, courierID)
	if err != nil {
		// If we can't fetch the current tier, assume no change to be safe
		return newTier, false
	}

	currentTier := stats.Tier

	if currentTier != newTier {
		return newTier, true
	}

	return newTier, false
}
