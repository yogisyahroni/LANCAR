package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type RoadsideAftercareHandler struct {
	service domain.RoadsideAftercareService
}

func NewRoadsideAftercareHandler(service domain.RoadsideAftercareService) *RoadsideAftercareHandler {
	return &RoadsideAftercareHandler{service: service}
}

func (h *RoadsideAftercareHandler) SubmitClaim(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	if middleware.GetRoleFromContext(r.Context()) != "customer" {
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya customer pemilik order yang dapat mengajukan klaim layanan", middleware.GetCorrelationID(r.Context()))
		return
	}
	var req domain.SubmitRoadsideClaimRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid request body", middleware.GetCorrelationID(r.Context()))
		return
	}
	req.IdempotencyKey = roadsideAftercareIdempotencyKey(r)
	req.CorrelationID = middleware.GetCorrelationID(r.Context())
	result, err := h.service.SubmitClaim(r.Context(), &req, middleware.GetUserIDFromContext(r.Context()))
	if err != nil {
		writeRoadsideAftercareError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(result)
}

func (h *RoadsideAftercareHandler) SubmitRating(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	if middleware.GetRoleFromContext(r.Context()) != "customer" {
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya customer pemilik order yang dapat memberi rating teknisi", middleware.GetCorrelationID(r.Context()))
		return
	}
	var req domain.SubmitRoadsideRatingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid request body", middleware.GetCorrelationID(r.Context()))
		return
	}
	req.IdempotencyKey = roadsideAftercareIdempotencyKey(r)
	req.CorrelationID = middleware.GetCorrelationID(r.Context())
	result, err := h.service.SubmitRating(r.Context(), &req, middleware.GetUserIDFromContext(r.Context()))
	if err != nil {
		writeRoadsideAftercareError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(result)
}

func roadsideAftercareIdempotencyKey(r *http.Request) string {
	key := strings.TrimSpace(r.Header.Get("X-Idempotency-Key"))
	if key == "" {
		key = strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	}
	return key
}

func writeRoadsideAftercareError(w http.ResponseWriter, r *http.Request, err error) {
	status, code := http.StatusBadRequest, "ERR_INVALID_ROADSIDE_AFTERCARE"
	switch {
	case errors.Is(err, domain.ErrRoadsideAftercareForbidden):
		status, code = http.StatusForbidden, "ERR_ROADSIDE_AFTERCARE_FORBIDDEN"
	case errors.Is(err, domain.ErrRoadsideAftercareMissingProof):
		status, code = http.StatusConflict, "ERR_ROADSIDE_FINAL_PROOF_REQUIRED"
	case errors.Is(err, domain.ErrRoadsideAftercareConflict):
		status, code = http.StatusConflict, "ERR_ROADSIDE_AFTERCARE_CONFLICT"
	case errors.Is(err, domain.ErrRoadsideAftercareIdempotency):
		status, code = http.StatusConflict, "ERR_IDEMPOTENCY_CONFLICT"
	case errors.Is(err, domain.ErrInvalidRoadsideAftercare):
		status, code = http.StatusBadRequest, "ERR_INVALID_ROADSIDE_AFTERCARE"
	}
	middleware.WriteError(w, status, code, err.Error(), middleware.GetCorrelationID(r.Context()))
}
