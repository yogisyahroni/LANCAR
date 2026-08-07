package handler

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type RefundHandler struct {
	refundService domain.RefundService
}

func NewRefundHandler(refundService domain.RefundService) *RefundHandler {
	return &RefundHandler{refundService: refundService}
}

type createRefundRequest struct {
	OrderID string `json:"order_id"`
	Reason  string `json:"reason"`
	// FB-079: status order SEBELUM diubah ke cancelled — dipakai utk menghitung
	// refund window food (free vs kena biaya layanan) secara akurat.
	OriginalStatus string `json:"original_status,omitempty"`
}

// CreateItemRefund — endpoint internal refund partial per item food (FB-080).
// Request: {order_id, items:[{menu_item_id, quantity, reason}], include_delivery_fee}
// Dipanggil dari admin-service saat dispute food resolved memihak customer.
func (h *RefundHandler) CreateItemRefund(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	var req struct {
		OrderID            string                      `json:"order_id"`
		Items              []domain.ItemRefundRequest  `json:"items"`
		IncludeDeliveryFee bool                        `json:"include_delivery_fee"`
		Reason             string                      `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	if req.OrderID == "" || len(req.Items) == 0 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "order_id and items are required", middleware.GetCorrelationID(r.Context()))
		return
	}

	oid, err := uuid.Parse(req.OrderID)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid order ID format", middleware.GetCorrelationID(r.Context()))
		return
	}

	record, err := h.refundService.CalculateItemRefund(r.Context(), oid, req.Items, domain.RefundItemOptions{
		IncludeDeliveryFee: req.IncludeDeliveryFee,
	})
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_REFUND_FAILED", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "success",
		"message": "Item refund processed",
		"data":    record,
	})
}

func (h *RefundHandler) CreateRefund(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	var req createRefundRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	if req.OrderID != "" {
		oid, err := uuid.Parse(req.OrderID)
		if err != nil {
			middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid order ID format", middleware.GetCorrelationID(r.Context()))
			return
		}

		reason := req.Reason
		if reason == "" {
			reason = "Manual refund triggered by admin"
		}

		record, err := h.refundService.CalculateAndTriggerRefund(r.Context(), oid, reason, domain.RefundOptions{
			OriginalStatus: domain.OrderStatus(req.OriginalStatus),
		})
		if err != nil {
			middleware.WriteError(w, http.StatusInternalServerError, "ERR_REFUND_FAILED", err.Error(), middleware.GetCorrelationID(r.Context()))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "success",
			"message": "Refund processed successfully",
			"data":    record,
		})
		return
	}

	// Batch process pending refunds if no order_id specified
	if err := h.refundService.ProcessPendingRefunds(r.Context()); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_REFUND_FAILED", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "success",
		"message": "Pending refunds batch processed successfully",
	})
}
