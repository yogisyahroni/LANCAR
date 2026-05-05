package handler

import (
	"encoding/json"
	"lancar/payment-service/internal/domain"
	"net/http"

	"github.com/google/uuid"
)

type WalletHandler struct {
	svc domain.WalletService
}

func NewWalletHandler(svc domain.WalletService) *WalletHandler {
	return &WalletHandler{svc: svc}
}

func (h *WalletHandler) GetBalance(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.Header.Get("X-User-ID") // Passed by API Gateway after JWT validation
	if userIDStr == "" {
		h.respondError(w, "Unauthorized: User ID missing", http.StatusUnauthorized)
		return
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		h.respondError(w, "Invalid User ID format", http.StatusBadRequest)
		return
	}

	wallet, err := h.svc.GetBalance(r.Context(), userID)
	if err != nil {
		h.respondError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	h.respondJSON(w, wallet, http.StatusOK)
}

func (h *WalletHandler) TopUp(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.Header.Get("X-User-ID")
	userID, _ := uuid.Parse(userIDStr)

	var req struct {
		Amount float64 `json:"amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	snapToken, err := h.svc.CreateTopUp(r.Context(), userID, req.Amount)
	if err != nil {
		h.respondError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	h.respondJSON(w, map[string]string{"snap_token": snapToken}, http.StatusOK)
}

func (h *WalletHandler) Deposit(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.Header.Get("X-User-ID")
	userID, _ := uuid.Parse(userIDStr)

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

	err := h.svc.Deposit(r.Context(), userID, req.Amount, req.ReferenceID)
	if err != nil {
		h.respondError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	h.respondJSON(w, map[string]string{"message": "Deposit successful"}, http.StatusOK)
}

func (h *WalletHandler) Withdraw(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.Header.Get("X-User-ID")
	userID, _ := uuid.Parse(userIDStr)

	var req struct {
		Amount      float64        `json:"amount"`
		BankDetails map[string]any `json:"bank_details"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	err := h.svc.Withdraw(r.Context(), userID, req.Amount, req.BankDetails)
	if err != nil {
		h.respondError(w, err.Error(), http.StatusInternalServerError)
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
