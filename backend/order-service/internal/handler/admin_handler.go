package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type AdminHandler struct {
	meetingPointService domain.MeetingPointService
	pricingService      domain.PricingService
}

func NewAdminHandler(mps domain.MeetingPointService, ps domain.PricingService) *AdminHandler {
	return &AdminHandler{
		meetingPointService: mps,
		pricingService:      ps,
	}
}

func (h *AdminHandler) CreateMeetingPoint(w http.ResponseWriter, r *http.Request) {
	var mp domain.MeetingPoint
	if err := json.NewDecoder(r.Body).Decode(&mp); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request", middleware.GetCorrelationID(r.Context()))
		return
	}

	if err := h.meetingPointService.CreateMeetingPoint(r.Context(), &mp); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()))
		return
	}

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(mp)
}

func (h *AdminHandler) UpdateMeetingPoint(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/v1/admin/meeting-points/")

	var mp domain.MeetingPoint
	if err := json.NewDecoder(r.Body).Decode(&mp); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request", middleware.GetCorrelationID(r.Context()))
		return
	}
	mp.ID = id

	if err := h.meetingPointService.UpdateMeetingPoint(r.Context(), &mp); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()))
		return
	}

	_ = json.NewEncoder(w).Encode(mp)
}

func (h *AdminHandler) DeleteMeetingPoint(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/v1/admin/meeting-points/")

	if err := h.meetingPointService.DeleteMeetingPoint(r.Context(), id); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminHandler) GetMeetingPointAnalytics(w http.ResponseWriter, r *http.Request) {
	analytics, err := h.meetingPointService.GetAnalytics(r.Context())
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()))
		return
	}

	_ = json.NewEncoder(w).Encode(analytics)
}

func (h *AdminHandler) GetPricingConfig(w http.ResponseWriter, r *http.Request) {
	config, err := h.pricingService.GetConfig(r.Context())
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()))
		return
	}

	_ = json.NewEncoder(w).Encode(config)
}

func (h *AdminHandler) UpdatePricingConfig(w http.ResponseWriter, r *http.Request) {
	var config domain.PricingConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request", middleware.GetCorrelationID(r.Context()))
		return
	}

	if err := h.pricingService.UpdateConfig(r.Context(), &config); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()))
		return
	}

	_ = json.NewEncoder(w).Encode(config)
}

func (h *AdminHandler) SimulatePrice(w http.ResponseWriter, r *http.Request) {
	var req domain.PricingEstimateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request", middleware.GetCorrelationID(r.Context()))
		return
	}

	res, err := h.pricingService.SimulatePrice(r.Context(), &req)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()))
		return
	}

	_ = json.NewEncoder(w).Encode(res)
}
