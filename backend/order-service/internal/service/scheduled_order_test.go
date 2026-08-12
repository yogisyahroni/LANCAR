package service

import (
	"strings"
	"testing"
	"time"
)

func strPtr(s string) *string { return &s }

func timePtr(t time.Time) *time.Time { return &t }

// TestValidateScheduledAt_FB123 — aturan pesanan terjadwal:
// 1) nil → tolak; 2) < 30 menit → tolak; 3) bukan hari ini → tolak;
// 4) di luar jam operasional → tolak; 5) valid → lolos.
// AUDIT-FIX M1: deterministik — `now` eksplisit di zona WIB, semua case
// dibangun di WIB (validasi memakai Asia/Jakarta, bukan TZ runner).
func TestValidateScheduledAt_FB123(t *testing.T) {
	now := time.Date(2026, 8, 9, 10, 0, 0, 0, jakartaLoc) // Sabtu 10:00 WIB
	buka, tutup := strPtr("08:00"), strPtr("22:00")

	valid := time.Date(2026, 8, 9, 12, 0, 0, 0, jakartaLoc)
	// Besok pukul sama (salah hari).
	tomorrow := time.Date(2026, 8, 10, 12, 0, 0, 0, jakartaLoc)
	// Hari ini pukul 07:00 (sebelum buka 08:00).
	todayBeforeOpen := time.Date(2026, 8, 9, 7, 0, 0, 0, jakartaLoc)
	// Hari ini pukul 23:00 (setelah tutup 22:00).
	todayAfterClose := time.Date(2026, 8, 9, 23, 0, 0, 0, jakartaLoc)

	cases := []struct {
		name    string
		now     time.Time
		sa      *time.Time
		buka    *string
		tutup   *string
		wantErr bool
	}{
		{"nil_waktu_ditolak", now, nil, buka, tutup, true},
		{"kurang_dari_30_menit", now, timePtr(now.Add(10 * time.Minute)), buka, tutup, true},
		{"bukan_hari_ini", now, &tomorrow, buka, tutup, true},
		{"sebelum_jam_buka", now, &todayBeforeOpen, buka, tutup, true},
		{"setelah_jam_tutup", now, &todayAfterClose, buka, tutup, true},
		{"valid_di_dalam_jam_operasional", now, &valid, buka, tutup, false},
		{"valid_tanpa_jam_operasional", now, &valid, nil, nil, false},
		// AUDIT-FIX M3: jam operasional lintas tengah malam (18:00–02:00).
		{"lintas_malam_valid_20:00", now, timePtr(time.Date(2026, 8, 9, 20, 0, 0, 0, jakartaLoc)), strPtr("18:00"), strPtr("02:00"), false},
		{"lintas_malam_valid_01:00", time.Date(2026, 8, 10, 0, 30, 0, 0, jakartaLoc), timePtr(time.Date(2026, 8, 10, 1, 0, 0, 0, jakartaLoc)), strPtr("18:00"), strPtr("02:00"), false},
		{"lintas_malam_ditolak_12:00", now, timePtr(time.Date(2026, 8, 9, 12, 0, 0, 0, jakartaLoc)), strPtr("18:00"), strPtr("02:00"), true},
		// UAT-AN-072 (timezone): scheduled 23:45 WIB.
		// - Dengan jam operasional 08:00–22:00 → DITOLAK (sudah lewat tutup).
		// - Dengan jam operasional 08:00–23:59 → VALID di WIB.
		// - Dipastikan bukan selisih 7 jam: kalau validasi salah pakai UTC,
		//   23:45 WIB = 16:45 UTC → masih dalam 08:00–22:00 → lolos padahal
		//   seharusnya tolak (regresi timezone yang harus dicegah).
		{"an072_23:45_wib_ditolak_setelah_tutup_22:00", now, timePtr(time.Date(2026, 8, 9, 23, 45, 0, 0, jakartaLoc)), strPtr("08:00"), strPtr("22:00"), true},
		{"an072_23:45_wib_valid_sampai_23:59", now, timePtr(time.Date(2026, 8, 9, 23, 45, 0, 0, jakartaLoc)), strPtr("08:00"), strPtr("23:59"), false},
		{"an072_16:45_utc_ekuivalen_harus_sama_dengan_23:45_wib", now, timePtr(time.Date(2026, 8, 9, 16, 45, 0, 0, time.UTC)), strPtr("08:00"), strPtr("22:00"), true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateScheduledAt(tc.sa, tc.buka, tc.tutup, tc.now)
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
	now := time.Date(2026, 8, 9, 10, 0, 0, 0, jakartaLoc)
	err := validateScheduledAt(timePtr(now.Add(5*time.Minute)), nil, nil, now)
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
