package handler

import (
	"encoding/json"
	"net/http"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
	"tembus/order-service/internal/service"
)

type TambalBanHandler struct {
	settlementSvc    domain.SettlementService
	availabilitySvc  domain.AvailabilityService
	vehicleValidator domain.VehicleValidator
	reportSvc        domain.ServiceReportService
}

func NewTambalBanHandler(
	settlementSvc domain.SettlementService,
	availabilitySvc domain.AvailabilityService,
	vehicleValidator domain.VehicleValidator,
	reportSvc domain.ServiceReportService,
) *TambalBanHandler {
	return &TambalBanHandler{
		settlementSvc:    settlementSvc,
		availabilitySvc:  availabilitySvc,
		vehicleValidator: vehicleValidator,
		reportSvc:        reportSvc,
	}
}

// ============================================================
// GET /api/v1/customer/nearby-couriers
// Find nearby couriers for a specific service
// ============================================================
func (h *TambalBanHandler) GetNearbyCouriers(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Lat            float64 `json:"lat"`
		Lng            float64 `json:"lng"`
		ServiceSubType string  `json:"service_sub_type"`
		RadiusKM       float64 `json:"radius_km"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid request body",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	if req.RadiusKM == 0 {
		req.RadiusKM = 5.0
	}

	// Validate service sub type
	if !service.IsTambalBanOrTowing(req.ServiceSubType) {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_SERVICE", "Invalid service sub type",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	result, err := h.availabilitySvc.FindAvailableCouriers(r.Context(), req.ServiceSubType, req.Lat, req.Lng, req.RadiusKM)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to find couriers",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// ============================================================
// POST /api/v1/order/{id}/settlement
// Calculate settlement for an order
// ============================================================
func (h *TambalBanHandler) CalculateSettlement(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OrderID              string  `json:"order_id"`
		ServiceCode          string  `json:"service_code"`
		GrossTotal           int64   `json:"gross_total"`
		DistanceKM           float64 `json:"distance_km"`
		BaseFare             int64   `json:"base_fare"`
		PerKMRate            int64   `json:"per_km_rate"`
		CourierServicePrice  int64   `json:"courier_service_price"`
		TollCost             int64   `json:"toll_cost"`
		InsuranceFee         int64   `json:"insurance_fee"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid request body",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	result, err := h.settlementSvc.CalculateSettlement(
		r.Context(),
		req.OrderID, req.ServiceCode,
		req.GrossTotal, req.DistanceKM, req.BaseFare, req.PerKMRate,
		req.CourierServicePrice, req.TollCost, req.InsuranceFee,
	)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_SETTLEMENT", err.Error(),
			middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// ============================================================
// PUT /api/v1/courier/availability-state
// Update courier availability state
// ============================================================
func (h *TambalBanHandler) UpdateAvailabilityState(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		State   string  `json:"state"`
		OrderID *string `json:"order_id,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid request body",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	err := h.availabilitySvc.UpdateCourierState(r.Context(), userID, req.State, req.OrderID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to update state",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "State updated", "new_state": req.State})
}

// ============================================================
// GET /api/v1/courier/availability-state
// Get courier availability state
// ============================================================
func (h *TambalBanHandler) GetAvailabilityState(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	state, err := h.availabilitySvc.GetCourierAvailability(r.Context(), userID)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Availability state not found",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(state)
}

// ============================================================
// POST /api/v1/courier/service-report/tambal-ban
// Create tambal ban service report
// ============================================================
func (h *TambalBanHandler) CreateTambalBanReport(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req domain.TambalBanReport
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid request body",
			middleware.GetCorrelationID(r.Context()))
		return
	}
	req.CourierID = userID

	err := h.reportSvc.CreateTambalBanReport(r.Context(), &req)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to create report",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(req)
}

// ============================================================
// POST /api/v1/courier/service-report/towing
// Create towing service report
// ============================================================
func (h *TambalBanHandler) CreateTowingReport(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req domain.TowingReport
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid request body",
			middleware.GetCorrelationID(r.Context()))
		return
	}
	req.CourierID = userID

	err := h.reportSvc.CreateTowingReport(r.Context(), &req)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to create report",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(req)
}
