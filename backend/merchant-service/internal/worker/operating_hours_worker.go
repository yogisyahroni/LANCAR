package worker

import (
	"context"
	"log"
	"time"

	"tembus/merchant-service/internal/domain"
)

// OperatingHoursWorker — FB-095: auto buka/tutup toko sesuai jam operasional
// (jam_buka / jam_tutup merchant). Sebelumnya is_open 100% manual oleh
// merchant; worker ini menegakkan jam operasional secara berkala.
//
// Aturan:
//   - Hanya merchant verification_status = 'approved' (pending tidak pernah
//     di-auto-buka).
//   - Auto-BUKA hanya kalau gate KYC dokumen pangan lolos (FB-092) — worker
//     tidak boleh membuka toko yang belum lengkap/expired sertifikatnya.
//   - Jam lintas tengah malam (tutup < buka, mis. 21:00–02:00) didukung.
//   - Interval 5 menit: perubahan jam terdeteksi paling lambat 5 menit.
type OperatingHoursWorker struct {
	repo domain.MerchantRepository
	stop chan struct{}
}

// NewOperatingHoursWorker buat worker dengan repository merchant.
func NewOperatingHoursWorker(repo domain.MerchantRepository) *OperatingHoursWorker {
	return &OperatingHoursWorker{repo: repo, stop: make(chan struct{})}
}

// Start jalankan worker dalam goroutine (interval 5 menit).
func (w *OperatingHoursWorker) Start() {
	go w.loop()
}

// Stop hentikan worker.
func (w *OperatingHoursWorker) Stop() {
	close(w.stop)
}

func (w *OperatingHoursWorker) loop() {
	w.runOnce() // langsung sinkronkan saat startup
	ticker := time.NewTicker(5 * time.Minute)
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

// expectedOpen — apakah waktu `now` termasuk dalam jam operasional.
// Buka < tutup (normal, hari sama): buka <= now < tutup.
// Tutup < buka (lintas tengah malam): now >= buka ATAU now < tutup.
func expectedOpen(jamBuka, jamTutup string, now time.Time) bool {
	buka, err1 := time.Parse("15:04", jamBuka)
	tutup, err2 := time.Parse("15:04", jamTutup)
	if err1 != nil || err2 != nil {
		return false // jam tidak valid → jangan auto-buka
	}
	// Normalisasi SEMUA ke tanggal 2000-01-01 — time.Parse("15:04") menghasilkan
	// tahun 0, perbandingan Before antar tahun beda selalu false/salah.
	buka = time.Date(2000, 1, 1, buka.Hour(), buka.Minute(), 0, 0, time.UTC)
	tutup = time.Date(2000, 1, 1, tutup.Hour(), tutup.Minute(), 0, 0, time.UTC)
	nowMin := time.Date(2000, 1, 1, now.Hour(), now.Minute(), 0, 0, time.UTC)
	if !buka.Before(tutup) {
		// Lintas tengah malam.
		return !nowMin.Before(buka) || nowMin.Before(tutup)
	}
	return !nowMin.Before(buka) && nowMin.Before(tutup)
}

func (w *OperatingHoursWorker) runOnce() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	merchants, err := w.repo.ListForOperatingHoursSync(ctx)
	if err != nil {
		log.Printf("[OperatingHoursWorker] gagal query jam operasional: %v", err)
		return
	}

	now := time.Now()
	var opened, closed int
	for _, m := range merchants {
		if m.JamBuka == nil || m.JamTutup == nil {
			continue
		}
		open := expectedOpen(*m.JamBuka, *m.JamTutup, now)
		if open && !m.IsOpen {
			// Auto-buka hanya kalau gate KYC dokumen pangan lolos (FB-092).
			if !m.FoodDocsReady() {
				log.Printf("[OperatingHoursWorker] merchant %s (%s) sudah jam buka tapi dokumen pangan belum lengkap — SKIP auto-buka", m.ID, m.NamaToko)
				continue
			}
			if err := w.repo.ToggleOpen(ctx, m.ID, true); err != nil {
				log.Printf("[OperatingHoursWorker] gagal auto-buka merchant %s: %v", m.ID, err)
				continue
			}
			opened++
			log.Printf("[OperatingHoursWorker] auto-buka toko merchant %s (%s) — jam operasional", m.ID, m.NamaToko)
		} else if !open && m.IsOpen {
			if err := w.repo.ToggleOpen(ctx, m.ID, false); err != nil {
				log.Printf("[OperatingHoursWorker] gagal auto-tutup merchant %s: %v", m.ID, err)
				continue
			}
			closed++
			log.Printf("[OperatingHoursWorker] auto-tutup toko merchant %s (%s) — di luar jam operasional", m.ID, m.NamaToko)
		}
	}
	if opened > 0 || closed > 0 {
		log.Printf("[OperatingHoursWorker] %d toko dibuka, %d toko ditutup otomatis", opened, closed)
	}
}
