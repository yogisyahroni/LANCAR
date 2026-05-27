package middleware

import (
	"context"
	"net/http"
	"strings"
	"tembus/auth-service/internal/domain"
	"tembus/auth-service/pkg/utils"
)

type contextKey string

const (
	UserIDKey       contextKey = "user_id"
	RoleKey         contextKey = "role"
	TOTPVerifiedKey contextKey = "totp_verified"
)

func AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Authorization header required", http.StatusUnauthorized)
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, "Invalid authorization header format", http.StatusUnauthorized)
			return
		}

		claims, err := utils.ValidateToken(parts[1])
		if err != nil {
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), UserIDKey, claims.UserID)
		ctx = context.WithValue(ctx, RoleKey, claims.Role)
		ctx = context.WithValue(ctx, TOTPVerifiedKey, claims.TOTPVerified)

		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

// Enforce2FAMiddleware ensures that users with sensitive roles have verified their 2FA
func Enforce2FAMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		role := GetRoleFromContext(r.Context())
		isVerified := IsTOTPVerifiedFromContext(r.Context())

		// Roles that REQUIRE 2FA
		if role == string(domain.RoleSuperAdmin) || role == string(domain.RoleFinance) {
			if !isVerified {
				http.Error(w, "2FA verification required for this role", http.StatusForbidden)
				return
			}
		}

		next.ServeHTTP(w, r)
	}
}

// PermissionMiddleware checks if the user's role has the required permission
func PermissionMiddleware(userRepo domain.UserRepository, requiredPerm domain.Permission, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		role := GetRoleFromContext(r.Context())
		if role == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Super Admin bypass
		if role == string(domain.RoleSuperAdmin) {
			next.ServeHTTP(w, r)
			return
		}

		permissions, err := userRepo.GetPermissionsByRole(r.Context(), role)
		if err != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		hasPerm := false
		for _, p := range permissions {
			if p == string(requiredPerm) {
				hasPerm = true
				break
			}
		}

		if !hasPerm {
			http.Error(w, "Forbidden: insufficient permissions", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	}
}

func RoleMiddleware(requiredRole string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		role := GetRoleFromContext(r.Context())
		if role != requiredRole && role != string(domain.RoleSuperAdmin) {
			http.Error(w, "Forbidden: insufficient permissions", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	}
}

func GetUserIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(UserIDKey).(string); ok {
		return v
	}
	return ""
}

func GetRoleFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(RoleKey).(string); ok {
		return v
	}
	return ""
}

func IsTOTPVerifiedFromContext(ctx context.Context) bool {
	if v, ok := ctx.Value(TOTPVerifiedKey).(bool); ok {
		return v
	}
	return false
}
