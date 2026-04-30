package handler

import (
	"encoding/json"
	"net/http"

	"lancar/order-service/internal/domain"
)

type RefundHandler struct {
	refundService domain.RefundService
}

func NewRefundHandler(refundService domain.RefundService) *RefundHandler {
	return &RefundHandler{
		refundService: refundService,
	}
}

// ProcessRefunds handles manual trigger of pending refunds
// POST /admin/refunds/process
func (h *RefundHandler) ProcessRefunds(w http.ResponseWriter, r *http.Request) {
	err := h.refundService.ProcessPendingRefunds(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Pending refunds processed successfully",
	})
}
