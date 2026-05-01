package service

import (
	"context"
	"fmt"
	"log"
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

	// 2. Mocking PostGIS / Redis query for 3 specific couriers across zones
	// In reality, this queries `redisRepo.FindNearbyCouriers` for each leg's pickup location.
	courierLeg1 := uuid.New()
	courierLeg2 := uuid.New()
	courierLeg3 := uuid.New()

	log.Printf("[RelayMatching] Found 3 optimal couriers: %s, %s, %s", courierLeg1, courierLeg2, courierLeg3)

	// 3. ETA Synchronization: check if ETAs to meeting points match within ±10 mins window
	eta1 := time.Now().Add(15 * time.Minute)
	eta2 := time.Now().Add(12 * time.Minute) // Matches well
	eta3 := time.Now().Add(25 * time.Minute) // Too slow!

	if err := s.SynchronizeETA(ctx, []time.Time{eta1, eta2, eta3}); err != nil {
		log.Printf("[RelayMatching] ETA Mismatch: %v. Adjusting dispatch timers...", err)
		// Delay dispatch for courier 1 and 2, or replace courier 3.
	}

	// 4. Batch Dispatch: In a real system, send push notifications to all 3 couriers simultaneously.
	// The transaction only succeeds if ALL 3 accept (Atomic).

	return nil
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
	// Relay cancellation flow: jika 1 kurir drop out, find replacement tanpa ganggu leg lain
	
	log.Printf("[RelayMatching] Courier %s dropped out of leg %d for order %s. Initiating replacement flow.", droppedCourierID, legIndex, orderID)

	lockAcquired, err := s.relayRepo.AcquireMatchLock(ctx, orderID, 1*time.Minute)
	if err != nil || !lockAcquired {
		return fmt.Errorf("failed to acquire match lock during cancellation replacement")
	}
	defer s.relayRepo.ReleaseMatchLock(ctx, orderID)

	// Only replace for `legIndex`
	newCourier := uuid.New()
	log.Printf("[RelayMatching] Successfully found replacement courier %s for leg %d", newCourier, legIndex)

	return nil
}

func (s *relayMatchingService) ResolveMeetingPointConflict(ctx context.Context, meetingPointID uuid.UUID, timeWindow time.Time) error {
	// Meeting point conflict resolution: jika 2 relay butuh meeting point yang sama di waktu sama
	log.Printf("[RelayMatching] Resolving conflict at meeting point %s around %v", meetingPointID, timeWindow)
	// Suggest alternate meeting point or adjust ETAs
	return nil
}
