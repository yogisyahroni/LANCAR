package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"tembus/auth-service/internal/domain"
	"tembus/auth-service/internal/middleware"
)

// MockUserRepository implements domain.UserRepository for testing purposes.
type MockUserRepository struct {
	domain.UserRepository
	Permissions []string
	Err         error
}

func (m *MockUserRepository) GetPermissionsByRole(ctx context.Context, role string) ([]string, error) {
	return m.Permissions, m.Err
}

func TestPermissionMiddleware(t *testing.T) {
	tests := []struct {
		name           string
		role           string
		permissions    []string
		requiredPerm   domain.Permission
		expectedStatus int
	}{
		{
			name:           "SuperAdminBypass",
			role:           string(domain.RoleSuperAdmin),
			permissions:    []string{}, // SuperAdmin doesn't need explicit perms in DB
			requiredPerm:   domain.PermManageUsers,
			expectedStatus: http.StatusOK,
		},
		{
			name:           "AdminWithPermission",
			role:           string(domain.RoleAdmin),
			permissions:    []string{string(domain.PermManageUsers)},
			requiredPerm:   domain.PermManageUsers,
			expectedStatus: http.StatusOK,
		},
		{
			name:           "AdminWithoutPermission",
			role:           string(domain.RoleAdmin),
			permissions:    []string{string(domain.PermViewAuditLogs)},
			requiredPerm:   domain.PermManageUsers,
			expectedStatus: http.StatusForbidden,
		},
		{
			name:           "EmptyRole",
			role:           "",
			permissions:    []string{},
			requiredPerm:   domain.PermManageUsers,
			expectedStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := &MockUserRepository{
				Permissions: tt.permissions,
			}

			handler := middleware.PermissionMiddleware(mockRepo, tt.requiredPerm, dummyHandler)

			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if tt.role != "" {
				ctx := context.WithValue(req.Context(), middleware.RoleKey, tt.role)
				req = req.WithContext(ctx)
			}

			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			if rr.Code != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, rr.Code)
			}
		})
	}
}

func TestEnforce2FAMiddleware(t *testing.T) {
	tests := []struct {
		name           string
		role           string
		totpVerified   bool
		expectedStatus int
	}{
		{
			name:           "SuperAdminVerified",
			role:           string(domain.RoleSuperAdmin),
			totpVerified:   true,
			expectedStatus: http.StatusOK,
		},
		{
			name:           "SuperAdminNotVerified",
			role:           string(domain.RoleSuperAdmin),
			totpVerified:   false,
			expectedStatus: http.StatusForbidden,
		},
		{
			name:           "FinanceNotVerified",
			role:           string(domain.RoleFinance),
			totpVerified:   false,
			expectedStatus: http.StatusForbidden,
		},
		{
			name:           "AdminNotVerified",
			role:           string(domain.RoleAdmin),
			totpVerified:   false,
			expectedStatus: http.StatusOK, // Admin doesn't strictly require 2FA in base Enforce2FA (only SuperAdmin/Finance)
		},
		{
			name:           "CustomerNotVerified",
			role:           string(domain.RoleCustomer),
			totpVerified:   false,
			expectedStatus: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := middleware.Enforce2FAMiddleware(dummyHandler)

			req := httptest.NewRequest(http.MethodGet, "/", nil)
			ctx := context.WithValue(req.Context(), middleware.RoleKey, tt.role)
			ctx = context.WithValue(ctx, middleware.TOTPVerifiedKey, tt.totpVerified)
			req = req.WithContext(ctx)

			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			if rr.Code != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, rr.Code)
			}
		})
	}
}
