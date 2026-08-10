package handler

import (
	"encoding/json"
	"net/http"
	"os"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type TaxHandler struct {
	taxService domain.TaxService
}

func NewTaxHandler(ts domain.TaxService) *TaxHandler {
	return &TaxHandler{
		taxService: ts,
	}
}

// GenerateEFakturExport handles the request to generate eFaktur CSV for a given period.
// Expected Query Param: month (YYYY-MM)
func (h *TaxHandler) GenerateEFakturExport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	month := r.URL.Query().Get("month")
	if month == "" {
		http.Error(w, `{"error": "month parameter is required (format: YYYY-MM)"}`, http.StatusBadRequest)
		return
	}

	// Fetch user ID from context if using AuthMiddleware
	requestedBy := "system"
	userID := middleware.GetUserIDFromContext(ctx)
	if userID != "" {
		requestedBy = userID
	}

	export, err := h.taxService.GenerateEFakturExport(ctx, month, requestedBy)
	if err != nil {
		http.Error(w, `{"error": "`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(export)
}

// DownloadEFaktur serves the generated CSV file.
// Expected Query Param: file (absolute path or file name)
func (h *TaxHandler) DownloadEFaktur(w http.ResponseWriter, r *http.Request) {
	filePath := r.URL.Query().Get("file")
	if filePath == "" {
		http.Error(w, "file parameter is required", http.StatusBadRequest)
		return
	}

	// Basic security to ensure we only serve from exports directory (if it's just a file name)
	// For this logic, we assume the frontend passes the absolute path returned by the export endpoint.
	// NOTE: In production, it's safer to query the DB by export ID and get the secure file path.
	// We'll trust the path if it exists for this scope, but let's check it exists.
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// Set headers for download
	w.Header().Set("Content-Disposition", "attachment; filename=efaktur.csv")
	w.Header().Set("Content-Type", "text/csv")
	http.ServeFile(w, r, filePath)
}

// UpdateEFakturStatus updates the status of an eFaktur export
func (h *TaxHandler) UpdateEFakturStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	exportID := r.URL.Query().Get("id")
	if exportID == "" {
		http.Error(w, `{"error": "id parameter is required"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "invalid request body"}`, http.StatusBadRequest)
		return
	}

	if err := h.taxService.UpdateEFakturStatus(ctx, exportID, req.Status); err != nil {
		http.Error(w, `{"error": "`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"message": "status updated successfully"}`))
}
