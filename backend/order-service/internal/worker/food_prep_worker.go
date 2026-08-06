package worker

import (
	"context"
	"log"
	"time"

	"tembus/order-service/internal/domain"
)

// FoodPrepWorker — FOOD-BIKE-022: cron tiap 1 menit yang menggerakkan state
// machine food delivery di sisi merchant:
//  1. Order `preparing` yang food_ready_at ≤ NOW()+5 menit → `searching`
//     (matching driver dimulai 5 menit sebelum makanan siap).
//  2. Order `pending_merchant` yang belum direspon merchant > 3 menit →
//     auto-cancel (timeout SLA merchant).
//
// Ikuti pola internal/worker/sla_worker.go.
type FoodPrepWorker struct {
	orderSvc domain.OrderService
	ticker   *time.Ticker
	quit     chan struct{}
}

func NewFoodPrepWorker(orderSvc domain.OrderService) *FoodPrepWorker {
	return &FoodPrepWorker{
		orderSvc: orderSvc,
		quit:     make(chan struct{}),
	}
}

func (w *FoodPrepWorker) Start() {
	w.ticker = time.NewTicker(1 * time.Minute)
	go func() {
		log.Println("FoodPrepWorker started")
		for {
			select {
			case <-w.ticker.C:
				w.process()
			case <-w.quit:
				w.ticker.Stop()
				log.Println("FoodPrepWorker stopped")
				return
			}
		}
	}()
}

func (w *FoodPrepWorker) Stop() {
	close(w.quit)
}

func (w *FoodPrepWorker) process() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := w.orderSvc.ProcessFoodPrepTransitions(ctx); err != nil {
		log.Printf("[FoodPrepWorker] Error processing food prep transitions: %v", err)
	}
}
