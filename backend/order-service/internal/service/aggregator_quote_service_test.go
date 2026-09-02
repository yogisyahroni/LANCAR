package service

import "testing"

func TestChargeableWeightKgUsesActualWeightWhenHigher(t *testing.T) {
	if got := chargeableWeightKg(2, 10, 10, 10); got != 2 {
		t.Fatalf("expected actual weight 2kg, got %v", got)
	}
}

func TestChargeableWeightKgUsesVolumetricWeightWhenHigher(t *testing.T) {
	if got := chargeableWeightKg(1, 30, 40, 50); got != 10 {
		t.Fatalf("expected volumetric weight 10kg, got %v", got)
	}
}

func TestChargeableWeightKgIgnoresIncompleteDimensions(t *testing.T) {
	if got := chargeableWeightKg(1, 30, 0, 50); got != 1 {
		t.Fatalf("expected actual weight for incomplete dimensions, got %v", got)
	}
}

func TestNormalizeAggregatorCategoryIsStable(t *testing.T) {
	if got := normalizeAggregatorCategory("  Makanan   Beku "); got != "makanan-beku" {
		t.Fatalf("expected normalized category makanan-beku, got %q", got)
	}
}
