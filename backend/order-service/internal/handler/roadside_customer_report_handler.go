package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

// RoadsideCustomerReportHandler exposes the immutable completion evidence to
// the customer that owns the order. Ownership is checked through the
// adjustment service before the report is loaded.
type RoadsideCustomerReportHandler struct {
	reportService     domain.ServiceReportService
	adjustmentService domain.ServiceAdjustmentService
}

func NewRoadsideCustomerReportHandler(
	reportService domain.ServiceReportService,
	adjustmentService domain.ServiceAdjustmentService,
) *RoadsideCustomerReportHandler {
	return &RoadsideCustomerReportHandler{
		reportService:     reportService,
		adjustmentService: adjustmentService,
	}
}

func (h *RoadsideCustomerReportHandler) GetTambalBanFinalReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	if middleware.GetRoleFromContext(r.Context()) != "customer" {
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya customer pemilik order yang dapat melihat laporan akhir", middleware.GetCorrelationID(r.Context()))
		return
	}

	orderID := strings.TrimSpace(r.URL.Query().Get("order_id"))
	customerID := strings.TrimSpace(middleware.GetUserIDFromContext(r.Context()))
	if orderID == "" || customerID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "order_id wajib", middleware.GetCorrelationID(r.Context()))
		return
	}

	// ListForCustomer performs an ownership check even when no adjustment exists.
	adjustments, err := h.adjustmentService.ListForCustomer(r.Context(), orderID, customerID)
	if err != nil {
		if errors.Is(err, domain.ErrServiceAdjustmentForbidden) {
			middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Order bukan milik customer ini", middleware.GetCorrelationID(r.Context()))
			return
		}
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Gagal memverifikasi pemilik order", middleware.GetCorrelationID(r.Context()))
		return
	}

	report, err := h.reportService.GetTambalBanReport(r.Context(), orderID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			middleware.WriteError(w, http.StatusNotFound, "ERR_FINAL_REPORT_NOT_READY", "Laporan akhir belum tersedia", middleware.GetCorrelationID(r.Context()))
			return
		}
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Gagal memuat laporan akhir", middleware.GetCorrelationID(r.Context()))
		return
	}

	var latestApproved *domain.ServiceAdjustment
	for i := range adjustments {
		if adjustments[i].Status == domain.ServiceAdjustmentStatusApproved {
			copyValue := adjustments[i]
			latestApproved = &copyValue
			break
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"report":              report,
		"approved_adjustment": latestApproved,
	})
}
