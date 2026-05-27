package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
	"tembus/order-service/pkg/utils"
	"time"
)

type OrderHandler struct {
	pricingSvc      domain.PricingService
	orderSvc        domain.OrderService
	meetingPointSvc domain.MeetingPointService
}

func NewOrderHandler(p domain.PricingService, o domain.OrderService, m domain.MeetingPointService) *OrderHandler {
	return &OrderHandler{
		pricingSvc:      p,
		orderSvc:        o,
		meetingPointSvc: m,
	}
}

// Estimate godoc
// @Summary Estimate pricing
// @Description Get pricing estimate for an order without creating it
// @Tags pricing
// @Accept json
// @Produce json
// @Param request body domain.PricingEstimateRequest true "Pricing Estimate Request"
// @Success 200 {object} domain.PricingEstimateResponse
// @Router /pricing/estimate [post]
func (h *OrderHandler) Estimate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	req, ok := middleware.GetValidatedData(r.Context()).(*domain.PricingEstimateRequest)
	if !ok || req == nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to retrieve validated request", correlationID)
		return
	}

	resp, err := h.pricingSvc.EstimatePrice(r.Context(), req)
	if err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		if errors.Is(err, domain.ErrLocationNotCovered) {
			middleware.WriteError(w, http.StatusBadRequest, "ERR_LOCATION_NOT_COVERED", "Alamat pickup atau tujuan tidak tercover oleh layanan kami", correlationID)
			return
		}
		var modelErr *domain.ModelUnavailableError
		if errors.As(err, &modelErr) {
			middleware.WriteError(w, http.StatusServiceUnavailable, modelErr.MessageID, modelErr.UserMsg, correlationID)
			return
		}
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_PRICING", err.Error(), correlationID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// CreateOrder godoc
// @Summary Create a new order
// @Description Create a new delivery order
// @Tags orders
// @Accept json
// @Produce json
// @Security Bearer
// @Param request body domain.CreateOrderRequest true "Create Order Request"
// @Success 201 {object} domain.Order
// @Router /orders [post]
func (h *OrderHandler) CreateOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// userID comes from JWT middleware
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	req, ok := middleware.GetValidatedData(r.Context()).(*domain.CreateOrderRequest)
	if !ok || req == nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to retrieve validated request", correlationID)
		return
	}

	order, err := h.orderSvc.CreateOrder(r.Context(), userID, *req)
	if err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		var modelErr *domain.ModelUnavailableError
		if errors.As(err, &modelErr) {
			middleware.WriteError(w, http.StatusServiceUnavailable, modelErr.MessageID, modelErr.UserMsg, correlationID)
			return
		}
		if err == domain.ErrInvalidEstimate {
			middleware.WriteError(w, http.StatusBadRequest, "INVALID_ESTIMATE", "The pricing estimate has expired or is invalid", correlationID)
			return
		}
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_ORDER_CREATION", err.Error(), correlationID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(order)
}

// GetOrder godoc
// @Summary Get order details
// @Description Get full details of a specific order
// @Tags orders
// @Produce json
// @Security Bearer
// @Param id query string true "Order ID"
// @Success 200 {object} domain.Order
// @Router /orders/detail [get]
func (h *OrderHandler) GetOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Order ID is required", http.StatusBadRequest)
		return
	}

	order, err := h.orderSvc.GetOrder(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(order)
}

// ListOrders godoc
// @Summary List customer orders
// @Description Get a list of orders for the authenticated user
// @Tags orders
// @Produce json
// @Security Bearer
// @Success 200 {array} domain.Order
// @Router /orders [get]
func (h *OrderHandler) ListOrders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	orders, err := h.orderSvc.ListOrders(r.Context(), userID, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(orders)
}

// PollOrderUpdates godoc
// @Summary Poll for order status updates
// @Description Fallback mechanism for WebSocket failures
// @Tags orders
// @Produce json
// @Security Bearer
// @Param since query string false "ISO8601 timestamp"
// @Success 200 {array} domain.OrderEvent
// @Router /orders/poll [get]
func (h *OrderHandler) PollOrderUpdates(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sinceStr := r.URL.Query().Get("since")
	since := time.Now().Add(-1 * time.Minute) // Default to last minute
	if sinceStr != "" {
		if t, err := time.Parse(time.RFC3339, sinceStr); err == nil {
			since = t
		}
	}

	events, err := h.orderSvc.ListEvents(r.Context(), userID, since)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}

