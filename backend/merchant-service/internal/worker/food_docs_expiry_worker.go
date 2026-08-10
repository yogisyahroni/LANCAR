package worker

import (
	"context"
	"log"
	"time"

	"tembus/merchant-service/internal/domain"
)

// FoodDocsExpiryWorker — ADR 003 (2026-08-10): cek berkala (tiap 6 jam)
// merchant halal_certified yang sertifikat halalnya sudah kedaluwarsa →
// auto-demote halal_status ke 'unknown' (badge HALAL hilang), TETAPI toko
// TETAP buka — pola GoFood ("expired → logo hilang, restoran tetap jalan").
type FoodDocsExpiryWorker struct {
	repo domain.MerchantRepository
	stop chan struct{}
}

// NewFoodDocsExpiryWorker buat worker dengan repository merchant.
func NewFoodDocsExpiryWorker(repo domain.MerchantRepository) *FoodDocsExpiryWorker {
	return &FoodDocsExpiryWorker{repo: repo, stop: make(chan struct{})}
}

// Start jalankan worker dalam goroutine (interval 6 jam).
func (w *FoodDocsExpiryWorker) Start() {
	go w.loop()
}

// Stop hentikan worker.
func (w *FoodDocsExpiryWorker) Stop() {
	close(w.stop)
}

func (w *FoodDocsExpiryWorker) loop() {
	w.runOnce() // langsung cek saat startup
	ticker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			w.runOnce()
		case <-w.stop:
			return
		}
	}
}

func (w *FoodDocsExpiryWorker) runOnce() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	expired, err := w.repo.ListCertifiedWithExpiredHalal(ctx)
	if err != nil {
		log.Printf("[FoodDocsExpiryWorker] gagal query sertifikat expired: %v", err)
		return
	}
	for _, m := range expired {
		if err := w.repo.SetHalalStatus(ctx, m.ID, "unknown"); err != nil {
			log.Printf("[FoodDocsExpiryWorker] gagal demote halal merchant %s: %v", m.ID, err)
			continue
		}
		log.Printf("[FoodDocsExpiryWorker] auto-demote halal merchant %s (%s) — sertifikat kedaluwarsa, toko tetap buka", m.ID, m.NamaToko)
	}
	if len(expired) > 0 {
		log.Printf("[FoodDocsExpiryWorker] %d merchant di-demote (badge halal hilang)", len(expired))
	}
}
