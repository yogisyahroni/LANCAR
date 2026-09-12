package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func RequireGatewayAuth(secret string, db *sql.DB, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" || r.URL.Path == "/ready" {
			next.ServeHTTP(w, r)
			return
		}
		if len(secret) < 32 || (!verify(r, secret) && !verifyWebSession(r, db)) {
			http.Error(w, `{"status":"error","code":"ERR_INVALID_GATEWAY_CONTEXT"}`, http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func verifyWebSession(r *http.Request, db *sql.DB) bool {
	if db == nil {
		return false
	}
	var token string
	for _, name := range []string{"admin_session", "customer_session", "web_session"} {
		if c, err := r.Cookie(name); err == nil && strings.TrimSpace(c.Value) != "" {
			token = c.Value
			break
		}
	}
	if token == "" {
		return false
	}
	var userID, role string
	if err := db.QueryRowContext(r.Context(), `SELECT s.user_id::text,u.role FROM web_sessions s JOIN users u ON u.id=s.user_id WHERE s.session_token=$1 AND s.expires_at>NOW() AND u.deleted_at IS NULL`, token).Scan(&userID, &role); err != nil {
		return false
	}
	r.Header.Set("X-User-ID", userID)
	r.Header.Set("X-User-Role", role)
	return true
}

func verify(r *http.Request, secret string) bool {
	ts, user := strings.TrimSpace(r.Header.Get("X-Internal-Auth-TS")), strings.TrimSpace(r.Header.Get("X-User-ID"))
	stamp, err := strconv.ParseInt(ts, 10, 64)
	if err != nil || user == "" {
		return false
	}
	when := time.UnixMilli(stamp)
	if time.Since(when) > 5*time.Minute || when.Sub(time.Now()) > 5*time.Minute {
		return false
	}
	payload := strings.Join([]string{ts, user, r.Header.Get("X-User-Role"), r.Header.Get("X-User-Full-Name"), r.Header.Get("X-Totp-Verified")}, ".")
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(payload))
	expected := mac.Sum(nil)
	provided, err := hex.DecodeString(r.Header.Get("X-Internal-Auth"))
	return err == nil && len(provided) == len(expected) && subtle.ConstantTimeCompare(provided, expected) == 1
}