// SuggestMeetingPoints godoc
// @Summary Suggest meeting points
// @Description Suggest best meeting points for a route
// @Tags orders
// @Produce json
// @Param pickup_lat query number true "Pickup Latitude"
// @Param pickup_lng query number true "Pickup Longitude"
// @Param dropoff_lat query number true "Dropoff Latitude"
// @Param dropoff_lng query number true "Dropoff Longitude"
// @Success 200 {array} map[string]interface{}
// @Router /meeting-points/suggest [get]
func (h *OrderHandler) SuggestMeetingPoints(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	pickupLat := utils.ParseFloat(r.URL.Query().Get("pickup_lat"))
	pickupLng := utils.ParseFloat(r.URL.Query().Get("pickup_lng"))
	dropoffLat := utils.ParseFloat(r.URL.Query().Get("dropoff_lat"))
	dropoffLng := utils.ParseFloat(r.URL.Query().Get("dropoff_lng"))

	if pickupLat == 0 || pickupLng == 0 || dropoffLat == 0 || dropoffLng == 0 {
		http.Error(w, "Missing required coordinates", http.StatusBadRequest)
		return
	}

	suggestions, err := h.meetingPointSvc.SuggestMeetingPoint(r.Context(), pickupLat, pickupLng, dropoffLat, dropoffLng)
	if err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_MEETING_POINT", err.Error(), correlationID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(suggestions)
}

// AcceptOrder godoc
// @Summary Accept an order (Courier)
// @Description Accept a pending delivery order
// @Tags couriers
// @Accept json
// @Produce json
// @Security Bearer
// @Param id path string true "Order ID"
// @Success 200 {object} map[string]string
// @Router /couriers/orders/{id}/accept [post]
func (h *OrderHandler) AcceptOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	orderID := r.URL.Query().Get("id")
	if orderID == "" {
		http.Error(w, "Order ID is required", http.StatusBadRequest)
		return
	}

	courierID := middleware.GetUserIDFromContext(r.Context())
	if courierID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	err := h.orderSvc.AcceptOrder(r.Context(), orderID, courierID)
	if err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_ACCEPT_ORDER", err.Error(), correlationID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "accepted", "order_id": orderID})
}

// UpdateStatus godoc
// @Summary Update order status (Courier/Admin)
// @Description Update the status of an order
// @Tags orders
// @Accept json
// @Produce json
// @Security Bearer
// @Param id query string true "Order ID"
// @Param status query string true "New Status"
// @Success 200 {object} map[string]string
// @Router /orders/status [patch]
// UpdateStatusRequest represents the payload for status updates
type UpdateStatusRequest struct {
	OrderID string   `json:"id"`
	Status  string   `json:"status"`
	Length  *float64 `json:"length,omitempty"`
	Width   *float64 `json:"width,omitempty"`
	Height  *float64 `json:"height,omitempty"`
	Weight  *float64 `json:"weight,omitempty"`
	Notes   string   `json:"notes,omitempty"`
}

// UpdateStatus godoc
// @Summary Update order status (Courier/Admin)
// @Description Update the status of an order
// @Tags orders
// @Accept json
// @Produce json
// @Security Bearer
// @Param body body UpdateStatusRequest true "Update Status Request"
// @Router /orders/status [post]
func (h *OrderHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req UpdateStatusRequest
	var orderID string
	var status domain.OrderStatus

	// Check if it's a JSON body (as sent by Android)
	if r.Header.Get("Content-Type") == "application/json" {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		orderID = req.OrderID
		status = domain.OrderStatus(req.Status)
	} else {
		// Fallback to query params for compatibility
		orderID = r.URL.Query().Get("id")
		status = domain.OrderStatus(r.URL.Query().Get("status"))
	}

	if orderID == "" || status == "" {
		http.Error(w, "Order ID and status are required", http.StatusBadRequest)
		return
	}

	// Update dimensions if provided (Enterprise Volumetric Consistency)
	if req.Length != nil || req.Width != nil || req.Height != nil || req.Weight != nil {
		err := h.orderSvc.UpdateDimensions(r.Context(), orderID, req.Length, req.Width, req.Height, req.Weight)
		if err != nil {
			log.Printf("[OrderHandler] Warning: Failed to update dimensions for %s: %v", orderID, err)
		}
	}

	err := h.orderSvc.UpdateStatus(r.Context(), orderID, status)
	if err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_UPDATE_STATUS", err.Error(), correlationID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": string(status), "order_id": orderID})
}

// StartMatching triggers automated courier assignment for an order
func (h *OrderHandler) StartMatching(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Order ID is required", http.StatusBadRequest)
		return
	}

	err := h.orderSvc.StartMatching(r.Context(), id)
	if err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_START_MATCHING", err.Error(), correlationID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "searching", "order_id": id})
}

