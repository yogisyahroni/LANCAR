package worker

import (
	"context"
	"log"
	"time"

	"tembus/order-service/internal/domain"
)

// ============================================================
// FB-123 — Scheduled Order Worker
// Pesanan terjadwal (status 'scheduled') yang sudah due diaktivasi ke
// pending_merchant (atau auto-cancel kalau merchant tidak lagi valid).
//
// Pola persis food_prep_worker.go: ticker 1 menit, delegasi ke SATU method
// service (ProcessScheduledOrderActivation). Idempotent karena query due
// hanya mengambil order yang MASIH berstatus 'scheduled'.
// ============================================================

// ScheduledOrderWorker — aktivasi otomatis pesanan terjadwal.
type ScheduledOrderWorker struct {
	orderSvc domain.OrderService
	ticker   *time.Ticker
	quit     chan struct{}
}

// NewScheduledOrderWorker — buat worker baru.
func NewScheduledOrderWorker(orderSvc domain.OrderService) *ScheduledOrderWorker {
	return &ScheduledOrderWorker{
		orderSvc: orderSvc,
		quit:     make(chan struct{}),
	}
}

// Start — jalankan ticker di goroutine terpisah.
func (w *ScheduledOrderWorker) Start() {
	w.ticker = time.NewTicker(1 * time.Minute)
	go func() {
		log.Println("[ScheduledOrderWorker] started (tick 1m)")
		for {
			select {
			case <-w.ticker.C:
				ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
				if err := w.orderSvc.ProcessScheduledOrderActivation(ctx); err != nil {
					log.Printf("[ScheduledOrderWorker] process error: %v", err)
				}
				cancel()
			case <-w.quit:
				w.ticker.Stop()
				log.Println("[ScheduledOrderWorker] stopped")
				return
			}
		}
	}()
}

// Stop — hentikan worker.
func (w *ScheduledOrderWorker) Stop() {
	close(w.quit)
}
