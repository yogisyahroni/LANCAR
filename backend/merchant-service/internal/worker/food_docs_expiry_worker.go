package worker

import (
	"context"
	"log"
	"time"

	"tembus/merchant-service/internal/domain"
)

// FoodDocsExpiryWorker — FB-092: cek berkala (tiap 6 jam) merchant yang
// toko-nya buka (is_open=true) tapi dokumen pangan sudah kedaluwarsa
// (halal BPJPH / SPP-IRT / izin edar BPOM) → auto-suspend toko (is_open=false)
// sebagai re-KYC gate (PerBPOM 4/2024 + PP 39/2021).
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

	expired, err := w.repo.ListOpenWithExpiredFoodDocs(ctx)
	if err != nil {
		log.Printf("[FoodDocsExpiryWorker] gagal query dokumen expired: %v", err)
		return
	}
	for _, m := range expired {
		if err := w.repo.ToggleOpen(ctx, m.ID, false); err != nil {
			log.Printf("[FoodDocsExpiryWorker] gagal suspend merchant %s: %v", m.ID, err)
			continue
		}
		log.Printf("[FoodDocsExpiryWorker] auto-suspend toko merchant %s (%s) — dokumen pangan kedaluwarsa", m.ID, m.NamaToko)
	}
	if len(expired) > 0 {
		log.Printf("[FoodDocsExpiryWorker] %d merchant di-suspend (re-KYC)", len(expired))
	}
}
