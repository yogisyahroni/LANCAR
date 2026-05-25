package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"lancar/order-service/internal/domain"
)

type relayMatchingService struct {
	relayRepo domain.RelayRepository
	orderRepo domain.OrderRepository
	redisRepo domain.RedisRepository
}

func NewRelayMatchingService(rRepo domain.RelayRepository, oRepo domain.OrderRepository, rdRepo domain.RedisRepository) *relayMatchingService {
	return &relayMatchingService{
		relayRepo: rRepo,
		orderRepo: oRepo,
		redisRepo: rdRepo,
	}
}

// FindAndAssignRelayCouriers implements Atomic 3-courier matching with Redis lock
func (s *relayMatchingService) FindAndAssignRelayCouriers(ctx context.Context, orderID uuid.UUID) error {
	// 1. Acquire Distributed Lock to prevent race condition during atomic 3-courier matching
	lockAcquired, err := s.relayRepo.AcquireMatchLock(ctx, orderID, 2*time.Minute)
	if err != nil || !lockAcquired {
		return fmt.Errorf("failed to acquire match lock for order %s, matching might be in progress", orderID)
	}
	defer s.relayRepo.ReleaseMatchLock(ctx, orderID)

	return fmt.Errorf("relay matching candidate repository is not configured for order %s", orderID)
}

func (s *relayMatchingService) SynchronizeETA(ctx context.Context, etas []time.Time) error {
	maxDiff := 10 * time.Minute
	for i := 0; i < len(etas)-1; i++ {
		diff := etas[i].Sub(etas[i+1])
		if diff < 0 {
			diff = -diff
		}
		if diff > maxDiff {
			return fmt.Errorf("ETA difference between leg %d and leg %d is too large (%v)", i+1, i+2, diff)
		}
	}
	return nil
}

func (s *relayMatchingService) HandleRelayCancellation(ctx context.Context, orderID uuid.UUID, droppedCourierID uuid.UUID, legIndex int) error {
	lockAcquired, err := s.relayRepo.AcquireMatchLock(ctx, orderID, 1*time.Minute)
	if err != nil || !lockAcquired {
		return fmt.Errorf("failed to acquire match lock during cancellation replacement")
	}
	defer s.relayRepo.ReleaseMatchLock(ctx, orderID)

	return fmt.Errorf("relay cancellation replacement repository is not configured for order %s leg %d courier %s", orderID, legIndex, droppedCourierID)
}

func (s *relayMatchingService) ResolveMeetingPointConflict(ctx context.Context, meetingPointID uuid.UUID, timeWindow time.Time) error {
	return fmt.Errorf("meeting point conflict resolver is not configured for meeting point %s at %s", meetingPointID, timeWindow.Format(time.RFC3339))
}
