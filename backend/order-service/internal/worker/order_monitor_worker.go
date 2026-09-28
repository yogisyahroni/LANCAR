package worker

import (
	"context"
	"log"
	"tembus/order-service/internal/domain"
	"time"
)

type OrderMonitorWorker struct {
	orderRepo domain.OrderRepository
	orderSvc  domain.OrderService
	timeout   time.Duration
}

func NewOrderMonitorWorker(repo domain.OrderRepository, svc domain.OrderService, timeout time.Duration) *OrderMonitorWorker {
	return &OrderMonitorWorker{
		orderRepo: repo,
		orderSvc:  svc,
		timeout:   timeout,
	}
}

func (w *OrderMonitorWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	log.Printf("Order monitor worker started (cancel timeout: %v)", w.timeout)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// 1. Auto-cancel expired 'pending_payment' orders
			count, err := w.orderRepo.CancelExpiredOrders(ctx, w.timeout)
			if err != nil {
				log.Printf("Order monitor (cancel) error: %v", err)
			} else if count > 0 {
				log.Printf("Order monitor: cancelled %d expired orders", count)
			}

			// 2. Expire searching orders using the timeout stored on their delivery
			// service product. The repository only uses this duration as a legacy
			// fallback when a service row is missing its DB configuration.
			pendingOrders, err := w.orderRepo.GetPendingAssignmentOrders(ctx, 0)
			if err != nil {
				log.Printf("Order monitor (cancel stuck dispatching) error: %v", err)
			} else if len(pendingOrders) > 0 {
				for _, o := range pendingOrders {
					log.Printf("🚨 [ADMIN_ALERT] Order %s (ID: %s) exceeded its configured provider search timeout. Setting to no_courier_found.", o.OrderNumber, o.ID)
					if err := w.orderSvc.UpdateStatus(ctx, o.ID, domain.StatusNoCourierFound); err != nil {
						log.Printf("Failed to update stuck order %s: %v", o.ID, err)
					}
				}
			}
		}
	}
}
