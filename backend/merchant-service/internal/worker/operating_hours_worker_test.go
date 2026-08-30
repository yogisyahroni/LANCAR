package worker

import (
	"testing"
	"time"

	"tembus/merchant-service/internal/domain"
)

// ── FB-095: unit test logika jam operasional ──────────────────────────
// Kasus:
//   1. Buka 08:00–22:00, now 10:30 → buka.
//   2. Buka 08:00–22:00, now 23:00 → tutup (di luar jam).
//   3. Buka 08:00–22:00, now 08:00 → buka (inklusi batas bawah).
//   4. Buka 08:00–22:00, now 22:00 → tutup (eksklusi batas atas).
//   5. Lintas tengah malam 21:00–02:00, now 23:30 → buka.
//   6. Lintas tengah malam 21:00–02:00, now 01:00 → buka.
//   7. Lintas tengah malam 21:00–02:00, now 12:00 → tutup.
//   8. Jam tidak valid → false (jangan auto-buka).

func at(h, m int) time.Time {
	return time.Date(2026, 8, 8, h, m, 0, 0, time.UTC)
}

func TestExpectedOpenForSchedule_UsesPreviousDayForOvernightShift(t *testing.T) {
	open, close := "21:00", "02:00"
	hours := []domain.MerchantOperatingHour{
		// Monday opens late, Tuesday is deliberately closed.
		{Weekday: int(time.Monday), IsOpen: true, OpensAt: &open, ClosesAt: &close},
		{Weekday: int(time.Tuesday), IsOpen: false},
	}
	jakarta := time.FixedZone("WIB", 7*60*60)
	if !expectedOpenForSchedule(hours, time.Date(2026, 9, 1, 1, 0, 0, 0, jakarta)) { // Tuesday 01:00
		t.Fatal("overnight shift from Monday must remain open Tuesday 01:00")
	}
	if expectedOpenForSchedule(hours, time.Date(2026, 9, 2, 1, 0, 0, 0, jakarta)) { // Wednesday 01:00
		t.Fatal("Tuesday closed must not inherit Monday's overnight shift")
	}
}

func TestExpectedOpen(t *testing.T) {
	cases := []struct {
		name     string
		buka     string
		tutup    string
		now      time.Time
		expected bool
	}{
		{"normal - siang dalam jam", "08:00", "22:00", at(10, 30), true},
		{"normal - malam di luar jam", "08:00", "22:00", at(23, 0), false},
		{"normal - batas bawah inklusif", "08:00", "22:00", at(8, 0), true},
		{"normal - batas atas eksklusif", "08:00", "22:00", at(22, 0), false},
		{"lintas malam - sebelum tengah malam", "21:00", "02:00", at(23, 30), true},
		{"lintas malam - setelah tengah malam", "21:00", "02:00", at(1, 0), true},
		{"lintas malam - siang tutup", "21:00", "02:00", at(12, 0), false},
		{"jam invalid - jangan auto-buka", "25:99", "02:00", at(1, 0), false},
		{"tutup invalid - jangan auto-buka", "08:00", "xx:yy", at(10, 0), false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := expectedOpen(c.buka, c.tutup, c.now)
			if got != c.expected {
				t.Fatalf("expectedOpen(%q, %q, %v) = %v, want %v", c.buka, c.tutup, c.now.Format("15:04"), got, c.expected)
			}
		})
	}
}
