package service

import (
	"testing"

	"tembus/merchant-service/internal/domain"
)

func TestPortalCapabilitiesOwnerIncludesOwnerOnlyActions(t *testing.T) {
	capabilities := portalCapabilities(255, true, true)
	for _, expected := range []string{"view_store", "manage_menu", "manage_staff", "manage_branch", "manage_payout", "manage_withdrawal"} {
		if !containsCapability(capabilities, expected) {
			t.Fatalf("expected owner capability %q, got %v", expected, capabilities)
		}
	}
}

func TestPortalCapabilitiesStaffDoesNotIncludeOwnerOnlyActions(t *testing.T) {
	capabilities := portalCapabilities(domain.PermViewStore|domain.PermAcceptOrder, false, true)
	if !containsCapability(capabilities, "view_store") || !containsCapability(capabilities, "accept_order") {
		t.Fatalf("expected staff capabilities to reflect permission bits, got %v", capabilities)
	}
	for _, forbidden := range []string{"manage_branch", "manage_payout", "manage_withdrawal"} {
		if containsCapability(capabilities, forbidden) {
			t.Fatalf("staff must not receive owner capability %q", forbidden)
		}
	}
}

func TestPortalCapabilitiesIndividualOwnerCannotManageStaff(t *testing.T) {
	capabilities := portalCapabilities(255, true, false)
	if containsCapability(capabilities, "manage_staff") {
		t.Fatalf("individual merchant must not receive manage_staff capability, got %v", capabilities)
	}
	for _, expected := range []string{"view_store", "manage_branch", "manage_payout", "manage_withdrawal"} {
		if !containsCapability(capabilities, expected) {
			t.Fatalf("individual owner should retain capability %q, got %v", expected, capabilities)
		}
	}
}

func TestPortalCapabilitiesStaffRoleMasksRemainServerDriven(t *testing.T) {
	cases := []struct {
		name        string
		permissions int
		expected    []string
		forbidden   []string
	}{
		{name: "manager", permissions: domain.DefaultPermissionsForRole(domain.StaffRoleManager), expected: []string{"view_store", "manage_menu", "accept_order", "update_prep", "manage_staff", "view_reports", "manage_promo"}, forbidden: []string{"manage_branch", "manage_payout"}},
		{name: "cashier", permissions: domain.DefaultPermissionsForRole(domain.StaffRoleCashier), expected: []string{"view_store", "accept_order", "chat_customer", "view_reports"}, forbidden: []string{"manage_menu", "update_prep", "manage_staff", "manage_promo"}},
		{name: "kitchen", permissions: domain.DefaultPermissionsForRole(domain.StaffRoleKitchen), expected: []string{"view_store", "update_prep"}, forbidden: []string{"accept_order", "view_reports", "manage_staff"}},
		{name: "marketing", permissions: domain.DefaultPermissionsForRole(domain.StaffRoleMarketing), expected: []string{"view_store", "manage_menu", "view_reports", "manage_promo"}, forbidden: []string{"accept_order", "update_prep", "manage_staff"}},
		{name: "finance", permissions: domain.DefaultPermissionsForRole(domain.StaffRoleFinance), expected: []string{"view_store", "view_reports"}, forbidden: []string{"manage_menu", "accept_order", "update_prep", "manage_staff", "manage_promo"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			capabilities := portalCapabilities(tc.permissions, false, true)
			for _, expected := range tc.expected {
				if !containsCapability(capabilities, expected) {
					t.Fatalf("expected capability %q, got %v", expected, capabilities)
				}
			}
			for _, forbidden := range tc.forbidden {
				if containsCapability(capabilities, forbidden) {
					t.Fatalf("role must not receive capability %q, got %v", forbidden, capabilities)
				}
			}
		})
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
