package service

import (
	"testing"
	"time"

	"tembus/merchant-service/internal/domain"
)

func validMerchantAdRequest() domain.CreateMerchantAdRequest {
	start := time.Now().UTC().Add(2 * time.Minute)
	return domain.CreateMerchantAdRequest{
		Name:             "Kampanye Nasi Goreng",
		Description:      "Kampanye visibilitas menu",
		CreativeHeadline: "Nasi goreng favorit dekat kamu",
		CreativeBody:     "Lihat menu lengkap dan pesan sekarang",
		TotalBudgetIDR:   100000,
		DailyBudgetIDR:   20000,
		StartsAt:         start.Format(time.RFC3339),
		EndsAt:           start.Add(7 * 24 * time.Hour).Format(time.RFC3339),
		IdempotencyKey:   "ads-request-20260908-001",
	}
}

func TestValidateMerchantAd_Valid(t *testing.T) {
	start, end, err := validateMerchantAd(validMerchantAdRequest())
	if err != nil {
		t.Fatalf("valid Ads request ditolak: %v", err)
	}
	if !end.After(start) {
		t.Fatal("window Ads harus berurutan")
	}
}

func TestValidateMerchantAd_RejectsFinancialAndOperationalClaims(t *testing.T) {
	for _, claim := range []string{
		"Diskon 20% hari ini",
		"Pesanan dengan ETA tercepat",
		"Rating bintang lima",
	} {
		req := validMerchantAdRequest()
		req.CreativeHeadline = claim
		if _, _, err := validateMerchantAd(req); err == nil {
			t.Errorf("claim %q harus ditolak", claim)
		}
	}
}

func TestValidateMerchantAd_RejectsInvalidBudgetImageAndWindow(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*domain.CreateMerchantAdRequest)
	}{
		{"budget harian melebihi total", func(req *domain.CreateMerchantAdRequest) { req.DailyBudgetIDR = req.TotalBudgetIDR + 1 }},
		{"gambar bukan HTTPS", func(req *domain.CreateMerchantAdRequest) { req.CreativeImageURL = "http://example.test/ad.png" }},
		{"window berakhir", func(req *domain.CreateMerchantAdRequest) {
			req.EndsAt = time.Now().UTC().Add(-time.Minute).Format(time.RFC3339)
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := validMerchantAdRequest()
			tc.mutate(&req)
			if _, _, err := validateMerchantAd(req); err == nil {
				t.Fatal("request invalid harus ditolak")
			}
		})
	}
}

func TestAdsRequestFingerprintIgnoresIdempotencyKey(t *testing.T) {
	first := validMerchantAdRequest()
	second := first
	second.IdempotencyKey = "ads-request-20260908-002"
	if adsRequestFingerprint(first) != adsRequestFingerprint(second) {
		t.Fatal("fingerprint payload Ads tidak boleh berubah karena idempotency key")
	}
}
