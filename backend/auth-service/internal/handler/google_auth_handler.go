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

// googleAuthServiceIface is the interface the handler expects.
// This allows testing with mock implementations.
type googleAuthServiceIface interface {
	StartGoogleAuth(ctx context.Context, req *domain.GoogleAuthStartRequest) (*domain.GoogleAuthStartResponse, error)
	CompleteGoogleAuth(ctx context.Context, req *domain.GoogleAuthCompleteRequest) (*domain.GoogleAuthCompleteResponse, error)
	SendCustomerOTP(ctx context.Context, req *domain.CustomerOTPSendRequest) (*domain.CustomerOTPSendResponse, error)
	VerifyCustomerOTP(ctx context.Context, req *domain.CustomerOTPVerifyRequest, deviceInfoJSON []byte) (*domain.CustomerOTPVerifyResponse, error)
	HandleZenzivaWebhook(ctx context.Context, payload []byte, signature, timestamp string) error
}

// GoogleAuthHandler handles the customer Google auth endpoints.
type GoogleAuthHandler struct {
	svc   googleAuthServiceIface
	abuse *middleware.AuthAbuseProtector
}

// NewGoogleAuthHandler creates a new GoogleAuthHandler.
func NewGoogleAuthHandler(svc googleAuthServiceIface, abuse ...*middleware.AuthAbuseProtector) *GoogleAuthHandler {
	var abuseProtector *middleware.AuthAbuseProtector
	if len(abuse) > 0 {
		abuseProtector = abuse[0]
	}
	return &GoogleAuthHandler{svc: svc, abuse: abuseProtector}
}

// ─────────────────────────────────────────────
// POST /api/v1/auth/customer/google/start
// ─────────────────────────────────────────────

// StartGoogleAuth creates an auth transaction and returns the OAuth start parameters.
func (h *GoogleAuthHandler) StartGoogleAuth(w http.ResponseWriter, r *http.Request) {
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

	clientIP := middleware.ClientIP(r)
	if h.abuse != nil {
		if abuseErr := h.abuse.AssertAllowed(r.Context(), middleware.ScopeCustomerOTPSend, clientIP, clientIP); abuseErr != nil {
			w.Header().Set("Retry-After", "60")
			writeJSONError(w, abuseErr.StatusCode, abuseErr.Code, "Terlalu banyak permintaan. Silakan tunggu sebentar.")
			return
		}
	}

	ipAddress := r.Header.Get("X-Forwarded-For")
	if ipAddress == "" {
		ipAddress = r.RemoteAddr
	}
	req.IPAddress = ipAddress

	resp, err := h.svc.StartGoogleAuth(r.Context(), &req)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, "google_auth_unavailable", "Login dengan Google belum tersedia.")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

// ─────────────────────────────────────────────
// POST /api/v1/auth/customer/google/complete
// ─────────────────────────────────────────────

// CompleteGoogleAuth processes a Google ID token and determines auth outcome.
func (h *GoogleAuthHandler) CompleteGoogleAuth(w http.ResponseWriter, r *http.Request) {
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

	clientIP := middleware.ClientIP(r)
	if h.abuse != nil {
		if abuseErr := h.abuse.AssertAllowed(r.Context(), middleware.ScopeCustomerPasswordLogin, clientIP, clientIP); abuseErr != nil {
			w.Header().Set("Retry-After", "60")
			writeJSONError(w, abuseErr.StatusCode, abuseErr.Code, "Terlalu banyak permintaan. Silakan tunggu sebentar.")
			return
		}
	}

	ipAddress := r.Header.Get("X-Forwarded-For")
	if ipAddress == "" {
		ipAddress = r.RemoteAddr
	}
	req.IPAddress = ipAddress

	resp, err := h.svc.CompleteGoogleAuth(r.Context(), &req)
	if err != nil {
		log.Printf("CompleteGoogleAuth error: %v", err)
		// Anti-enumeration: always return the same generic message on failure
		writeJSONError(w, http.StatusUnauthorized, "auth_failed", "Login tidak dapat diproses. Silakan coba lagi.")
		return
	}

	// Return 200 for all non-error statuses (including requires_phone, requires_step_up_otp)
	writeJSON(w, http.StatusOK, resp)
}

// ─────────────────────────────────────────────
// POST /api/v1/auth/customer/google/link
// ─────────────────────────────────────────────

