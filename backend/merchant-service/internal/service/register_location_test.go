package service_test

import (
	"context"
	"strings"
	"testing"

	"tembus/merchant-service/internal/domain"
)

// ── FB-094: lokasi toko WAJIB saat daftar ─────────────────────────────
// Kasus:
//   1. Tanpa lokasi_lat/lokasi_lng → ditolak.
//   2. Lokasi (0,0) → ditolak (belum di-pin di peta).
//   3. Lokasi di luar rentang valid → ditolak.
//   4. Lokasi valid → registrasi jalan (repo.Create dipanggil).

func newRegisterSvc() domain.MerchantService {
	return newFoodDocsService(&foodDocsRepo{merchant: nil})
}

func validRegisterReq() domain.RegisterMerchantRequest {
	lat, lng := -6.200000, 106.800000
	return domain.RegisterMerchantRequest{
		NamaToko:      "Warung Nasi Uduk Bahari",
		Alamat:        "Jl. Mawar No. 12, Jakarta Selatan",
		LokasiLat:     &lat,
		LokasiLng:     &lng,
		JamBuka:       strp("08:00"),
		JamTutup:      strp("22:00"),
		KtpPemilikURL: "https://cdn.example.com/ktp.jpg",
		FotoTokoURL:   "https://cdn.example.com/toko.jpg",
		RekeningURL:   "https://cdn.example.com/rekening.jpg",
	}
}

func TestRegisterRequiresLocation(t *testing.T) {
	svc := newRegisterSvc()

	t.Run("tolak tanpa lokasi", func(t *testing.T) {
		req := validRegisterReq()
		req.LokasiLat = nil
		req.LokasiLng = nil
		_, err := svc.Register(context.Background(), "user-1", req)
		if err == nil || !strings.Contains(err.Error(), "lokasi toko wajib") {
			t.Fatalf("expected location-required error, got: %v", err)
		}
	})

	t.Run("tolak lokasi 0,0", func(t *testing.T) {
		req := validRegisterReq()
		z := 0.0
		req.LokasiLat = &z
		req.LokasiLng = &z
		_, err := svc.Register(context.Background(), "user-1", req)
		if err == nil || !strings.Contains(err.Error(), "tidak valid") {
			t.Fatalf("expected invalid-location error, got: %v", err)
		}
	})

	t.Run("tolak lat di luar rentang", func(t *testing.T) {
		req := validRegisterReq()
		bad := 91.5
		req.LokasiLat = &bad
		_, err := svc.Register(context.Background(), "user-1", req)
		if err == nil || !strings.Contains(err.Error(), "tidak valid") {
			t.Fatalf("expected out-of-range error, got: %v", err)
		}
	})

	t.Run("lokasi valid tersimpan", func(t *testing.T) {
		req := validRegisterReq()
		m, err := svc.Register(context.Background(), "user-1", req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if m == nil || m.LokasiLat == nil || m.LokasiLng == nil {
			t.Fatalf("expected merchant with location stored, got: %+v", m)
		}
	})
}
