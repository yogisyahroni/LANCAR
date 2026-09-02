package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

func (h *OrderHandler) QuoteFoodOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}
	if h.foodQuoteSvc == nil {
		userSafeError(w, r, fmt.Errorf("food quote service not wired"), http.StatusServiceUnavailable)
		return
	}
	req, ok := middleware.GetValidatedData(r.Context()).(*domain.CreateFoodOrderRequest)
	if !ok || req == nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to retrieve validated request", middleware.GetCorrelationID(r.Context()))
		return
	}
	quote, err := h.foodQuoteSvc.QuoteFood(r.Context(), userID, *req)
	if err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(quote)
}

// Auto-generated split of OrderHandler methods (god-file refactor).
func (h *OrderHandler) CreateFoodOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	req, ok := middleware.GetValidatedData(r.Context()).(*domain.CreateFoodOrderRequest)
	if !ok || req == nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to retrieve validated request", correlationID)
		return
	}

	order, err := h.orderSvc.CreateFoodOrder(r.Context(), userID, *req)
	if err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(order)
}

func (h *OrderHandler) ListFoodMerchants(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	lat, errLat := strconv.ParseFloat(r.URL.Query().Get("lat"), 64)
	lng, errLng := strconv.ParseFloat(r.URL.Query().Get("lng"), 64)
	if errLat != nil || errLng != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_LOCATION", "lat/lng wajib dikirim", correlationID)
		return
	}
	search := r.URL.Query().Get("search")
	// ADR 003: filter halal — all|"" (semua) | halal_certified | non_halal.
	halal := r.URL.Query().Get("halal")
	if halal != "halal_certified" && halal != "non_halal" {
		halal = ""
	}

	merchants, err := h.orderSvc.ListFoodMerchants(r.Context(), lat, lng, search, halal)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"merchants": merchants})
}

func (h *OrderHandler) GetFoodMerchantDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	merchantID := r.PathValue("id")
	if merchantID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_ID", "merchant id wajib dikirim", correlationID)
		return
	}

	merchant, err := h.orderSvc.GetFoodMerchantDetail(r.Context(), merchantID)
	if err != nil {
		userSafeError(w, r, err, http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"merchant": merchant})
}

func (h *OrderHandler) AddFavoriteMerchant(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}
	merchantID := r.PathValue("id")
	if merchantID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_ID", "merchant id wajib dikirim", correlationID)
		return
	}

	err := h.orderSvc.AddFavoriteMerchant(r.Context(), userID, merchantID)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

func (h *OrderHandler) RemoveFavoriteMerchant(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}
	merchantID := r.PathValue("id")
	if merchantID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_ID", "merchant id wajib dikirim", correlationID)
		return
	}

	err := h.orderSvc.RemoveFavoriteMerchant(r.Context(), userID, merchantID)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

func (h *OrderHandler) ListFavoriteMerchants(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	merchants, err := h.orderSvc.ListFavoriteMerchants(r.Context(), userID)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"merchants": merchants})
}

func (h *OrderHandler) CheckIsFavoriteMerchant(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}
	merchantID := r.PathValue("id")
	if merchantID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_ID", "merchant id wajib dikirim", correlationID)
		return
	}

	isFav, err := h.orderSvc.CheckIsFavoriteMerchant(r.Context(), userID, merchantID)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"is_favorite": isFav})
}
