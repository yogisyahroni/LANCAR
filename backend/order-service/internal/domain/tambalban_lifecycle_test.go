package domain

import "testing"

func TestValidateTambalBanLifecycle_AllowsCanonicalHappyPath(t *testing.T) {
	steps := [][2]OrderStatus{
		{StatusAccepted, StatusPickupArrived},
		{StatusPickupArrived, StatusPickingUp},
		{StatusPickingUp, StatusPickedUp},
		{StatusPickedUp, StatusDelivering},
		{StatusDelivering, StatusDelivered},
	}
	for _, step := range steps {
		if err := ValidateTambalBanLifecycle("tambal_ban_motor", "", step[0], step[1], OrderActorCourier); err != nil {
			t.Fatalf("expected %s -> %s to be allowed: %v", step[0], step[1], err)
		}
	}
}

func TestValidateTambalBanLifecycle_RejectsCourierShortcut(t *testing.T) {
	if err := ValidateTambalBanLifecycle(
		"tambal_ban_mobil", "", StatusAccepted, StatusPickedUp, OrderActorCourier,
	); err == nil {
		t.Fatal("expected accepted -> picked_up shortcut to be rejected")
	}
}

func TestValidateTambalBanLifecycle_DoesNotAffectOtherServices(t *testing.T) {
	if err := ValidateTambalBanLifecycle(
		"food_delivery", "", StatusAccepted, StatusPickedUp, OrderActorCourier,
	); err != nil {
		t.Fatalf("non-tambal service must remain under generic lifecycle only: %v", err)
	}
}

func TestValidateTambalBanLifecycle_AdminRecoveryUsesGenericGuard(t *testing.T) {
	if err := ValidateTambalBanLifecycle(
		"tambal_ban_motor", "", StatusAccepted, StatusPickedUp, OrderActorAdmin,
	); err != nil {
		t.Fatalf("admin recovery must remain governed by generic guard: %v", err)
	}
}
