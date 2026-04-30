package handler

import (
	"encoding/json"
	"lancar/order-service/internal/domain"
	"lancar/order-service/internal/middleware"
	"net/http"
	"time"
)

type OrderHandler struct {
	pricingSvc domain.PricingService
	orderSvc   domain.OrderService
}

func NewOrderHandler(p domain.PricingService, o domain.OrderService) *OrderHandler {
	return &OrderHandler{
		pricingSvc: p,
		orderSvc:   o,
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

	resp, err := h.pricingSvc.Estimate(r.Context(), *req)
	if err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		if err == domain.ErrModelUnavailable {
			middleware.WriteError(w, http.StatusServiceUnavailable, "DELIVERY_MODEL_UNAVAILABLE", "Requested delivery models are currently unavailable", correlationID)
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
		if err == domain.ErrModelUnavailable {
			middleware.WriteError(w, http.StatusServiceUnavailable, "DELIVERY_MODEL_UNAVAILABLE", "The selected delivery model is no longer available", correlationID)
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
