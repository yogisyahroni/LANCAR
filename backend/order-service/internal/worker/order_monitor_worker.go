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

			// 2. Cancel orders 'searching' for too long (> 15 mins)
			threshold := 15 * time.Minute
			pendingOrders, err := w.orderRepo.GetPendingAssignmentOrders(ctx, threshold)
			if err != nil {
				log.Printf("Order monitor (cancel stuck dispatching) error: %v", err)
			} else if len(pendingOrders) > 0 {
				for _, o := range pendingOrders {
					log.Printf("🚨 [ADMIN_ALERT] Order %s (ID: %s) is stuck in 'searching' for > %v. Setting to no_courier_found.", o.OrderNumber, o.ID, threshold)
					if err := w.orderSvc.UpdateStatus(ctx, o.ID, domain.StatusNoCourierFound); err != nil {
						log.Printf("Failed to update stuck order %s: %v", o.ID, err)
					}
				}
			}
		}
	}
}
