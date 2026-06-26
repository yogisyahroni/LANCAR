package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"tembus/integration-gateway/internal/domain"
	"tembus/integration-gateway/internal/provider"
)

type PaymentHandler struct {
}

func NewPaymentHandler() *PaymentHandler {
	return &PaymentHandler{}
}

func (h *PaymentHandler) CreateInvoice(w http.ResponseWriter, r *http.Request) {
	var req domain.InvoiceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	providerName := r.Header.Get("X-Payment-Provider")
	prov, _ := provider.GetPaymentProvider(providerName)

	resp, err := prov.CreateInvoice(r.Context(), req)
	if err != nil {
		log.Printf("[integration-gateway] CreateInvoice Error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *PaymentHandler) CreateDisbursement(w http.ResponseWriter, r *http.Request) {
	var req domain.DisbursementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	providerName := r.Header.Get("X-Payment-Provider")
	prov, _ := provider.GetPaymentProvider(providerName)

	resp, err := prov.CreateDisbursement(r.Context(), req)
	if err != nil {
		log.Printf("[integration-gateway] CreateDisbursement Error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
