package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"

	"lancar/order-service/internal/domain"
)

type payoutService struct {
	repo    domain.PayoutRepository
	gateway domain.PayoutGateway
}

func NewPayoutService(repo domain.PayoutRepository, gateway domain.PayoutGateway) domain.PayoutService {
	return &payoutService{
		repo:    repo,
		gateway: gateway,
	}
}

func (s *payoutService) CalculateOrderLegPayout(ctx context.Context, orderLegID uuid.UUID, fee int, penalty int, idleComp int) (*domain.PayoutRecord, error) {
	// Dummy lookup courierID, normally you'd query the leg
	// For MVP, assume fee is gross
	// net = fee - penalty + idleComp
	net := fee - penalty + idleComp
	if net < 0 {
		net = 0
	}

	pph21 := s.calculatePPh21(net)

	now := time.Now()
	batchDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	record := &domain.PayoutRecord{
		ID:                  uuid.New(),
		CourierID:           uuid.Nil, // placeholder, needs real courier ID
		OrderLegID:          &orderLegID,
		Type:                domain.PayoutTypeLegFee,
		GrossIDR:            fee,
		PenaltyIDR:          penalty,
		IdleCompensationIDR: idleComp,
		NetIDR:              net,
		PPh21IDR:            pph21,
		DisbursementStatus:  domain.PayoutStatusPending,
		BatchDate:           &batchDate,
		CreatedAt:           now,
		UpdatedAt:           now,
	}

	err := s.repo.CreatePayout(ctx, record)
	if err != nil {
		return nil, fmt.Errorf("failed to create payout record: %w", err)
	}

	return record, nil
}

func (s *payoutService) TriggerBatchPayout(ctx context.Context) error {
	// Get all pending payouts
	pending, err := s.repo.GetAllPendingPayouts(ctx)
	if err != nil {
		return fmt.Errorf("failed to get pending payouts: %w", err)
	}

	// Group by courier
	grouped := make(map[uuid.UUID][]domain.PayoutRecord)
	for _, p := range pending {
		grouped[p.CourierID] = append(grouped[p.CourierID], p)
	}

	// In a real system, this would be queued to a worker to avoid long-running requests
	// For MVP, we will process synchronously
	for courierID, records := range grouped {
		totalNet := 0
		for _, r := range records {
			totalNet += (r.NetIDR - r.PPh21IDR)
		}

		if totalNet <= 0 {
			continue // nothing to disburse
		}

		// Trigger gateway
		ref, gatewayErr := s.gateway.Disburse(ctx, totalNet, "BCA", "1234567890", "LANCAR Delivery Payout")
		
		status := domain.PayoutStatusCompleted
		var errReason *string
		if gatewayErr != nil {
			status = domain.PayoutStatusFailed
			reason := gatewayErr.Error()
			errReason = &reason
			log.Printf("Failed to disburse to courier %s: %v", courierID, gatewayErr)
		}

		// Update records
		for _, r := range records {
			s.repo.UpdatePayoutStatus(ctx, r.ID, status, &ref, errReason)
		}
	}

	return nil
}

func (s *payoutService) GetCourierEarnings(ctx context.Context, courierID uuid.UUID, period string) (*domain.CourierEarningsSummary, error) {
	now := time.Now()
	var from time.Time
	
	switch period {
	case "today":
		from = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	case "this_month":
		from = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	default:
		from = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	}

	return s.repo.GetEarningsSummary(ctx, courierID, from, now)
}

func (s *payoutService) calculatePPh21(amount int) int {
	// Simplified PPh 21 logic for MVP
	// Tax rate 2.5% or 3% for certain brackets
	// For testing purposes, we assume a flat 2.5% if amount is somewhat large, else 0
	if amount > 50000 {
		return int(float64(amount) * 0.025)
	}
	return 0
}