// ScanRequest represents the request payload for scanning a package
type ScanRequest struct {
	OrderID     string  `json:"order_id"`
	ScanType    string  `json:"scan_type"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	WarehouseID *string `json:"warehouse_id,omitempty"`
	PhotoURL    *string `json:"photo_url,omitempty"`
	BagNumber   *string `json:"bag_number,omitempty"`
}

// ScanPackage godoc
// @Summary Scan a package (Courier/Hub operator)
// @Description Record a new package scan (pickup, inbound, outbound, delivered etc)
// @Tags orders
// @Accept json
// @Produce json
// @Security Bearer
// @Param request body ScanRequest true "Scan Request Payload"
// @Success 200 {object} map[string]string
// @Router /orders/scan [post]
// @Router /orders/scan [post]
func (h *OrderHandler) ScanPackage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	scannedBy := middleware.GetUserIDFromContext(r.Context())
	if scannedBy == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req ScanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	if req.OrderID == "" || req.ScanType == "" {
		http.Error(w, "order_id and scan_type are required", http.StatusBadRequest)
		return
	}

	scan := &domain.PackageScan{
		OrderID:     req.OrderID,
		ScanType:    req.ScanType,
		Latitude:    req.Latitude,
		Longitude:   req.Longitude,
		WarehouseID: req.WarehouseID,
		PhotoURL:    req.PhotoURL,
		BagNumber:   req.BagNumber,
	}

	err := h.orderSvc.ScanPackage(r.Context(), scannedBy, scan)
	if err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_SCAN_PACKAGE", err.Error(), correlationID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "success",
		"scan_id":     scan.ID,
		"scan_type":   scan.ScanType,
		"order_id":    scan.OrderID,
		"recorded_at": scan.RecordedAt,
	})
}

// GetPackageScans godoc
// @Summary Get package scans history
// @Description Retrieve the full history of scans for an order
// @Tags orders
// @Produce json
// @Security Bearer
// @Param order_id query string true "Order ID"
// @Success 200 {array} domain.PackageScan
// @Router /orders/scans [get]
func (h *OrderHandler) GetPackageScans(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	orderID := r.URL.Query().Get("order_id")
	if orderID == "" {
		http.Error(w, "order_id is required", http.StatusBadRequest)
		return
	}

	scans, err := h.orderSvc.GetPackageScans(r.Context(), orderID)
	if err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_GET_SCANS", err.Error(), correlationID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(scans)
}

type CreateBagRequest struct {
	BagNumber              string  `json:"bag_number"`
	VehiclePlate           *string `json:"vehicle_plate,omitempty"`
	FlightNumber           *string `json:"flight_number,omitempty"`
	OriginWarehouseID      *string `json:"origin_warehouse_id,omitempty"`
	DestinationWarehouseID *string `json:"destination_warehouse_id,omitempty"`
}

func (h *OrderHandler) CreateConsolidationBag(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	createdBy := middleware.GetUserIDFromContext(r.Context())
	if createdBy == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req CreateBagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	bag := &domain.ConsolidationBag{
		BagNumber:              req.BagNumber,
		VehiclePlate:           req.VehiclePlate,
		FlightNumber:           req.FlightNumber,
		OriginWarehouseID:      req.OriginWarehouseID,
		DestinationWarehouseID: req.DestinationWarehouseID,
	}

	err := h.orderSvc.CreateConsolidationBag(r.Context(), createdBy, bag)
	if err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_CREATE_BAG", err.Error(), correlationID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(bag)
}

type OpenBagRequest struct {
	BagNumber string `json:"bag_number"`
}

func (h *OrderHandler) OpenConsolidationBag(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	unbaggedBy := middleware.GetUserIDFromContext(r.Context())
	if unbaggedBy == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req OpenBagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	err := h.orderSvc.OpenConsolidationBag(r.Context(), unbaggedBy, req.BagNumber)
	if err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_OPEN_BAG", err.Error(), correlationID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success", "bag_number": req.BagNumber, "message": "Bag opened successfully (Bag Out)"})
}

func (h *OrderHandler) GetConsolidationBag(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	bagNumber := r.URL.Query().Get("bag_number")
	if bagNumber == "" {
		http.Error(w, "bag_number is required", http.StatusBadRequest)
		return
	}

	bag, scans, err := h.orderSvc.GetConsolidationBag(r.Context(), bagNumber)
	if err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_GET_BAG", err.Error(), correlationID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"bag":   bag,
		"scans": scans,
	})
}

type AutoDetectRequest struct {
	OrderID     string `json:"order_id"`
	WarehouseID string `json:"warehouse_id"`
}

func (h *OrderHandler) AutoDetectScanType(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req AutoDetectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	scanType, err := h.orderSvc.AutoDetectScanType(r.Context(), req.OrderID, req.WarehouseID)
	if err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_AUTO_DETECT", err.Error(), correlationID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"order_id":  req.OrderID,
		"scan_type": scanType,
		"status":    "success",
	})
}
