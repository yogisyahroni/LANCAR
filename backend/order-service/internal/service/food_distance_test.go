package service

import (
	"strings"
	"testing"
)

// TestValidateFoodDeliveryDistance_FB104 — batas radius 20 km: di bawah /
// tepat di batas diterima, di atas ditolak dengan pesan yang jelas.
func TestValidateFoodDeliveryDistance_FB104(t *testing.T) {
	cases := []struct {
		name       string
		distanceKM float64
		wantErr    bool
	}{
		{"di_bawah_batas", 19.9, false},
		{"tepat_di_batas", 20.0, false},
		{"di_atas_batas", 20.1, true},
		{"jarak_jauh", 35.5, true},
		{"jarak_nol", 0.0, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateFoodDeliveryDistance(tc.distanceKM)
			if tc.wantErr && err == nil {
				t.Fatalf("expected error for distance %.1f km, got nil", tc.distanceKM)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("expected no error for distance %.1f km, got: %v", tc.distanceKM, err)
			}
			if tc.wantErr && !strings.Contains(err.Error(), "radius maksimum kurir") {
				t.Fatalf("error message tidak menjelaskan radius maksimum: %v", err)
			}
		})
	}
}
