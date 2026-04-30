package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"lancar/order-service/internal/domain"
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
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.meetingPointService.CreateMeetingPoint(r.Context(), &mp); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(mp)
}

func (h *AdminHandler) UpdateMeetingPoint(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/v1/admin/meeting-points/")

	var mp domain.MeetingPoint
	if err := json.NewDecoder(r.Body).Decode(&mp); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	mp.ID = id

	if err := h.meetingPointService.UpdateMeetingPoint(r.Context(), &mp); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(mp)
}

func (h *AdminHandler) DeleteMeetingPoint(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/v1/admin/meeting-points/")

	if err := h.meetingPointService.DeleteMeetingPoint(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminHandler) GetMeetingPointAnalytics(w http.ResponseWriter, r *http.Request) {
	analytics, err := h.meetingPointService.GetAnalytics(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(analytics)
}

func (h *AdminHandler) GetPricingConfig(w http.ResponseWriter, r *http.Request) {
	config, err := h.pricingService.GetConfig(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(config)
}

func (h *AdminHandler) UpdatePricingConfig(w http.ResponseWriter, r *http.Request) {
	var config domain.PricingConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.pricingService.UpdateConfig(r.Context(), &config); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(config)
}

func (h *AdminHandler) SimulatePrice(w http.ResponseWriter, r *http.Request) {
	var req domain.PricingEstimateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	res, err := h.pricingService.SimulatePrice(r.Context(), &req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(res)
}
