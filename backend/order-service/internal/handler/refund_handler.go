package handler

import (
	"net/http"

	"tembus/order-service/internal/middleware"
)

type RefundHandler struct {
	refundService interface{}
}

func NewRefundHandler(refundService interface{}) *RefundHandler {
	return &RefundHandler{refundService: refundService}
}

func (h *RefundHandler) CreateRefund(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteError(w, http.StatusNotImplemented, "TODO_REFUND", "Refund flow is not wired yet.", middleware.GetCorrelationID(r.Context()))
}
