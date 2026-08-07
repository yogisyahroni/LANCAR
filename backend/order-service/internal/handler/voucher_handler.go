package handler

import (
	"encoding/json"
	"net/http"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

// VoucherHandler — FB-078: redeem voucher customer di checkout.
type VoucherHandler struct {
	voucherSvc domain.VoucherService
}

func NewVoucherHandler(svc domain.VoucherService) *VoucherHandler {
	return &VoucherHandler{voucherSvc: svc}
}

// ValidateVoucher — POST /api/v1/vouchers/validate (customer).
// Preview sebelum checkout: cek kode + hitung diskon tanpa apply.
// Body: { "code": "HEMAT10", "base_idr": 25000, "model": "p2p" }
// Response: { valid, voucher_id, code, name, discount_idr, error? }
func (h *VoucherHandler) ValidateVoucher(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}

	var req struct {
		Code    string `json:"code"`
		BaseIDR int64  `json:"base_idr"`
		Model   string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid JSON payload", middleware.GetCorrelationID(r.Context()))
		return
	}
	if req.Code == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_CODE", "code wajib diisi", middleware.GetCorrelationID(r.Context()))
		return
	}
	if req.BaseIDR <= 0 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BASE", "base_idr harus > 0", middleware.GetCorrelationID(r.Context()))
		return
	}

	res, err := h.voucherSvc.Validate(r.Context(), req.Code, userID, req.BaseIDR, req.Model)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_VOUCHER", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, map[string]any{
		"valid":       res.Valid,
		"voucher_id":  res.VoucherID,
		"code":        res.Code,
		"name":        res.Name,
		"discount_idr": res.DiscountIDR,
		"error":       res.Error,
	})
}
