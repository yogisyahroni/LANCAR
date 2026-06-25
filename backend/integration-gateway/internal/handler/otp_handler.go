package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"tembus/integration-gateway/internal/domain"
)

type OTPHandler struct {
	provider domain.OTPProvider
}

func NewOTPHandler(provider domain.OTPProvider) *OTPHandler {
	return &OTPHandler{
		provider: provider,
	}
}

type OTPRequest struct {
	To      string `json:"to"`
	Message string `json:"message"`
}

type OTPResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

func (h *OTPHandler) SendWA(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req OTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.To == "" || req.Message == "" {
		http.Error(w, "Fields 'to' and 'message' are required", http.StatusBadRequest)
		return
	}

	err := h.provider.SendWA(r.Context(), req.To, req.Message)
	if err != nil {
		log.Printf("[integration-gateway] SendWA Error: %v", err)
		h.respondJSON(w, http.StatusBadGateway, OTPResponse{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	h.respondJSON(w, http.StatusOK, OTPResponse{
		Success: true,
		Message: "WA sent successfully",
	})
}

func (h *OTPHandler) SendSMS(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req OTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.To == "" || req.Message == "" {
		http.Error(w, "Fields 'to' and 'message' are required", http.StatusBadRequest)
		return
	}

	err := h.provider.SendSMS(r.Context(), req.To, req.Message)
	if err != nil {
		log.Printf("[integration-gateway] SendSMS Error: %v", err)
		h.respondJSON(w, http.StatusBadGateway, OTPResponse{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	h.respondJSON(w, http.StatusOK, OTPResponse{
		Success: true,
		Message: "SMS sent successfully",
	})
}

func (h *OTPHandler) respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