// LinkGoogleAccount allows an authenticated customer to link their Google account.
func (h *GoogleAuthHandler) LinkGoogleAccount(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed")
		return
	}

	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
		return
	}

	var req struct {
		IDToken  string `json:"id_token"`
		DeviceID string `json:"device_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request_body", "Invalid request body")
		return
	}
	if strings.TrimSpace(req.IDToken) == "" {
		writeJSONError(w, http.StatusBadRequest, "missing_id_token", "id_token is required")
		return
	}

	// Create a complete request that will resolve to link_google flow
	completeReq := &domain.GoogleAuthCompleteRequest{
		Platform: "web",
		IDToken:  req.IDToken,
		DeviceID: req.DeviceID,
	}

	ipAddress := r.Header.Get("X-Forwarded-For")
	if ipAddress == "" {
		ipAddress = r.RemoteAddr
	}
	completeReq.IPAddress = ipAddress

	resp, err := h.svc.CompleteGoogleAuth(r.Context(), completeReq)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "link_failed", "Tidak dapat menghubungkan akun Google. Silakan coba lagi.")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

// ─────────────────────────────────────────────
// POST /api/v1/auth/customer/otp/send
// ─────────────────────────────────────────────

// SendCustomerOTP sends an OTP to the customer's phone number.
func (h *GoogleAuthHandler) SendCustomerOTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed")
		return
	}

	var req domain.CustomerOTPSendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request_body", "Invalid request body")
		return
	}

	if strings.TrimSpace(req.TransactionID) == "" {
		writeJSONError(w, http.StatusBadRequest, "missing_transaction_id", "transaction_id is required")
		return
	}
	if strings.TrimSpace(req.PhoneNumber) == "" {
		writeJSONError(w, http.StatusBadRequest, "missing_phone_number", "phone_number is required")
		return
	}

	// Rate limit OTP send
	clientIP := middleware.ClientIP(r)
	if h.abuse != nil {
		if abuseErr := h.abuse.AssertAllowed(r.Context(), middleware.ScopeCustomerOTPSend, req.PhoneNumber, clientIP); abuseErr != nil {
			w.Header().Set("Retry-After", "60")
			writeJSONError(w, abuseErr.StatusCode, abuseErr.Code, "Terlalu banyak permintaan. Silakan tunggu sebentar.")
			return
		}
	}

	resp, err := h.svc.SendCustomerOTP(r.Context(), &req)
	if err != nil {
		// Never expose provider errors to the customer
		writeJSONError(w, http.StatusServiceUnavailable, "otp_send_failed", "Kode belum dapat dikirim. Coba lagi beberapa saat.")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

// ─────────────────────────────────────────────
// POST /api/v1/auth/customer/otp/verify
// ─────────────────────────────────────────────

// VerifyCustomerOTP verifies the OTP code and returns session tokens on success.
func (h *GoogleAuthHandler) VerifyCustomerOTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed")
		return
	}

	var req domain.CustomerOTPVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request_body", "Invalid request body")
		return
	}

	if strings.TrimSpace(req.TransactionID) == "" {
		writeJSONError(w, http.StatusBadRequest, "missing_transaction_id", "transaction_id is required")
		return
	}
	if strings.TrimSpace(req.ChallengeID) == "" {
		writeJSONError(w, http.StatusBadRequest, "missing_challenge_id", "challenge_id is required")
		return
	}
	if strings.TrimSpace(req.OTPCode) == "" {
		writeJSONError(w, http.StatusBadRequest, "missing_otp_code", "otp_code is required")
		return
	}
	if strings.TrimSpace(req.DeviceID) == "" {
		writeJSONError(w, http.StatusBadRequest, "missing_device_id", "device_id is required")
		return
	}

	// Rate limit OTP verify
	clientIP := middleware.ClientIP(r)
	if h.abuse != nil {
		if abuseErr := h.abuse.AssertAllowed(r.Context(), middleware.ScopeCustomerOTPVerify, req.DeviceID, clientIP); abuseErr != nil {
			w.Header().Set("Retry-After", "60")
			writeJSONError(w, abuseErr.StatusCode, abuseErr.Code, "Terlalu banyak percobaan. Silakan tunggu sebentar.")
			return
		}
	}

	// Device info — empty object if not provided
	deviceInfoJSON := []byte(`{}`)

	resp, err := h.svc.VerifyCustomerOTP(r.Context(), &req, deviceInfoJSON)
	if err != nil {
		if h.abuse != nil {
			h.abuse.RecordFailure(r.Context(), middleware.ScopeCustomerOTPVerify, req.DeviceID, clientIP, "invalid_otp")
		}
		// S-AS-02 FIX: Log internal error detail server-side, never expose to client.
		// err.Error() can contain timestamps, transaction IDs, or database details.
		log.Printf(`{"level":"warn","event":"otp_verify_failed","reason":%q}`,
			middleware.RedactString(err.Error()))
		writeJSONError(w, http.StatusUnauthorized, "otp_invalid",
			"Kode OTP tidak valid atau sudah kedaluwarsa.")
		return
	}

	if h.abuse != nil {
		h.abuse.RecordSuccess(r.Context(), middleware.ScopeCustomerOTPVerify, req.DeviceID)
	}
	writeJSON(w, http.StatusOK, resp)
}

// ─────────────────────────────────────────────
// POST /api/v1/auth/providers/zenziva/webhook
// ─────────────────────────────────────────────

// HandleZenzivaWebhook processes delivery status updates from Zenziva.
func (h *GoogleAuthHandler) HandleZenzivaWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed")
		return
	}

	// Read body for signature verification
	r.Body = http.MaxBytesReader(w, r.Body, 16384)
	payload := make([]byte, 0, 4096)
	buf := make([]byte, 4096)
	for {
		n, err := r.Body.Read(buf)
		if n > 0 {
			payload = append(payload, buf[:n]...)
		}
		if err != nil {
			break
		}
	}

	signature := r.Header.Get("X-Zenziva-Signature")
	timestamp := r.Header.Get("X-Zenziva-Timestamp")

	if err := h.svc.HandleZenzivaWebhook(r.Context(), payload, signature, timestamp); err != nil {
		// Log internally but return 200 to prevent Zenziva from retrying endlessly
		// The error is logged by the service layer
		writeJSON(w, http.StatusOK, map[string]string{"status": "ignored"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ─────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────

// sanitizePlatform validates and normalizes the platform field.
func sanitizePlatform(platform string) string {
	switch strings.ToLower(strings.TrimSpace(platform)) {
	case "web":
		return "web"
	case "android_customer", "android":
		return "android_customer"
	default:
		return "web"
	}
}

// writeJSON writes a JSON response with the given status code.
func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// writeJSONError writes a structured JSON error response.
func writeJSONError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{
		"error":   code,
		"message": message,
	})
}
