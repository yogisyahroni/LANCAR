package service

import (
	"testing"
	"time"

	"tembus/merchant-service/internal/domain"
)

func TestOperatingStateOverrideValidation(t *testing.T) {
	cases := []struct {
		name  string
		state string
		until *time.Time
		valid bool
	}{
		{name: "open", state: domain.OperatingStateOpen, valid: true},
		{name: "closed", state: domain.OperatingStateClosed, valid: true},
		{name: "temporary closure", state: domain.OperatingStateTempClosed, valid: true},
		{name: "holiday", state: domain.OperatingStateHoliday, valid: true},
		{name: "busy remains merchant control", state: domain.OperatingStateBusy, valid: false},
		{name: "paused remains merchant control", state: domain.OperatingStatePaused, valid: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := validOperatingStateOverrideState(tc.state); got != tc.valid {
				t.Fatalf("validOperatingStateOverrideState(%q) = %v, want %v", tc.state, got, tc.valid)
			}
		})
	}
}

func TestOperatingStateOverrideRoles(t *testing.T) {
	for _, role := range []string{"super_admin", "admin", "ops_admin", "ops_security", "cs_agent", "customer_support", "manager"} {
		if !validOperatingStateOverrideRole(role) {
			t.Fatalf("role %q must be allowed", role)
		}
	}
	for _, role := range []string{"merchant", "courier", "customer", "finance"} {
		if validOperatingStateOverrideRole(role) {
			t.Fatalf("role %q must be rejected", role)
		}
	}
}
