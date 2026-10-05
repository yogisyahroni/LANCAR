package service

import (
	"testing"

	"tembus/merchant-service/internal/domain"
)

func TestValidateMenuOutletOverrideRequest(t *testing.T) {
	valid := domain.UpsertMenuItemOutletOverrideRequest{
		MenuItemID: "11111111-1111-1111-1111-111111111111",
		BranchID:   "22222222-2222-2222-2222-222222222222",
	}
	if err := validateMenuOutletOverrideRequest(valid); err != nil {
		t.Fatalf("valid inherit request rejected: %v", err)
	}
	negative := int64(-1)
	valid.PriceIDR = &negative
	if err := validateMenuOutletOverrideRequest(valid); err == nil {
		t.Fatal("negative price accepted")
	}
}

func TestMenuOutletOverrideFingerprintChangesWithPolicy(t *testing.T) {
	base := domain.UpsertMenuItemOutletOverrideRequest{
		MenuItemID: "11111111-1111-1111-1111-111111111111",
		BranchID:   "22222222-2222-2222-2222-222222222222",
	}
	first, err := menuOutletOverrideFingerprint("33333333-3333-3333-3333-333333333333", "44444444-4444-4444-4444-444444444444", base)
	if err != nil {
		t.Fatal(err)
	}
	price := int64(42000)
	base.PriceIDR = &price
	second, err := menuOutletOverrideFingerprint("33333333-3333-3333-3333-333333333333", "44444444-4444-4444-4444-444444444444", base)
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Fatal("policy mutation did not change request fingerprint")
	}
}
