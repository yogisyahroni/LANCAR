package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"tembus/order-service/internal/experiment"
	"tembus/order-service/internal/middleware"
)

type ExperimentHandler struct {
	service *experiment.Service
}

func NewExperimentHandler(service *experiment.Service) *ExperimentHandler {
	return &ExperimentHandler{service: service}
}

type assignmentRequest struct {
	SubjectType    string            `json:"subject_type,omitempty"`
	MarketCode     string            `json:"market_code,omitempty"`
	CityCode       string            `json:"city_code,omitempty"`
	AppVersion     string            `json:"app_version,omitempty"`
	ServiceCode    string            `json:"service_code,omitempty"`
	UserCohort     string            `json:"user_cohort,omitempty"`
	SafeAttributes map[string]string `json:"safe_attributes,omitempty"`
}

type exposureRequest struct {
	AssignmentID string `json:"assignment_id"`
	ExposureType string `json:"exposure_type"`
	Surface      string `json:"surface"`
}

func (h *ExperimentHandler) Assign(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeExperimentError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		writeExperimentError(w, http.StatusUnauthorized, "authorization required")
		return
	}
	var request assignmentRequest
	if err := decodeExperimentJSON(w, r, &request); err != nil {
		return
	}
	subjectType, err := resolveSubjectType(request.SubjectType, middleware.GetRoleFromContext(r.Context()))
	if err != nil {
		writeExperimentError(w, http.StatusForbidden, err.Error())
		return
	}
	decision, err := h.service.Assign(r.Context(), r.PathValue("key"), subjectType, userID, experiment.EvaluationContext{
		MarketCode:  firstNonEmptyExperiment(request.MarketCode, r.Header.Get("X-Market-Code")),
		CityCode:    firstNonEmptyExperiment(request.CityCode, r.Header.Get("X-City-Code")),
		AppVersion:  firstNonEmptyExperiment(request.AppVersion, r.Header.Get("X-App-Version")),
		ServiceCode: firstNonEmptyExperiment(request.ServiceCode, r.Header.Get("X-Service-Code")),
		UserCohort:  request.UserCohort, SafeAttributes: request.SafeAttributes,
	})
	if err != nil {
		writeExperimentServiceError(w, err)
		return
	}
	writeExperimentJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": decision})
}

func (h *ExperimentHandler) RecordExposure(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeExperimentError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		writeExperimentError(w, http.StatusUnauthorized, "authorization required")
		return
	}
	var request exposureRequest
	if err := decodeExperimentJSON(w, r, &request); err != nil {
		return
	}
	subjectType, err := resolveSubjectType("", middleware.GetRoleFromContext(r.Context()))
	if err != nil {
		writeExperimentError(w, http.StatusForbidden, err.Error())
		return
	}
	market := r.Header.Get("X-Market-Code")
	exposure, err := h.service.Expose(r.Context(), r.PathValue("key"), subjectType, userID, request.AssignmentID, request.ExposureType, request.Surface, market)
	if err != nil {
		writeExperimentServiceError(w, err)
		return
	}
	status := http.StatusCreated
	if exposure.AlreadyRecorded {
		status = http.StatusOK
	}
	writeExperimentJSON(w, status, map[string]interface{}{"success": true, "data": exposure})
}

func resolveSubjectType(requested, role string) (string, error) {
	requested = strings.ToLower(strings.TrimSpace(requested))
	role = strings.ToLower(strings.TrimSpace(role))
	roleSubject := "customer"
	if role == "courier" || role == "driver" {
		roleSubject = "courier"
	}
	if requested != "" && requested != roleSubject {
		return "", errors.New("subject_type does not match authenticated role")
	}
	return roleSubject, nil
}

func firstNonEmptyExperiment(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func decodeExperimentJSON(w http.ResponseWriter, r *http.Request, target interface{}) error {
	r.Body = http.MaxBytesReader(w, r.Body, 32*1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeExperimentError(w, http.StatusBadRequest, "invalid experiment request")
		return err
	}
	return nil
}

func writeExperimentServiceError(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	switch {
	case errors.Is(err, experiment.ErrExperimentNotFound):
		status = http.StatusNotFound
	case errors.Is(err, experiment.ErrNamespaceConflict):
		status = http.StatusConflict
	case errors.Is(err, experiment.ErrAssignmentMismatch):
		status = http.StatusForbidden
	case errors.Is(err, experiment.ErrNotTreatment):
		status = http.StatusUnprocessableEntity
	case errors.Is(err, experiment.ErrExperimentDisabled):
		status = http.StatusGone
	case strings.Contains(err.Error(), "secret unavailable"), strings.Contains(err.Error(), "not configured"):
		status = http.StatusServiceUnavailable
	}
	writeExperimentError(w, status, err.Error())
}

func writeExperimentJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeExperimentError(w http.ResponseWriter, status int, message string) {
	writeExperimentJSON(w, status, map[string]interface{}{"success": false, "error": message})
}
