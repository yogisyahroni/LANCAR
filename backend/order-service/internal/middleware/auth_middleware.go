package middleware

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"tembus/order-service/pkg/utils"
)

const (
	UserIDKey contextKey = "user_id"
	RoleKey   contextKey = "role"
)

var globalDB *sql.DB

func SetDB(db *sql.DB) {
	globalDB = db
}

func AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && parts[0] == "Bearer" {
				claims, err := utils.ValidateToken(parts[1])
				if err == nil {
					ctx := context.WithValue(r.Context(), UserIDKey, claims.UserID)
					ctx = context.WithValue(ctx, RoleKey, claims.Role)
					r.Header.Set("X-User-ID", claims.UserID)
					r.Header.Set("X-User-Role", claims.Role)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
		}

		// Support web admin session cookie authentication
		cookie, err := r.Cookie("admin_session")
		if err == nil && cookie.Value != "" && globalDB != nil {
			var userID, role string
			query := `
				SELECT s.user_id, u.role 
				FROM web_sessions s
				JOIN users u ON s.user_id = u.id
				WHERE s.session_token = $1
				  AND s.expires_at > NOW()
				  AND u.deleted_at IS NULL
			`
			err := globalDB.QueryRowContext(r.Context(), query, cookie.Value).Scan(&userID, &role)
			if err == nil && userID != "" {
				ctx := context.WithValue(r.Context(), UserIDKey, userID)
				ctx = context.WithValue(ctx, RoleKey, role)
				r.Header.Set("X-User-ID", userID)
				r.Header.Set("X-User-Role", role)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}

		http.Error(w, "Authorization required", http.StatusUnauthorized)
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

const (
	RoleAdmin   = "admin"
	RoleFinance = "finance"
)

func RoleCheck(allowedRoles ...string) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			userRole := GetRoleFromContext(r.Context())
			
			allowed := false
			for _, role := range allowedRoles {
				if userRole == role {
					allowed = true
					break
				}
			}
			
			if !allowed {
				http.Error(w, "Forbidden: insufficient permissions", http.StatusForbidden)
				return
			}
			
			next.ServeHTTP(w, r)
		}
	}
}

