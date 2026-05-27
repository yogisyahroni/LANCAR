package worker

import (
	"context"
	"log"
	"tembus/order-service/internal/domain"
	"time"
)

type OrderMonitorWorker struct {
	orderRepo domain.OrderRepository
	timeout   time.Duration
}

func NewOrderMonitorWorker(repo domain.OrderRepository, timeout time.Duration) *OrderMonitorWorker {
	return &OrderMonitorWorker{
		orderRepo: repo,
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

			// 2. Alert on orders 'pending_assignment' for too long (> 10 mins)
			threshold := 10 * time.Minute
			pendingOrders, err := w.orderRepo.GetPendingAssignmentOrders(ctx, threshold)
			if err != nil {
				log.Printf("Order monitor (alert) error: %v", err)
			} else if len(pendingOrders) > 0 {
				for _, o := range pendingOrders {
					// In production, this would trigger an actual alert (PagerDuty, Slack, etc.)
					log.Printf("🚨 [ADMIN_ALERT] Order %s (ID: %s) is stuck in 'searching' for > %v. Manual intervention may be required.", o.OrderNumber, o.ID, threshold)
				}
			}
		}
	}
}
