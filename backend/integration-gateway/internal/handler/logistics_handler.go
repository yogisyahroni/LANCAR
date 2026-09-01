package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"tembus/integration-gateway/internal/domain"
	"tembus/integration-gateway/internal/service"
)

type LogisticsHandler struct {
	orchestrator *service.LogisticsOrchestrator
}

func NewLogisticsHandler(orchestrator *service.LogisticsOrchestrator) *LogisticsHandler {
	return &LogisticsHandler{
		orchestrator: orchestrator,
	}
}

type ListLogisticsProvidersResponse struct {
	Success bool                        `json:"success"`
	Data    []domain.ProviderDescriptor `json:"data"`
}

func (h *LogisticsHandler) ListProviders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	h.respondJSON(w, http.StatusOK, ListLogisticsProvidersResponse{
		Success: true,
		Data:    h.orchestrator.ListProviders(),
	})
}

type CreateLogisticsOrderRequest struct {
	Provider        string  `json:"provider"` // "jne" or "jnt"
	ReferenceID     string  `json:"reference_id"`
	SenderName      string  `json:"sender_name"`
	SenderPhone     string  `json:"sender_phone"`
	SenderAddress   string  `json:"sender_address"`
	SenderCity      string  `json:"sender_city"`
	SenderZipCode   string  `json:"sender_zip_code"`
	ReceiverName    string  `json:"receiver_name"`
	ReceiverPhone   string  `json:"receiver_phone"`
	ReceiverAddress string  `json:"receiver_address"`
	ReceiverCity    string  `json:"receiver_city"`
	ReceiverZipCode string  `json:"receiver_zip_code"`
	OriginCode      string  `json:"origin_code"`
	DestinationCode string  `json:"destination_code"`
	WeightKG        float64 `json:"weight_kg"`
	ItemDescription string  `json:"item_description"`
	ItemValue       int64   `json:"item_value"`
	ServiceType     string  `json:"service_type"`
}

type CreateLogisticsOrderResponse struct {
	Success bool                           `json:"success"`
	Message string                         `json:"message,omitempty"`
	Data    *domain.LogisticsOrderResponse `json:"data,omitempty"`
}

func (h *LogisticsHandler) CreateOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req CreateLogisticsOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	provName := strings.ToLower(strings.TrimSpace(req.Provider))

	orderReq := domain.LogisticsOrderRequest{
		ReferenceID:     req.ReferenceID,
		SenderName:      req.SenderName,
		SenderPhone:     req.SenderPhone,
		SenderAddress:   req.SenderAddress,
		SenderCity:      req.SenderCity,
		SenderZipCode:   req.SenderZipCode,
		ReceiverName:    req.ReceiverName,
		ReceiverPhone:   req.ReceiverPhone,
		ReceiverAddress: req.ReceiverAddress,
		ReceiverCity:    req.ReceiverCity,
		ReceiverZipCode: req.ReceiverZipCode,
		OriginCode:      req.OriginCode,
		DestinationCode: req.DestinationCode,
		WeightKG:        req.WeightKG,
		ItemDescription: req.ItemDescription,
		ItemValue:       req.ItemValue,
		ServiceType:     req.ServiceType,
	}

	res, err := h.orchestrator.CreateOrder(r.Context(), provName, orderReq)
	if err != nil {
		log.Printf("[integration-gateway] CreateOrder Error (%s): %v", provName, err)
		h.respondJSON(w, http.StatusBadGateway, CreateLogisticsOrderResponse{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	h.respondJSON(w, http.StatusOK, CreateLogisticsOrderResponse{
		Success: true,
		Data:    res,
	})
}

func (h *LogisticsHandler) CheckTariff(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	provider := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("provider")))
	origin := r.URL.Query().Get("origin")
	destination := r.URL.Query().Get("destination")
	weightStr := r.URL.Query().Get("weight")

	if provider == "" || origin == "" || destination == "" || weightStr == "" {
		http.Error(w, "Missing required query parameters", http.StatusBadRequest)
		return
	}

	weightKG, _ := strconv.ParseFloat(weightStr, 64)
	if weightKG <= 0 {
		weightKG = 1.0
	}

	req := domain.TariffRequest{
		OriginCode:      origin,
		DestinationCode: destination,
		WeightKG:        weightKG,
		ServiceType:     "",
	}

	res, err := h.orchestrator.CheckTariff(r.Context(), provider, req)
	if err != nil {
		log.Printf("[integration-gateway] CheckTariff Error (%s): %v", provider, err)
		h.respondJSON(w, http.StatusBadGateway, map[string]interface{}{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    res,
	})
}

func (h *LogisticsHandler) respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
