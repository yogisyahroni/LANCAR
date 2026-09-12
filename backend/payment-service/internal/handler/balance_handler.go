package handler

import (
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"

	"github.com/google/uuid"

	"tembus/payment-service/internal/domain"
	"tembus/payment-service/internal/repository"
)

type BalanceHandler struct{ repo repository.BalanceRepository }

func NewBalanceHandler(repo repository.BalanceRepository) *BalanceHandler {
	return &BalanceHandler{repo: repo}
}

type balanceOperationRequest struct {
	AccountID      uuid.UUID               `json:"account_id"`
	EntryType      domain.BalanceEntryType `json:"entry_type"`
	AmountMinor    int64                   `json:"amount_minor"`
	SourceType     string                  `json:"source_type"`
	SourceID       string                  `json:"source_id"`
	IdempotencyKey string                  `json:"idempotency_key"`
	Metadata       map[string]any          `json:"metadata,omitempty"`
}

func (h *BalanceHandler) authorized(r *http.Request) bool {
	expected := strings.TrimSpace(os.Getenv("INTERNAL_PAYMENT_API_KEY"))
	provided := strings.TrimSpace(r.Header.Get("X-Internal-API-Key"))
	return expected != "" && provided != "" && len(expected) == len(provided) && subtle.ConstantTimeCompare([]byte(expected), []byte(provided)) == 1
}

func (h *BalanceHandler) Apply(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writePaymentIntentError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED")
		return
	}
	if !h.authorized(r) {
		writePaymentIntentError(w, http.StatusUnauthorized, "ERR_INTERNAL_UNAUTHORIZED")
		return
	}
	var req balanceOperationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.AccountID == uuid.Nil || req.AmountMinor <= 0 || req.SourceType == "" || req.SourceID == "" || req.IdempotencyKey == "" {
		writePaymentIntentError(w, http.StatusBadRequest, "ERR_INVALID_BALANCE_OPERATION")
		return
	}
	snapshot, duplicate, err := h.repo.Apply(r.Context(), req.AccountID, domain.BalanceOperation{
		EntryType: req.EntryType, AmountMinor: req.AmountMinor, SourceType: req.SourceType, SourceID: req.SourceID, IdempotencyKey: req.IdempotencyKey, Metadata: req.Metadata,
	})
	if errors.Is(err, domain.ErrBalanceInsufficient) || errors.Is(err, domain.ErrBalanceHeldInsufficient) {
		writePaymentIntentError(w, http.StatusConflict, "ERR_BALANCE_INSUFFICIENT")
		return
	}
	if errors.Is(err, domain.ErrBalanceIdempotencyReuse) {
		writePaymentIntentError(w, http.StatusConflict, "ERR_BALANCE_IDEMPOTENCY_REUSE")
		return
	}
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writePaymentIntentError(w, http.StatusNotFound, "ERR_BALANCE_ACCOUNT_NOT_FOUND")
			return
		}
		writePaymentIntentError(w, http.StatusUnprocessableEntity, "ERR_BALANCE_UNAVAILABLE")
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "duplicate": duplicate, "data": snapshot})
}
