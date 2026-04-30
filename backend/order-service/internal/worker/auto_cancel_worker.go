package worker

import (
	"context"
	"lancar/order-service/internal/domain"
	"log"
	"time"
)

type AutoCancelWorker struct {
	orderRepo domain.OrderRepository
	timeout   time.Duration
}

func NewAutoCancelWorker(repo domain.OrderRepository, timeout time.Duration) *AutoCancelWorker {
	return &AutoCancelWorker{
		orderRepo: repo,
		timeout:   timeout,
	}
}

func (w *AutoCancelWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	log.Printf("Auto-cancel worker started (timeout: %v)", w.timeout)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			count, err := w.orderRepo.CancelExpiredOrders(ctx, w.timeout)
			if err != nil {
				log.Printf("Auto-cancel worker error: %v", err)
				continue
			}
			if count > 0 {
				log.Printf("Auto-cancel worker: cancelled %d expired orders", count)
			}
		}
	}
}
