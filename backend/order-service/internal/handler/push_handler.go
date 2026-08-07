package handler

import (
	"encoding/json"
	"net/http"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

// PushHandler — endpoint internal untuk trigger push notification (FB-084).
// Dipanggil service lain (merchant-service) saat ada event yang perlu
// notifikasi ke user, di luar flow order-service.
type PushHandler struct {
	pushSvc domain.PushService
}

func NewPushHandler(pushSvc domain.PushService) *PushHandler {
	return &PushHandler{pushSvc: pushSvc}
}

// NotifyCustomerOrderCancelled — POST /api/v1/internal/push/order-cancelled
// Body: {order_id, message}
// Dipanggil merchant-service setelah RejectOrder: customer perlu tahu
// pesanannya dibatalkan merchant (FB-084). Fire-and-forget di sisi pemanggil;
// di sini return error kalau order tidak ditemukan / push gagal.
func (h *PushHandler) NotifyCustomerOrderCancelled(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	var req struct {
		OrderID string `json:"order_id"`
		Message string `json:"message"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	if req.OrderID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "order_id wajib diisi", middleware.GetCorrelationID(r.Context()))
		return
	}
	if req.Message == "" {
		req.Message = "Pesanan dibatalkan oleh merchant"
	}

	if err := h.pushSvc.NotifyCustomerOrderCancelled(r.Context(), req.OrderID, req.Message); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_PUSH_FAILED", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Push notification sent"})
}

// NotifyCustomerOrderUpdated — POST /api/v1/internal/push/order-updated
// Body: {order_id, message}
// Dipanggil merchant-service setelah EditOrderItems: customer perlu tahu
// item pesanannya diubah sebelum konfirmasi (FB-087).
func (h *PushHandler) NotifyCustomerOrderUpdated(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	var req struct {
		OrderID string `json:"order_id"`
		Message string `json:"message"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	if req.OrderID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "order_id wajib diisi", middleware.GetCorrelationID(r.Context()))
		return
	}
	if req.Message == "" {
		req.Message = "Pesanan Anda diubah oleh merchant"
	}

	if err := h.pushSvc.NotifyCustomerOrderUpdated(r.Context(), req.OrderID, req.Message); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_PUSH_FAILED", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Push notification sent"})
}
