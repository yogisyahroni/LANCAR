package service

import (
	"testing"

	"tembus/merchant-service/internal/domain"
)

func TestPortalCapabilitiesOwnerIncludesOwnerOnlyActions(t *testing.T) {
	capabilities := portalCapabilities(255, true)
	for _, expected := range []string{"view_store", "manage_menu", "manage_staff", "manage_branch", "manage_payout", "manage_withdrawal"} {
		if !containsCapability(capabilities, expected) {
			t.Fatalf("expected owner capability %q, got %v", expected, capabilities)
		}
	}
}

func TestPortalCapabilitiesStaffDoesNotIncludeOwnerOnlyActions(t *testing.T) {
	capabilities := portalCapabilities(domain.PermViewStore|domain.PermAcceptOrder, false)
	if !containsCapability(capabilities, "view_store") || !containsCapability(capabilities, "accept_order") {
		t.Fatalf("expected staff capabilities to reflect permission bits, got %v", capabilities)
	}
	for _, forbidden := range []string{"manage_branch", "manage_payout", "manage_withdrawal"} {
		if containsCapability(capabilities, forbidden) {
			t.Fatalf("staff must not receive owner capability %q", forbidden)
		}
	}
}

func containsCapability(capabilities []string, expected string) bool {
	for _, capability := range capabilities {
		if capability == expected {
			return true
		}
	}
	return false
}
