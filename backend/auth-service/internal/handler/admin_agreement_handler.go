package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"tembus/auth-service/internal/domain"
	"tembus/auth-service/internal/middleware"
	"tembus/auth-service/internal/service"
)

type AdminAgreementHandler struct {
	svc *service.AgreementService
}

func NewAdminAgreementHandler(svc *service.AgreementService) *AdminAgreementHandler {
	return &AdminAgreementHandler{svc: svc}
}

// ListAgreements — GET /api/v1/admin/agreements
func (h *AdminAgreementHandler) ListAgreements(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 20)
	offset := queryInt(r, "offset", 0)
	userType := r.URL.Query().Get("user_type")
	agreementType := r.URL.Query().Get("agreement_type")

	agreements, total, err := h.svc.ListAgreements(r.Context(), limit, offset, userType, agreementType)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL",
			"Gagal memuat daftar perjanjian", middleware.GetCorrelationID(r.Context()),
			middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	if agreements == nil {
		agreements = []*domain.Agreement{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    agreements,
		"total":   total,
		"limit":   limit,
		"offset":  offset,
	})
}

// GetAgreement — GET /api/v1/admin/agreements/{id}
func (h *AdminAgreementHandler) GetAgreement(w http.ResponseWriter, r *http.Request) {
	id := extractID(r.URL.Path, "/api/v1/admin/agreements/")
	if id == "" {
		http.Error(w, "ID perjanjian tidak valid", http.StatusBadRequest)
		return
	}

	agreement, err := h.svc.GetAgreement(r.Context(), id)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND",
			"Perjanjian tidak ditemukan", middleware.GetCorrelationID(r.Context()),
			middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    agreement,
	})
}

// DownloadAgreementPDF — GET /api/v1/admin/agreements/{id}/pdf
func (h *AdminAgreementHandler) DownloadAgreementPDF(w http.ResponseWriter, r *http.Request) {
	// Extract ID from path like /api/v1/admin/agreements/{id}/pdf
	path := r.URL.Path
	prefix := "/api/v1/admin/agreements/"
	id := strings.TrimPrefix(path, prefix)
	id = strings.TrimSuffix(id, "/pdf")
	if id == "" || strings.Contains(id, "/") {
		http.Error(w, "ID perjanjian tidak valid", http.StatusBadRequest)
		return
	}

	agreement, err := h.svc.GetAgreement(r.Context(), id)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND",
			"Perjanjian tidak ditemukan", middleware.GetCorrelationID(r.Context()),
			middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	uploadPath := os.Getenv("UPLOAD_PATH")
	if uploadPath == "" {
		uploadPath = "./uploads"
	}

	if agreement.PDFPath != nil {
		pdfFile, openErr := openAgreementPDFUnderRoot(uploadPath, *agreement.PDFPath)
		if openErr == nil {
			defer pdfFile.Close()
			if info, statErr := pdfFile.Stat(); statErr == nil {
				shortID := id
				if len(shortID) > 8 {
					shortID = shortID[:8]
				}
				filename := fmt.Sprintf("perjanjian_%s.pdf", shortID)
				w.Header().Set("Content-Type", "application/pdf")
				w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, filename))
				http.ServeContent(w, r, filename, info.ModTime(), pdfFile)
				return
			}
		}
	}

	// Fallback: serve HTML content as viewable document
	if agreement.HTMLContent != nil {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(fmt.Sprintf(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Perjanjian TEMBUS</title>
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; padding: 2cm; }
  @media print { body { padding: 0; } }
  .no-print { display: block; text-align: center; margin-bottom: 20px; }
  @media print { .no-print { display: none; } }
</style></head><body>
<div class="no-print">
  <button onclick="window.print()" style="padding:10px 20px;font-size:14px;cursor:pointer;">
    🖨️ Cetak / Simpan PDF
  </button>
</div>
%s
</body></html>`, *agreement.HTMLContent)))
		return
	}

	http.Error(w, "Dokumen tidak tersedia", http.StatusNotFound)
}

// AcceptAgreement — POST /api/v1/auth/agreements/accept
// Called by mobile apps after user checks "I agree" during registration
func (h *AdminAgreementHandler) AcceptAgreement(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		UserType      string `json:"user_type"`
		AgreementType string `json:"agreement_type"`
		FullName      string `json:"full_name"`
		Phone         string `json:"phone"`
		Email         string `json:"email"`
		NIK           string `json:"nik"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	ipAddress := r.RemoteAddr
	if idx := strings.LastIndex(ipAddress, ":"); idx >= 0 {
		ipAddress = ipAddress[:idx]
	}
	userAgent := r.UserAgent()

	var agreement *domain.Agreement
	var err error

	switch req.AgreementType {
	case "mitra_agreement":
		agreement, err = h.svc.CreateCourierAgreement(r.Context(), userID, req.FullName, req.NIK, req.Phone, req.Email, ipAddress, userAgent)
	case "customer_tos":
		agreement, err = h.svc.CreateCustomerAgreement(r.Context(), userID, req.FullName, req.Phone, req.Email, ipAddress, userAgent)
	default:
		http.Error(w, "Jenis perjanjian tidak valid", http.StatusBadRequest)
		return
	}

	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL",
			"Gagal membuat perjanjian: "+err.Error(), middleware.GetCorrelationID(r.Context()),
			middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"data": map[string]string{
			"id":        agreement.ID,
			"agreed_at": agreement.AgreedAt.Format("2006-01-02T15:04:05Z07:00"),
		},
	})
}

// UserAgreements — GET /api/v1/auth/agreements/mine
func (h *AdminAgreementHandler) UserAgreements(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	userType := r.URL.Query().Get("user_type")
	agreements, err := h.svc.GetAgreementsByUser(r.Context(), userID, userType)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL",
			"Gagal memuat perjanjian", middleware.GetCorrelationID(r.Context()),
			middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	if agreements == nil {
		agreements = []*domain.Agreement{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    agreements,
	})
}

func extractID(path, prefix string) string {
	if !strings.HasPrefix(path, prefix) {
		return ""
	}
	id := strings.TrimPrefix(path, prefix)
	if idx := strings.Index(id, "/"); idx >= 0 {
		id = id[:idx]
	}
	return id
}

func queryInt(r *http.Request, name string, defaultVal int) int {
	val := r.URL.Query().Get(name)
	if val == "" {
		return defaultVal
	}
	var n int
	_, _ = fmt.Sscanf(val, "%d", &n)
	if n <= 0 || n > 100 {
		return defaultVal
	}
	return n
}
