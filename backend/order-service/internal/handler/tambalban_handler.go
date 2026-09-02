package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
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
	var (
		latStr  = r.URL.Query().Get("lat")
		lngStr  = r.URL.Query().Get("lng")
		subType = r.URL.Query().Get("service_sub_type")
		radius  = r.URL.Query().Get("radius_km")
	)
	lat, err := strconv.ParseFloat(latStr, 64)
	if err != nil || lat == 0 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "lat query param wajib (float)",
			middleware.GetCorrelationID(r.Context()))
		return
	}
	lng, err := strconv.ParseFloat(lngStr, 64)
	if err != nil || lng == 0 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "lng query param wajib (float)",
			middleware.GetCorrelationID(r.Context()))
		return
	}
	if subType == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_SERVICE", "service_sub_type query param wajib",
			middleware.GetCorrelationID(r.Context()))
		return
	}
	radiusKM := 5.0
	if radius != "" {
		if parsed, perr := strconv.ParseFloat(radius, 64); perr == nil && parsed > 0 {
			radiusKM = parsed
		}
	}

	// Validate service sub type
	if !service.IsTambalBanOrTowing(subType) {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_SERVICE", "Invalid service sub type",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	result, err := h.availabilitySvc.FindAvailableCouriers(r.Context(), subType, lat, lng, radiusKM)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to find couriers",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

// ============================================================
// POST /api/v1/order/{id}/settlement
// Calculate settlement for an order
// ============================================================
func (h *TambalBanHandler) CalculateSettlement(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OrderID             string  `json:"order_id"`
		ServiceCode         string  `json:"service_code"`
		GrossTotal          int64   `json:"gross_total"`
		DistanceKM          float64 `json:"distance_km"`
		BaseFare            int64   `json:"base_fare"`
		PerKMRate           int64   `json:"per_km_rate"`
		CourierServicePrice int64   `json:"courier_service_price"`
		TollCost            int64   `json:"toll_cost"`
		InsuranceFee        int64   `json:"insurance_fee"`
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
	_ = json.NewEncoder(w).Encode(result)
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
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "State updated", "new_state": req.State})
}

// ============================================================
// PUT /api/v1/courier/radius
// Update radius_max_km driver (dropdown 1-20 km) — FOOD-BIKE-029
// ============================================================
func (h *TambalBanHandler) UpdateRadius(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		RadiusKM int `json:"radius_km"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid request body",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	if err := h.availabilitySvc.UpdateRadius(r.Context(), userID, req.RadiusKM); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_RADIUS", err.Error(),
			middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Radius updated", "radius_km": fmt.Sprintf("%d", req.RadiusKM)})
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
	_ = json.NewEncoder(w).Encode(state)
}

// ============================================================
// GET /api/v1/customer/tambal-ban/home
// Home tambal ban: service products + nearby couriers + price range
// ============================================================
func (h *TambalBanHandler) GetTambalBanHome(w http.ResponseWriter, r *http.Request) {
	latStr := r.URL.Query().Get("lat")
	lngStr := r.URL.Query().Get("lng")
	lat, err := strconv.ParseFloat(latStr, 64)
	if err != nil || lat == 0 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "lat query param wajib (float)",
			middleware.GetCorrelationID(r.Context()))
		return
	}
	lng, err := strconv.ParseFloat(lngStr, 64)
	if err != nil || lng == 0 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "lng query param wajib (float)",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	result, err := h.availabilitySvc.GetTambalBanHome(r.Context(), lat, lng)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to load tambal ban home",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

// ============================================================
// GET /api/v1/customer/couriers/{id}?service_sub_type=
// Detail teknisi (rating, vehicle, radius, harga jasa)
// ============================================================
func (h *TambalBanHandler) GetCourierDetail(w http.ResponseWriter, r *http.Request) {
	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 4 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_PATH", "courier id wajib",
			middleware.GetCorrelationID(r.Context()))
		return
	}
	courierID := pathParts[len(pathParts)-1]
	subType := r.URL.Query().Get("service_sub_type")

	detail, err := h.availabilitySvc.GetCourierDetail(r.Context(), courierID, subType)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Courier tidak ditemukan",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(detail)
}

// ============================================================
// GET /api/v1/customer/tambal-ban/search?lat=&lng=&q=&service_sub_type=
// Search teknisi tambal ban by name
// ============================================================
func (h *TambalBanHandler) SearchTambalBanCouriers(w http.ResponseWriter, r *http.Request) {
	latStr := r.URL.Query().Get("lat")
	lngStr := r.URL.Query().Get("lng")
	q := r.URL.Query().Get("q")
	subType := r.URL.Query().Get("service_sub_type")

	lat, err := strconv.ParseFloat(latStr, 64)
	if err != nil || lat == 0 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "lat query param wajib (float)",
			middleware.GetCorrelationID(r.Context()))
		return
	}
	lng, err := strconv.ParseFloat(lngStr, 64)
	if err != nil || lng == 0 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "lng query param wajib (float)",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	result, err := h.availabilitySvc.SearchTambalBanCouriers(r.Context(), q, lat, lng, subType)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to search couriers",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
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
		if errors.Is(err, domain.ErrInvalidServiceReport) {
			middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_SERVICE_REPORT", err.Error(),
				middleware.GetCorrelationID(r.Context()))
			return
		}
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to create report",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(req)
}
