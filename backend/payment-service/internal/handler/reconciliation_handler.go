package handler

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"os"
	"strings"

	"tembus/payment-service/internal/domain"
	"tembus/payment-service/internal/service"
)

type ReconciliationHandler struct {
	svc *service.ReconciliationService
}

func NewReconciliationHandler(svc *service.ReconciliationService) *ReconciliationHandler {
	return &ReconciliationHandler{svc: svc}
}

type reconciliationRequest struct {
	Internal   *domain.ReconciliationRecord `json:"internal"`
	Provider   *domain.ReconciliationRecord `json:"provider"`
	Settlement *domain.ReconciliationRecord `json:"settlement"`
}

func (h *ReconciliationHandler) authorized(r *http.Request) bool {
	expected := strings.TrimSpace(os.Getenv("INTERNAL_PAYMENT_API_KEY"))
	provided := strings.TrimSpace(r.Header.Get("X-Internal-API-Key"))
	return expected != "" && provided != "" && len(expected) == len(provided) && subtle.ConstantTimeCompare([]byte(expected), []byte(provided)) == 1
}

func (h *ReconciliationHandler) Reconcile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writePaymentIntentError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED")
		return
	}
	if !h.authorized(r) {
		writePaymentIntentError(w, http.StatusUnauthorized, "ERR_INTERNAL_UNAUTHORIZED")
		return
	}
	var req reconciliationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Internal == nil {
		writePaymentIntentError(w, http.StatusBadRequest, "ERR_INVALID_RECONCILIATION")
		return
	}
	exceptions, err := h.svc.Reconcile(r.Context(), req.Internal, req.Provider, req.Settlement)
	if err != nil {
		writePaymentIntentError(w, http.StatusUnprocessableEntity, "ERR_RECONCILIATION_UNAVAILABLE")
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success":      true,
		"reconciled":   len(exceptions) == 0,
		"exceptions":   exceptions,
		"batch_policy": "provider batch date/timezone are preserved as metadata; UTC transaction truth is not rewritten",
	})
}
