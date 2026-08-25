package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sort"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/domain/queue"
	"tembus/order-service/pkg/alerting"
	"time"

	"github.com/google/uuid"
)

// Auto-generated split of orderServiceImpl methods (god-file refactor).
func (s *orderServiceImpl) AcceptOrder(ctx context.Context, orderID string, courierID string) error {
	// 1. Check order status
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return err
	}
	if order == nil {
		return errors.New("order not found")
	}

	// Only allow acceptance if searching (initial match) or failed_delivery (retry)
	if order.Status != domain.StatusSearching && order.Status != domain.StatusFailedDelivery {
		return fmt.Errorf("order cannot be accepted in current status: %s", order.Status)
	}

	var batchOrders []*domain.Order
	if order.BatchID != nil {
		batchOrders, err = s.orderRepo.GetByBatchID(ctx, *order.BatchID)
		if err != nil || len(batchOrders) == 0 {
			batchOrders = []*domain.Order{order}
		}
	} else {
		batchOrders = []*domain.Order{order}
	}

	// Assign courier to all orders in the batch
	for _, o := range batchOrders {
		if o.Status == domain.StatusSearching {
			// 2. Assign Courier in DB
			err = s.orderRepo.AssignCourier(ctx, o.ID, courierID)
			if err != nil {
				log.Printf("failed to assign courier to order %s: %v", o.ID, err)
				continue
			}

			// 3. Update Status to Accepted
			err = s.orderRepo.UpdateStatus(ctx, o.ID, domain.StatusAccepted)
			if err != nil {
				log.Printf("failed to update status for order %s: %v", o.ID, err)
				continue
			}

			// 4. Record Event
			event := domain.OrderEvent{
				OrderID:   o.ID,
				UserID:    o.CustomerID,
				Status:    domain.StatusAccepted,
				Message:   "Courier has accepted your order",
				CreatedAt: time.Now(),
			}
			_ = s.eventRepo.SaveEvent(ctx, event)
			_ = s.eventBus.Publish(ctx, "order.updates", event)

			// FB-124: notif customer bahwa driver sudah di-assign (hanya
			// order food — parcel sudah dapat notif "order_accepted" di atas).
			// Fire-and-forget — gagal kirim hanya di-log.
			if o.MerchantID != nil && s.pushSvc != nil {
				if errPush := s.pushSvc.NotifyCustomerDriverAssigned(ctx, o.ID, "Driver ditemukan — sedang menuju merchant"); errPush != nil {
					log.Printf("[OrderService] FB-124 push driver_assigned gagal order %s: %v", o.ID, errPush)
				}
			}

			// 5. Notify Customer
			_ = s.notificationSvc.Send(ctx, domain.NotificationRequest{
				UserID:  o.CustomerID,
				Title:   "Courier Found!",
				Message: "A courier has accepted your order and is heading to the pickup location.",
				Channel: domain.ChannelPush,
				Data: map[string]string{
					"order_id": o.ID,
					"type":     "order_accepted",
				},
			})
		}
	}

	// FB-088: kalau batch ini adalah food batch → tandai courier di
	// food_batches (forming → assigned). Tidak fatal kalau batch parcel biasa.
	if order.BatchID != nil && s.foodRepo != nil {
		if err := s.foodRepo.UpdateFoodBatchCourier(ctx, *order.BatchID, courierID); err != nil {
			log.Printf("failed to update food batch courier %s: %v", *order.BatchID, err)
		}
	}

	return nil
}

