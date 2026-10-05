package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"tembus/merchant-service/internal/domain"
)

func TestMerchantPermissionMatrixIsServerAuthoritative(t *testing.T) {
	tests := []struct {
		name     string
		method   string
		path     string
		expected int
	}{
		{name: "dashboard read", method: http.MethodGet, path: "/api/v1/merchant/dashboard", expected: domain.PermViewStore},
		{name: "menu read", method: http.MethodGet, path: "/api/v1/merchant/menu", expected: domain.PermViewStore},
		{name: "menu mutation", method: http.MethodPost, path: "/api/v1/merchant/menu", expected: domain.PermManageMenu},
		{name: "promo read", method: http.MethodGet, path: "/api/v1/merchant/promos", expected: domain.PermViewStore},
		{name: "promo mutation", method: http.MethodPost, path: "/api/v1/merchant/promos", expected: domain.PermManagePromo},
		{name: "staff management", method: http.MethodPatch, path: "/api/v1/merchant/staff/merchant-1/staff-1", expected: domain.PermManageStaff},
		{name: "order accept", method: http.MethodPost, path: "/api/v1/merchant/orders/order-1/accept", expected: domain.PermAcceptOrder},
		{name: "order preparation", method: http.MethodPost, path: "/api/v1/merchant/orders/order-1/ready", expected: domain.PermUpdatePrep},
		{name: "report read", method: http.MethodGet, path: "/api/v1/merchant/reports", expected: domain.PermViewReports},
		{name: "finance read", method: http.MethodGet, path: "/api/v1/merchant/finance-statement", expected: domain.PermViewReports},
		{name: "integration read", method: http.MethodGet, path: "/api/v1/merchant/integrations/pos", expected: domain.PermViewStore},
		{name: "audit read", method: http.MethodGet, path: "/api/v1/merchant/audit-logs", expected: domain.PermManageStaff},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(tt.method, tt.path, nil)
			if got := merchantPermissionForRequest(r); got != tt.expected {
				t.Fatalf("permission for %s %s = %d, want %d", tt.method, tt.path, got, tt.expected)
			}
		})
	}
}

func TestMerchantStepUpRequiresGatewayVerifiedTOTP(t *testing.T) {
	withoutStepUp := httptest.NewRequest(http.MethodPost, "/api/v1/merchant/security-approvals", nil)
	if requireStepUp(withoutStepUp) {
		t.Fatal("missing TOTP verification must not pass step-up")
	}

	withStepUp := httptest.NewRequest(http.MethodPost, "/api/v1/merchant/security-approvals", nil)
	withStepUp.Header.Set("X-TOTP-Verified", "true")
	if !requireStepUp(withStepUp) {
		t.Fatal("gateway-verified TOTP must pass step-up")
	}
}
