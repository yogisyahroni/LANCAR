package worker

import (
	"testing"
	"time"
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
