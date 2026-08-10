package worker

import (
	"context"
	"log"
	"time"

	"tembus/order-service/internal/domain"
)

// FoodBatchWorker — FB-088: cron tiap 30 detik yang memasangkan 2 order food
// `searching` dari merchant yang sama + dropoff berdekatan menjadi 1 batch
// trip courier (pickup sekali, antar dua titik).
//
// GATE SLA: pairing hanya terjadi di window searching (overlap dgn prep
// time — matching driver sudah mulai 5 menit sebelum makanan siap), timebox
// ≤ 2 menit, radius antar-dropoff ≤ 1.5 km, max 2 order. Kalau tidak ada
// pasangan, order jalan solo — SLA tetap aman.
//
// Ikuti pola internal/worker/food_prep_worker.go.
type FoodBatchWorker struct {
	orderSvc domain.OrderService
	ticker   *time.Ticker
	quit     chan struct{}
}

func NewFoodBatchWorker(orderSvc domain.OrderService) *FoodBatchWorker {
	return &FoodBatchWorker{
		orderSvc: orderSvc,
		quit:     make(chan struct{}),
	}
}

func (w *FoodBatchWorker) Start() {
	w.ticker = time.NewTicker(30 * time.Second)
	go func() {
		log.Println("FoodBatchWorker started")
		for {
			select {
			case <-w.ticker.C:
				w.process()
			case <-w.quit:
				w.ticker.Stop()
				log.Println("FoodBatchWorker stopped")
				return
			}
		}
	}()
}

func (w *FoodBatchWorker) Stop() {
	close(w.quit)
}

func (w *FoodBatchWorker) process() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := w.orderSvc.PairFoodBatches(ctx); err != nil {
		log.Printf("[FoodBatchWorker] Error pairing food batches: %v", err)
	}
}
