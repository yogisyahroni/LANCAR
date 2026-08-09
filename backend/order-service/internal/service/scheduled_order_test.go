package service

import (
	"strings"
	"testing"
	"time"
)

func strPtr(s string) *string { return &s }

func timePtr(t time.Time) *time.Time { return &t }

// validScheduledTime — waktu jadwal yang pasti valid saat test dijalankan:
// now + 45 menit (≥30 menit, same day). Kalau melewati tengah malam atau di
// luar jam operasional test, fallback ke siang ini (12:00) selama masih
// ≥30 menit dari sekarang.
func validScheduledTime(now time.Time, buka, tutup int) time.Time {
	cand := now.Add(45 * time.Minute)
	inHours := cand.Hour()*60+cand.Minute() >= buka*60 && cand.Hour()*60+cand.Minute() <= tutup*60
	if cand.Day() == now.Day() && cand.Month() == now.Month() && inHours {
		return cand
	}
	noon := time.Date(now.Year(), now.Month(), now.Day(), 12, 0, 0, 0, now.Location())
	if noon.After(now.Add(30 * time.Minute)) {
		return noon
	}
	return now.Add(30*time.Minute + time.Second)
}

// TestValidateScheduledAt_FB123 — aturan pesanan terjadwal:
// 1) nil → tolak; 2) < 30 menit → tolak; 3) bukan hari ini → tolak;
// 4) di luar jam operasional → tolak; 5) valid → lolos.
func TestValidateScheduledAt_FB123(t *testing.T) {
	now := time.Now()
	buka, tutup := strPtr("08:00"), strPtr("22:00")

	valid := validScheduledTime(now, 8, 22)
	// Besok pukul sama (salah hari).
	tomorrow := valid.Add(24 * time.Hour)
	// Hari ini pukul 07:00 (sebelum buka 08:00).
	todayBeforeOpen := time.Date(now.Year(), now.Month(), now.Day(), 7, 0, 0, 0, now.Location())
	// Hari ini pukul 23:00 (setelah tutup 22:00).
	todayAfterClose := time.Date(now.Year(), now.Month(), now.Day(), 23, 0, 0, 0, now.Location())

	cases := []struct {
		name    string
		sa      *time.Time
		buka    *string
		tutup   *string
		wantErr bool
	}{
		{"nil_waktu_ditolak", nil, buka, tutup, true},
		{"kurang_dari_30_menit", timePtr(now.Add(10 * time.Minute)), buka, tutup, true},
		{"bukan_hari_ini", &tomorrow, buka, tutup, true},
		{"sebelum_jam_buka", &todayBeforeOpen, buka, tutup, true},
		{"setelah_jam_tutup", &todayAfterClose, buka, tutup, true},
		{"valid_di_dalam_jam_operasional", &valid, buka, tutup, false},
		{"valid_tanpa_jam_operasional", &valid, nil, nil, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateScheduledAt(tc.sa, tc.buka, tc.tutup)
			if tc.wantErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("expected no error, got: %v", err)
			}
		})
	}
}

// TestValidateScheduledAt_PesanMinimal_FB123 — error message harus
// menjelaskan aturan minimal 30 menit (customer butuh pesan yang jelas).
func TestValidateScheduledAt_PesanMinimal_FB123(t *testing.T) {
	now := time.Now()
	err := validateScheduledAt(timePtr(now.Add(5*time.Minute)), nil, nil)
	if err == nil || !strings.Contains(err.Error(), "minimal 30 menit") {
		t.Fatalf("pesan error tidak menjelaskan minimal 30 menit: %v", err)
	}
}

// TestParseHHMM_FB123 — format jam operasional: "HH:MM" dan "HH:MM:SS"
// keduanya diterima; format rusak ditolak.
func TestParseHHMM_FB123(t *testing.T) {
	h, m, err := parseHHMM("08:00")
	if err != nil || h != 8 || m != 0 {
		t.Fatalf("parse 08:00 → %d:%d err=%v", h, m, err)
	}
	h, m, err = parseHHMM("22:30:00")
	if err != nil || h != 22 || m != 30 {
		t.Fatalf("parse 22:30:00 → %d:%d err=%v", h, m, err)
	}
	if _, _, err := parseHHMM("jam delapan"); err == nil {
		t.Fatalf("format rusak harus ditolak")
	}
}
