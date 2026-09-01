package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"tembus/auth-service/internal/domain"
	"tembus/auth-service/internal/middleware"
)

type appleAuthServiceIface interface {
	StartAppleAuth(context.Context, *domain.GoogleAuthStartRequest) (*domain.GoogleAuthStartResponse, error)
	CompleteAppleAuth(context.Context, *domain.GoogleAuthCompleteRequest) (*domain.GoogleAuthCompleteResponse, error)
}

// AppleAuthHandler exposes the Apple counterpart to the existing Google
// customer OAuth endpoints. OTP continuation remains on the shared customer
// OTP endpoints because transactions carry their provider type server-side.
type AppleAuthHandler struct {
	svc   appleAuthServiceIface
	abuse *middleware.AuthAbuseProtector
}

func NewAppleAuthHandler(svc appleAuthServiceIface, abuse ...*middleware.AuthAbuseProtector) *AppleAuthHandler {
	var protector *middleware.AuthAbuseProtector
	if len(abuse) > 0 {
		protector = abuse[0]
	}
	return &AppleAuthHandler{svc: svc, abuse: protector}
}

func (h *AppleAuthHandler) StartAppleAuth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed")
		return
	}
	var req domain.GoogleAuthStartRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request_body", "Invalid request body")
		return
	}
	req.Platform = sanitizePlatform(req.Platform)
	if req.Platform == "" {
		req.Platform = "web"
	}
	if h.abuse != nil {
		ip := middleware.ClientIP(r)
		if abuseErr := h.abuse.AssertAllowed(r.Context(), middleware.ScopeCustomerOTPSend, ip, ip); abuseErr != nil {
			w.Header().Set("Retry-After", "60")
			writeJSONError(w, abuseErr.StatusCode, abuseErr.Code, "Terlalu banyak permintaan. Silakan tunggu sebentar.")
			return
		}
	}
	req.IPAddress = r.Header.Get("X-Forwarded-For")
	if req.IPAddress == "" {
		req.IPAddress = r.RemoteAddr
	}
	resp, err := h.svc.StartAppleAuth(r.Context(), &req)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, "apple_auth_unavailable", "Login dengan Apple belum tersedia.")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *AppleAuthHandler) CompleteAppleAuth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed")
		return
	}
	var req domain.GoogleAuthCompleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request_body", "Invalid request body")
		return
	}
	if strings.TrimSpace(req.IDToken) == "" {
		writeJSONError(w, http.StatusBadRequest, "missing_id_token", "id_token is required")
		return
	}
	if strings.TrimSpace(req.DeviceID) == "" {
		writeJSONError(w, http.StatusBadRequest, "missing_device_id", "device_id is required")
		return
	}
	req.Platform = sanitizePlatform(req.Platform)
	if h.abuse != nil {
		ip := middleware.ClientIP(r)
		if abuseErr := h.abuse.AssertAllowed(r.Context(), middleware.ScopeCustomerPasswordLogin, ip, ip); abuseErr != nil {
			w.Header().Set("Retry-After", "60")
			writeJSONError(w, abuseErr.StatusCode, abuseErr.Code, "Terlalu banyak permintaan. Silakan tunggu sebentar.")
			return
		}
	}
	req.IPAddress = r.Header.Get("X-Forwarded-For")
	if req.IPAddress == "" {
		req.IPAddress = r.RemoteAddr
	}
	resp, err := h.svc.CompleteAppleAuth(r.Context(), &req)
	if err != nil {
		log.Printf("CompleteAppleAuth error: %v", err)
		writeJSONError(w, http.StatusUnauthorized, "auth_failed", "Login tidak dapat diproses. Silakan coba lagi.")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}
