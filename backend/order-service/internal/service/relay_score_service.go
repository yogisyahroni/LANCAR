package service

import (
	"context"
	"fmt"
	"math"

	"github.com/google/uuid"
	"lancar/order-service/internal/domain"
)

type relayScoreService struct {
	relayRepo domain.RelayRepository
	// mock internal API or other repos for getting stats would go here
}

func NewRelayScoreService(relayRepo domain.RelayRepository) domain.RelayScoreService {
	return &relayScoreService{
		relayRepo: relayRepo,
	}
}

func (s *relayScoreService) CalculateScore(ctx context.Context, courierID uuid.UUID, reason string, orderID *uuid.UUID) error {
	// In a real scenario, we would fetch ontime_pct, docs_complete, partner_ratings, complaint_ratio
	// from database analytics. For MVP, we will simulate a score calculation.
	
	// Stub calculation
	ontimePct := 0.95 
	docsComplete := 0.90
	partnerRatingsAvg := 4.5 / 5.0
	complaintRatioInv := 0.99

	newScore := (ontimePct * 0.40 * 5.0) +
				(docsComplete * 0.30 * 5.0) +
				(partnerRatingsAvg * 0.20 * 5.0) +
				(complaintRatioInv * 0.10 * 5.0)

	// Round to 2 decimals
	newScore = math.Round(newScore*100) / 100

	// Get current score (just mock for now, assume 4.0 if not found)
	// In real logic, we'd query CourierProfile
	currentScore := 4.20
	
	if currentScore == newScore {
		return nil // No change
	}

	currentTier := "Regular"
	newTier, tierChanged := s.CheckTierPromotion(ctx, courierID, newScore)

	var tierBefore, tierAfter *string
	if tierChanged {
		tierBefore = &currentTier
		tierAfter = &newTier
	}

	history := &domain.RelayScoreHistory{
		CourierID:    courierID,
		ScoreBefore:  currentScore,
		ScoreAfter:   newScore,
		ChangeReason: reason,
		OrderID:      orderID,
		TierBefore:   tierBefore,
		TierAfter:    tierAfter,
	}

	err := s.relayRepo.RecordScoreHistory(ctx, history)
	if err != nil {
		return fmt.Errorf("failed to record relay score history: %w", err)
	}

	// Trigger logic if score < 3.5 (Retraining flag) or < 3.0 (Auto-suspend)
	// This would emit events via Redis Pub/Sub to Admin/Auth service

	return nil
}

func (s *relayScoreService) AdminOverrideScore(ctx context.Context, courierID uuid.UUID, newScore float64, adminID uuid.UUID, note string) error {
	currentScore := 4.0 // Mocked current score

	newTier, tierChanged := s.CheckTierPromotion(ctx, courierID, newScore)
	
	var tierBefore, tierAfter *string
	if tierChanged {
		currentTier := "Regular"
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

	err := s.relayRepo.RecordScoreHistory(ctx, history)
	if err != nil {
		return fmt.Errorf("failed to record admin override history: %w", err)
	}

	return nil
}

func (s *relayScoreService) CheckTierPromotion(ctx context.Context, courierID uuid.UUID, currentScore float64) (string, bool) {
	// Simple tier logic based on score
	newTier := "Regular"
	if currentScore >= 4.8 {
		newTier = "Elite"
	} else if currentScore >= 4.5 {
		newTier = "Mitra"
	}

	// Mocking current tier as Regular for now
	currentTier := "Regular"
	
	if currentTier != newTier {
		return newTier, true
	}
	
	return currentTier, false
}
