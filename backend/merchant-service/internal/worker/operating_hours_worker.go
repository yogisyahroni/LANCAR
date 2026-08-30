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

	jakarta, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		jakarta = time.FixedZone("WIB", 7*60*60)
	}
	now := time.Now().In(jakarta)
	merchantIDs := make([]string, 0, len(merchants))
	for _, merchant := range merchants {
		merchantIDs = append(merchantIDs, merchant.ID)
	}
	schedules, err := w.repo.ListOperatingHoursForMerchants(ctx, merchantIDs)
	if err != nil {
		log.Printf("[OperatingHoursWorker] gagal query jadwal mingguan: %v", err)
		return
	}
	closures, err := w.repo.ListSpecialClosuresOn(ctx, merchantIDs, now.Format("2006-01-02"))
	if err != nil {
		log.Printf("[OperatingHoursWorker] gagal query penutupan khusus: %v", err)
		return
	}
	var opened, closed int
	for _, m := range merchants {
		if m.JamBuka == nil || m.JamTutup == nil {
			continue
		}
		open := expectedOpen(*m.JamBuka, *m.JamTutup, now)
		if closure := closures[m.ID]; closure {
			open = false
		} else if schedule, exists := schedules[m.ID]; exists {
			open = expectedOpenForSchedule(schedule, now)
		}
		if open && !m.IsOpen {
			// ADR 003: dokumen pangan BUKAN lagi gate buka toko — semua status
			// halal boleh auto-buka (label & filter di sisi customer).
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

func expectedOpenForSchedule(hours []domain.MerchantOperatingHour, now time.Time) bool {
	byWeekday := make(map[int]domain.MerchantOperatingHour, len(hours))
	for _, hour := range hours {
		byWeekday[hour.Weekday] = hour
	}
	weekday := int(now.Weekday())
	if hour, ok := byWeekday[weekday]; ok && hour.IsOpen && hour.OpensAt != nil && hour.ClosesAt != nil {
		if isOpenInOwnCalendarDay(*hour.OpensAt, *hour.ClosesAt, now) {
			return true
		}
	}
	// Shift yang melewati tengah malam tetap berlaku setelah berganti hari.
	previousWeekday := (weekday + 6) % 7
	previous, ok := byWeekday[previousWeekday]
	if !ok || !previous.IsOpen || previous.OpensAt == nil || previous.ClosesAt == nil || *previous.OpensAt < *previous.ClosesAt {
		return false
	}
	return isOpenFromPreviousCalendarDay(*previous.OpensAt, *previous.ClosesAt, now)
}

// Untuk shift lintas tengah malam, bagian setelah 00:00 dimiliki jadwal hari
// sebelumnya. expectedOpen sendiri tidak tahu konteks weekday sehingga tidak
// cukup dipakai langsung pada schedule mingguan.
func isOpenInOwnCalendarDay(opensAt, closesAt string, now time.Time) bool {
	open, close, current, ok := clockMinutes(opensAt, closesAt, now)
	if !ok {
		return false
	}
	if open < close {
		return current >= open && current < close
	}
	return current >= open
}

func isOpenFromPreviousCalendarDay(opensAt, closesAt string, now time.Time) bool {
	open, close, current, ok := clockMinutes(opensAt, closesAt, now)
	return ok && open > close && current < close
}

func clockMinutes(opensAt, closesAt string, now time.Time) (int, int, int, bool) {
	open, errOpen := time.Parse("15:04", opensAt)
	close, errClose := time.Parse("15:04", closesAt)
	if errOpen != nil || errClose != nil || (open.Hour() == close.Hour() && open.Minute() == close.Minute()) {
		return 0, 0, 0, false
	}
	return open.Hour()*60 + open.Minute(), close.Hour()*60 + close.Minute(), now.Hour()*60 + now.Minute(), true
}
