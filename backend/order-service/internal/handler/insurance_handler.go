package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
	"tembus/order-service/internal/service"
)

type InsuranceHandler struct {
	insuranceSvc domain.InsuranceService
}

func NewInsuranceHandler(insuranceSvc domain.InsuranceService) *InsuranceHandler {
	return &InsuranceHandler{insuranceSvc: insuranceSvc}
}

type orderInsuranceClaimRequest struct {
	Reason        string   `json:"reason"`
	ClaimedAmount int      `json:"claimed_amount"`
	EvidenceURLs  []string `json:"evidence_urls"`
}

// HandleOrderClaim exposes the provider-neutral claim intake. It creates a
// real internal claim and marks the purchased cover as claimed atomically;
// external provider acknowledgement is deliberately represented by the
// nullable provider_claim_id field and is not fabricated here.
func (h *InsuranceHandler) HandleOrderClaim(w http.ResponseWriter, r *http.Request) {
	userID, err := uuid.Parse(r.Header.Get("X-User-ID"))
	if err != nil {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}

	orderPath := strings.TrimPrefix(r.URL.Path, "/api/v1/insurance/orders/")
	orderPath = strings.TrimSuffix(orderPath, "/claim")
	orderID, err := uuid.Parse(orderPath)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid order ID", middleware.GetCorrelationID(r.Context()))
		return
	}

	switch r.Method {
	case http.MethodGet:
		claim, getErr := h.insuranceSvc.GetOrderInsuranceClaim(r.Context(), orderID, userID)
		if getErr != nil {
			h.writeClaimError(w, getErr, r)
			return
		}
		middleware.WriteSuccess(w, http.StatusOK, claim)
	case http.MethodPost:
		var req orderInsuranceClaimRequest
		decoder := json.NewDecoder(r.Body)
		if err := decoder.Decode(&req); err != nil {
			middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid claim payload", middleware.GetCorrelationID(r.Context()))
			return
		}
		evidence, validationErr := service.ValidateInsuranceEvidenceURLs(req.EvidenceURLs)
		if validationErr != nil {
			middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", validationErr.Error(), middleware.GetCorrelationID(r.Context()))
			return
		}
		claim, submitErr := h.insuranceSvc.SubmitOrderInsuranceClaim(r.Context(), orderID, userID, req.Reason, req.ClaimedAmount, evidence)
		if submitErr != nil {
			h.writeClaimError(w, submitErr, r)
			return
		}
		middleware.WriteSuccess(w, http.StatusCreated, claim)
	default:
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
	}
}

func (h *InsuranceHandler) writeClaimError(w http.ResponseWriter, err error, r *http.Request) {
	status, code := http.StatusInternalServerError, "ERR_INSURANCE_CLAIM"
	switch {
	case errors.Is(err, domain.ErrOrderInsuranceNotFound):
		status, code = http.StatusNotFound, "ERR_ORDER_INSURANCE_NOT_FOUND"
	case errors.Is(err, domain.ErrInsuranceClaimNotFound):
		status, code = http.StatusNotFound, "ERR_INSURANCE_CLAIM_NOT_FOUND"
	case errors.Is(err, domain.ErrInsuranceClaimExists):
		status, code = http.StatusConflict, "ERR_INSURANCE_CLAIM_EXISTS"
	case errors.Is(err, domain.ErrInsuranceClaimInvalid):
		status, code = http.StatusBadRequest, "ERR_BAD_REQUEST"
	}
	middleware.WriteError(w, status, code, err.Error(), middleware.GetCorrelationID(r.Context()))
}

func (h *InsuranceHandler) EnrollBPJSTK(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	userIDStr := r.Header.Get("X-User-ID")
	if userIDStr == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}

	if _, err := uuid.Parse(userIDStr); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid user ID", middleware.GetCorrelationID(r.Context()))
		return
	}

	// Insurance provider (BPJSTK API adapter) belum terhubung.
	// Fitur ini akan aktif setelah integrasi dengan provider selesai.
	middleware.WriteError(w, http.StatusServiceUnavailable, "FEATURE_COMING_SOON",
		"Pendaftaran BPJSTK sedang dalam proses integrasi dengan penyedia layanan. Silakan coba lagi dalam waktu dekat.",
		middleware.GetCorrelationID(r.Context()))
}