func (s *orderServiceImpl) FindAndAssignCourier(ctx context.Context, orderID string) error {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return err
	}

	if order.Status != domain.StatusSearching {
		return fmt.Errorf("order is not in searching status: %s", order.Status)
	}

	totalWeight := order.Weight
	packageCount := 1
	var batchOrders []*domain.Order

	if order.BatchID != nil {
		batchOrders, err = s.orderRepo.GetByBatchID(ctx, *order.BatchID)
		if err == nil && len(batchOrders) > 0 {
			packageCount = len(batchOrders)
			totalWeight = 0
			for _, o := range batchOrders {
				totalWeight += o.Weight
			}
		}
	} else {
		batchOrders = []*domain.Order{order}
	}

	// Cascading search radius: dynamic from service product or default 3km, 5km, 10km
	radii := []float64{3, 5, 10}
	if serviceProduct, err := s.pricingRepo.GetDeliveryServiceByCode(ctx, order.Model); err == nil && len(serviceProduct.SearchRadiiKM) > 0 {
		radii = serviceProduct.SearchRadiiKM
	}

	// S2-OS-02: Ganti time.Sleep(30s) blocking dengan polling loop
	// (1 detik interval) + context cancellation. Ini mencegah goroutine
	// stuck dan memberi customer progress visibility.
	const (
		batchOfferTimeout = 15 * time.Second // synced with ON_DEMAND_OFFER_TTL_SECONDS (15s)
		pollInterval      = 1 * time.Second
		batchSize         = 3
	)

	for _, radius := range radii {
		// Check context cancellation before each radius attempt
		select {
		case <-ctx.Done():
			return fmt.Errorf("matching cancelled: %w", ctx.Err())
		default:
		}

		courierIDs, err := s.redisRepo.FindNearbyCouriers(ctx, order.PickupLat, order.PickupLng, radius)
		if err != nil || len(courierIDs) == 0 {
			log.Printf("[Matching] No couriers in %.0fkm radius for order %s", radius, order.OrderNumber)
			continue
		}

		log.Printf("[Matching] Found %d couriers in %.0fkm radius for order %s",
			len(courierIDs), radius, order.OrderNumber)

		// 1. Score and Sort Couriers
		scoredCouriers := s.scoreCouriers(ctx, courierIDs, order, totalWeight, packageCount)

		// 2. Batch Dispatch: Try top 3 couriers simultaneously
		for i := 0; i < len(scoredCouriers); i += batchSize {
			end := i + batchSize
			if end > len(scoredCouriers) {
				end = len(scoredCouriers)
			}
			batch := scoredCouriers[i:end]

			// Set dispatch expiry for the batch
			expiry := time.Now().Add(batchOfferTimeout)
			for _, o := range batchOrders {
				if err := s.orderRepo.SetDispatchExpiry(ctx, o.ID, expiry); err != nil {
					log.Printf("Failed to set dispatch expiry for order %s: %v", o.ID, err)
				}
			}

			// Notify all couriers in the batch
			for _, sc := range batch {
				s.notifyCourierOfNewOrder(ctx, sc.ID, order, packageCount)
			}

			// ── Polling wait instead of time.Sleep ─────────────────
			// Poll every 1s for courier acceptance or timeout.
			// Context cancellation lets the caller abort early.
			deadline := time.After(batchOfferTimeout)
			ticker := time.NewTicker(pollInterval)
			accepted := false

		pollLoop:
			for {
				select {
				case <-ctx.Done():
					ticker.Stop()
					return fmt.Errorf("matching cancelled: %w", ctx.Err())
				case <-deadline:
					ticker.Stop()
					break pollLoop
				case <-ticker.C:
					updatedOrder, err := s.orderRepo.GetByID(ctx, orderID)
					if err == nil && updatedOrder.Status != domain.StatusSearching {
						// Order was accepted by someone!
						accepted = true
						ticker.Stop()
						break pollLoop
					}
				}
			}

			if accepted {
				return nil
			}

			// Batch expired — continue to next batch if available
		}

		// Small delay before next radius
		select {
		case <-ctx.Done():
			return fmt.Errorf("matching cancelled: %w", ctx.Err())
		case <-time.After(500 * time.Millisecond):
		}
	}

	// If no courier found after all radii and batches
	s.notifyCustomerNoCourier(ctx, order)

	// Set order status to no_courier_found if all declined/expired
	for _, o := range batchOrders {
		_ = s.orderRepo.UpdateStatus(ctx, o.ID, domain.StatusNoCourierFound)
	}

	return errors.New("no couriers accepted the order within the search window")
}

