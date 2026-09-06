package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type RoadsideSettlementHandler struct {
	service domain.RoadsideSettlementService
}

func NewRoadsideSettlementHandler(service domain.RoadsideSettlementService) *RoadsideSettlementHandler {
	return &RoadsideSettlementHandler{service: service}
}

// Calculate accepts only order_id. Every financial input is loaded from the
// canonical order/quote snapshot by the service; caller-provided amounts are
// deliberately not part of this contract.
func (h *RoadsideSettlementHandler) Calculate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	var req struct {
		OrderID string `json:"order_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.OrderID) == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "order_id wajib", middleware.GetCorrelationID(r.Context()))
		return
	}

	result, err := h.service.Calculate(
		r.Context(),
		strings.TrimSpace(req.OrderID),
		middleware.GetUserIDFromContext(r.Context()),
		middleware.GetRoleFromContext(r.Context()),
	)
	if err != nil {
		status, code, message := http.StatusBadRequest, "ERR_ROADSIDE_SETTLEMENT", "Settlement belum dapat dihitung"
		switch {
		case errors.Is(err, domain.ErrForbidden):
			status, code, message = http.StatusForbidden, "ERR_FORBIDDEN", "Order bukan tugas kurir ini"
		case errors.Is(err, domain.ErrRoadsideSettlementNotFound):
			status, code, message = http.StatusNotFound, "ERR_NOT_FOUND", "Order Tambal Ban tidak ditemukan"
		case errors.Is(err, domain.ErrRoadsideSettlementNotDelivered):
			status, code, message = http.StatusConflict, "ERR_SETTLEMENT_NOT_DELIVERED", "Settlement hanya tersedia setelah layanan selesai"
		case errors.Is(err, domain.ErrRoadsideSettlementProofRequired):
			status, code, message = http.StatusConflict, "PROOF_REQUIRED", "Bukti sebelum, sesudah, dan laporan akhir wajib lengkap sebelum settlement"
		}
		middleware.WriteError(w, status, code, message, middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}
