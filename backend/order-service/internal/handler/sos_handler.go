package handler

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type SosHandler struct {
	sosSvc domain.SosService
}

func NewSosHandler(svc domain.SosService) *SosHandler {
	return &SosHandler{sosSvc: svc}
}

func (h *SosHandler) TriggerSOS(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	var req domain.SosTriggerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid JSON payload", middleware.GetCorrelationID(r.Context()))
		return
	}

	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}

	u, err := uuid.Parse(userID)
	if err != nil {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Invalid user ID", middleware.GetCorrelationID(r.Context()))
		return
	}
	req.VictimID = u

	incidentID, err := h.sosSvc.TriggerSOS(r.Context(), req)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, map[string]interface{}{
		"incident_id": incidentID,
		"status":      "broadcasted",
	})
}

func (h *SosHandler) AcceptSOS(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	var req domain.SosAcceptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid JSON payload", middleware.GetCorrelationID(r.Context()))
		return
	}

	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}

	u, err := uuid.Parse(userID)
	if err != nil {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Invalid user ID", middleware.GetCorrelationID(r.Context()))
		return
	}
	req.HelperID = u

	incident, err := h.sosSvc.AcceptSOS(r.Context(), req)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, map[string]interface{}{
		"incident": incident,
		"status":   "accepted",
	})
}

func (h *SosHandler) SubmitHelperReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	var req domain.SosSubmitReportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid JSON payload", middleware.GetCorrelationID(r.Context()))
		return
	}

	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}

	u, err := uuid.Parse(userID)
	if err != nil {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Invalid user ID", middleware.GetCorrelationID(r.Context()))
		return
	}
	req.HelperID = u

	if err := h.sosSvc.SubmitHelperReport(r.Context(), req); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, map[string]interface{}{
		"status": "report_submitted",
	})
}

func (h *SosHandler) ReportTamper(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	var req domain.SosTamperRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid JSON payload", middleware.GetCorrelationID(r.Context()))
		return
	}

	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}

	u, err := uuid.Parse(userID)
	if err != nil {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Invalid user ID", middleware.GetCorrelationID(r.Context()))
		return
	}
	req.VictimID = u

	if err := h.sosSvc.MarkAsTampered(r.Context(), req); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, map[string]interface{}{
		"status": "tamper_reported",
	})
}

func (h *SosHandler) ArriveAtSOS(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	var req domain.SosArriveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid JSON payload", middleware.GetCorrelationID(r.Context()))
		return
	}

	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}

	u, err := uuid.Parse(userID)
	if err != nil {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Invalid user ID", middleware.GetCorrelationID(r.Context()))
		return
	}
	req.HelperID = u

	if err := h.sosSvc.ArriveAtSOS(r.Context(), req); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, map[string]interface{}{
		"status": "arrived_and_resolved",
	})
}
