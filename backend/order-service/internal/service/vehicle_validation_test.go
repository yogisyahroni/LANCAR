package service

import (
	"testing"

	"tembus/order-service/internal/domain"
)

func TestIsVehicleCapable(t *testing.T) {
	cases := []struct {
		name     string
		vehicle  string
		subType  string
		expected bool
	}{
		{"motor for motor tambal ban", "motor", "tambal_ban_motor", true},
		{"bebek for motor tambal ban", "bebek", "tambal_ban_motor", true},
		{"mobil for motor tambal ban", "sedan", "tambal_ban_motor", false},
		{"sedan for mobil tambal ban", "sedan", "tambal_ban_mobil", true},
		{"motor for mobil tambal ban", "motor", "tambal_ban_mobil", false},
		{"sepeda for food", "sepeda", "food_delivery", true},
		{"motor for food", "motor", "food_delivery", false},
		{"unknown service fails closed", "motor", "unknown_service", false},
		{"unknown vehicle fails closed", "unknown_vt", "tambal_ban_motor", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := isVehicleCapable(c.vehicle, c.subType)
			if got != c.expected {
				t.Errorf("isVehicleCapable(%q,%q) = %v, want %v", c.vehicle, c.subType, got, c.expected)
			}
		})
	}
}

func TestIsCourierVehicleCapableUsesTransportVehicleForTowing(t *testing.T) {
	transport := "pickup"
	courier := &domain.NearbyCourier{
		VehicleType:    "matic",
		VehicleTypeCar: &transport,
	}

	if !isCourierVehicleCapable(courier, "towing_motor") {
		t.Fatal("expected pickup transport to be eligible for towing motor")
	}
	if isCourierVehicleCapable(courier, "towing_mobil") {
		t.Fatal("did not expect pickup transport to be eligible for towing mobil")
	}

	courier.VehicleTypeCar = nil
	if isCourierVehicleCapable(courier, "towing_motor") {
		t.Fatal("did not expect towing eligibility without transport vehicle")
	}
}