func (s *orderServiceImpl) scoreCouriers(ctx context.Context, courierIDs []string, order *domain.Order, totalWeight float64, packageCount int) []scoredCourier {
	scored := make([]scoredCourier, 0, len(courierIDs))
	for _, id := range courierIDs {
		courierUUID, err := uuid.Parse(id)
		if err != nil {
			log.Printf("Skipping courier %s: invalid UUID from courier location index", id)
			continue
		}
		stats, err := s.relayRepo.GetCourierDispatchScoreStats(ctx, courierUUID, order.PickupLat, order.PickupLng)
		if err != nil {
			log.Printf("Skipping courier %s: dispatch score stats unavailable: %v", id, err)
			continue
		}

		// Basecamp Photo Lock Check
		if !stats.ProfilePhotoLocked {
			log.Printf("Skipping courier %s: profile photo has not been locked at basecamp yet", id)
			continue
		}

		// Capacity filtering
		if stats.MaxWeightCapacityKg != nil && totalWeight > *stats.MaxWeightCapacityKg {
			log.Printf("Skipping courier %s: total batch weight (%f kg) exceeds max capacity (%f kg)", id, totalWeight, *stats.MaxWeightCapacityKg)
			continue
		}

		if stats.MaxPackagesCapacity != nil && packageCount > *stats.MaxPackagesCapacity {
			log.Printf("Skipping courier %s: order packages (%d) exceeds max capacity (%d)", id, packageCount, *stats.MaxPackagesCapacity)
			continue
		}

		relayWeight := s.configRepo.GetFloatConfig(ctx, "relay_score_weight", 0.4)
		proximityWeight := s.configRepo.GetFloatConfig(ctx, "proximity_score_weight", 0.25)
		acceptanceWeight := s.configRepo.GetFloatConfig(ctx, "acceptance_score_weight", 0.15)
		idleWeight := s.configRepo.GetFloatConfig(ctx, "idle_time_weight", 0.1)
		ratingWeight := s.configRepo.GetFloatConfig(ctx, "rating_score_weight", 0.1)

		// S3-OS-01: Rating minimum threshold — kurir rating < 3.5 difilter
		minRating := s.configRepo.GetFloatConfig(ctx, "min_courier_rating_threshold", 3.5)
		if stats.AvgRating < minRating {
			log.Printf("Skipping courier %s: avg rating %.1f below threshold %.1f", id, stats.AvgRating, minRating)
			continue
		}

		relayScore := clampFloat(stats.RelayScore, 0, 5) / 5
		acceptanceRate := clampFloat(stats.AcceptanceRatePct, 0, 100) / 100
		proximityScore := s.proximityScoreFromDistance(ctx, stats.DistanceMeters)

		// S3-OS-02: Idle time bonus — kurir yang lama nunggu diprioritaskan
		// Idle 0 menit = 0, idle 30+ menit = 1 (full bonus)
		idleScore := clampFloat(stats.IdleMinutes/30.0, 0, 1)

		// Rating score: 1.0-5.0 dinormalisasi ke 0-1
		ratingScore := clampFloat(stats.AvgRating, 1.0, 5.0) / 5.0

		score := (relayScore * relayWeight) +
			(proximityScore * proximityWeight) +
			(acceptanceRate * acceptanceWeight) +
			(idleScore * idleWeight) +
			(ratingScore * ratingWeight)

		var tierRank int
		switch stats.Tier {
		case "god_mode":
			tierRank = 4
		case "gold":
			tierRank = 3
		case "silver":
			tierRank = 2
		default:
			tierRank = 1
		}

		scored = append(scored, scoredCourier{ID: id, Score: score, TierRank: tierRank})
	}

	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].TierRank != scored[j].TierRank {
			return scored[i].TierRank > scored[j].TierRank
		}
		return scored[i].Score > scored[j].Score
	})
	return scored
}

func (s *orderServiceImpl) proximityScoreFromDistance(ctx context.Context, distanceMeters float64) float64 {
	if distanceMeters <= 0 {
		return 1
	}

	maxRadius := s.configRepo.GetFloatConfig(ctx, "max_proximity_radius_m", 10000.0)
	if maxRadius <= 0 {
		maxRadius = 10000.0
	}

	score := 1 - (distanceMeters / maxRadius)
	return clampFloat(score, 0, 1)
}

