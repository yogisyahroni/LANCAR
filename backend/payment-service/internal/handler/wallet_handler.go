package handler

import (
	"encoding/json"
	"net/http"
	"tembus/payment-service/internal/domain"
	"tembus/payment-service/internal/middleware"

	"github.com/google/uuid"
)

type WalletHandler struct {
	svc domain.WalletService
}

func NewWalletHandler(svc domain.WalletService) *WalletHandler {
	return &WalletHandler{svc: svc}
}

// parseUserID validates and parses the X-User-ID header set by the API Gateway
// after JWT verification. It returns (uuid, correlationID, ok).
//
// Fix S2-PS-01: Eliminates the silent uuid.Parse() discard that produced uuid.Nil
// when the header was missing or malformed, allowing financial mutations on a
// ghost wallet with a zero UUID. Now every handler fails-closed on bad identity.
func (h *WalletHandler) parseUserID(w http.ResponseWriter, r *http.Request) (uuid.UUID, string, bool) {
	correlationID := middleware.GetCorrelationID(r.Context())
	userIDStr := r.Header.Get("X-User-ID") // Set by API Gateway after JWT validation

	if userIDStr == "" {
		middleware.LogJSON("warn", "wallet_missing_user_id", map[string]interface{}{
			"correlation_id": correlationID,
			"path":           r.URL.Path,
			"method":         r.Method,
		})
		h.respondError(w, "Unauthorized", http.StatusUnauthorized)
		return uuid.Nil, correlationID, false
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil || userID == uuid.Nil {
		middleware.LogJSON("warn", "wallet_invalid_user_id", map[string]interface{}{
			"correlation_id": correlationID,
			"path":           r.URL.Path,
		})
		h.respondError(w, "Invalid User ID", http.StatusBadRequest)
		return uuid.Nil, correlationID, false
	}

	return userID, correlationID, true
}

// safeError logs the real error internally and returns a safe generic message
// to the caller — preventing database errors and internal stack traces from
// leaking to clients.
//
// Fix S2-PS-02: Replaces all err.Error() responses throughout wallet_handler.
func (h *WalletHandler) safeError(w http.ResponseWriter, r *http.Request, err error, correlationID string, operation string) {
	middleware.LogJSON("error", "wallet_operation_failed", map[string]interface{}{
		"correlation_id": correlationID,
		"operation":      operation,
		"path":           r.URL.Path,
		"error":          err.Error(), // logged only — not sent to client
	})
	h.respondError(w, "Terjadi kesalahan. Silakan coba lagi.", http.StatusInternalServerError)
}

func (h *WalletHandler) GetBalance(w http.ResponseWriter, r *http.Request) {
	userID, correlationID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}

	wallet, err := h.svc.GetBalance(r.Context(), userID)
	if err != nil {
		h.safeError(w, r, err, correlationID, "get_balance")
		return
	}

	h.respondJSON(w, wallet, http.StatusOK)
}

func (h *WalletHandler) TopUp(w http.ResponseWriter, r *http.Request) {
	userID, correlationID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}

	var req struct {
		Amount float64 `json:"amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate amount is positive — zero or negative amounts must never reach
	// the service layer as they could corrupt wallet ledgers
	if req.Amount <= 0 {
		h.respondError(w, "Jumlah top-up harus lebih dari nol", http.StatusBadRequest)
		return
	}

	snapToken, err := h.svc.CreateTopUp(r.Context(), userID, req.Amount)
	if err != nil {
		h.safeError(w, r, err, correlationID, "create_top_up")
		return
	}

	h.respondJSON(w, map[string]string{"snap_token": snapToken}, http.StatusOK)
}

func (h *WalletHandler) Deposit(w http.ResponseWriter, r *http.Request) {
	userID, correlationID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}

	var req struct {
		Amount      float64 `json:"amount"`
		ReferenceID string  `json:"reference_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Amount <= 0 {
		h.respondError(w, "Amount must be positive", http.StatusBadRequest)
		return
	}

	if req.ReferenceID == "" {
		h.respondError(w, "reference_id wajib diisi", http.StatusBadRequest)
		return
	}

	err := h.svc.Deposit(r.Context(), userID, req.Amount, req.ReferenceID)
	if err != nil {
		h.safeError(w, r, err, correlationID, "deposit")
		return
	}

	h.respondJSON(w, map[string]string{"message": "Deposit successful"}, http.StatusOK)
}

func (h *WalletHandler) Withdraw(w http.ResponseWriter, r *http.Request) {
	userID, correlationID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}

	userRole := r.Header.Get("X-User-Role")
	if userRole == "" {
		h.respondError(w, "Unauthorized: role missing", http.StatusUnauthorized)
		return
	}

	var req struct {
		Amount      float64        `json:"amount"`
		BankDetails map[string]any `json:"bank_details"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Amount <= 0 {
		h.respondError(w, "Jumlah withdraw harus lebih dari nol", http.StatusBadRequest)
		return
	}

	err := h.svc.Withdraw(r.Context(), userID, userRole, req.Amount, req.BankDetails)
	if err != nil {
		h.safeError(w, r, err, correlationID, "withdraw")
		return
	}

	h.respondJSON(w, map[string]string{"message": "Withdrawal request submitted"}, http.StatusAccepted)
}

func (h *WalletHandler) respondJSON(w http.ResponseWriter, data any, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (h *WalletHandler) respondError(w http.ResponseWriter, message string, status int) {
	h.respondJSON(w, map[string]string{"error": message}, status)
}