func (s *orderServiceImpl) notifyCourierOfNewOrder(ctx context.Context, courierID string, order *domain.Order, packageCount int) {
	log.Printf("[OrderService] Notifying courier %s of new order %s", courierID, order.OrderNumber)

	title := "New Order Available"
	msg := fmt.Sprintf("New order %s is available nearby. Tap to view details.", order.OrderNumber)
	if packageCount > 1 {
		title = "New Multi-Stop Order"
		msg = fmt.Sprintf("New batch order (%d packages) is available nearby. Tap to view details.", packageCount)
	}

	payload := domain.NotificationRequest{
		UserID:  courierID,
		Title:   title,
		Message: msg,
		Data: map[string]string{
			"order_id": order.ID,
			"type":     "new_order",
		},
	}

	// 1. Send Push Notification
	pushReq := payload
	pushReq.Channel = domain.ChannelPush
	if err := s.notificationSvc.Send(ctx, pushReq); err != nil {
		log.Printf("Failed to send Push to courier %s: %v", courierID, err)
	}

	// 2. Send WebSocket Notification
	wsReq := payload
	wsReq.Channel = domain.ChannelWebSocket
	if err := s.notificationSvc.Send(ctx, wsReq); err != nil {
		log.Printf("Failed to send WebSocket to courier %s: %v", courierID, err)
	}
}

func (s *orderServiceImpl) notifyCustomerNoCourier(ctx context.Context, order *domain.Order) {
	log.Printf("[OrderService] Notifying customer %s that no courier was found for order %s", order.CustomerID, order.OrderNumber)

	req := domain.NotificationRequest{
		UserID:  order.CustomerID,
		Title:   "No Courier Found",
		Message: fmt.Sprintf("Sorry, we couldn't find a courier for your order %s. Please try again in a few minutes.", order.OrderNumber),
		Channel: domain.ChannelPush,
		Data: map[string]string{
			"order_id": order.ID,
			"type":     "no_courier",
		},
	}

	if err := s.notificationSvc.Send(ctx, req); err != nil {
		log.Printf("Failed to send notification to customer %s: %v", order.CustomerID, err)
	}

	_ = s.taskQueue.Push(ctx, queue.Task{
		Type: "order.no_courier_found",
		Payload: map[string]interface{}{
			"order_id": order.ID,
			"user_id":  order.CustomerID,
		},
	})

	// LAUNCH-3: Alert on no-driver-found for ops visibility
	go func() {
		alerting.AlertNoDriverFound(100, 1, 1) // Single event triggers immediate alert
	}()
}

func (s *orderServiceImpl) StartMatching(ctx context.Context, orderID string) error {
	log.Printf("[OrderService] Triggering automated matching for order: %s", orderID)

	// 1. Get current order state
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return err
	}
	if order == nil {
		return fmt.Errorf("order %s not found", orderID)
	}

	// 2. Validate state (should be pending_payment or similar after confirmation)
	// Some enterprise flows might skip 'pending_payment' if it's already confirmed via webhook

	// 3. Update status to 'searching'
	if err := s.orderRepo.UpdateStatus(ctx, orderID, domain.StatusSearching); err != nil {
		return fmt.Errorf("failed to update status to searching: %w", err)
	}

	// 4. Record event
	event := domain.OrderEvent{
		OrderID:   orderID,
		UserID:    order.CustomerID,
		Status:    domain.StatusSearching,
		Message:   "Payment confirmed. Searching for nearest courier...",
		CreatedAt: time.Now(),
	}
	_ = s.eventRepo.SaveEvent(ctx, event)
	_ = s.eventBus.Publish(ctx, "order.updates", event)

	// 5. Trigger finding logic asynchronously to not block the internal API caller
	go func() {
		// Use a background context for the async job
		bgCtx := context.Background()
		if err := s.FindAndAssignCourier(bgCtx, orderID); err != nil {
			log.Printf("[OrderService] Async matching failed for %s: %v", orderID, err)
		}
	}()

	return nil
}

func (s *orderServiceImpl) RetryMatching(ctx context.Context, orderID string) error {
	log.Printf("[OrderService] Retrying automated matching for order: %s", orderID)

	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return err
	}
	if order == nil {
		return fmt.Errorf("order %s not found", orderID)
	}

	if order.Status != domain.StatusNoCourierFound && order.Status != domain.StatusSearching {
		return fmt.Errorf("order cannot be retried from status: %s", order.Status)
	}

	return s.StartMatching(ctx, orderID)
}
