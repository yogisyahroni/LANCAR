package handler

import (
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"strings"
	"tembus/order-service/internal/domain"
)

type PaymentLinkHandler struct {
	svc        domain.PaymentLinkService
	configRepo domain.ConfigRepository
}

func NewPaymentLinkHandler(svc domain.PaymentLinkService, configRepo domain.ConfigRepository) *PaymentLinkHandler {
	return &PaymentLinkHandler{svc: svc, configRepo: configRepo}
}

func (h *PaymentLinkHandler) CreateLink(w http.ResponseWriter, r *http.Request) {
	// In a real app, merchantID comes from JWT auth context.
	// For now, let's assume it's in the header or we parse it.
	merchantID := r.Header.Get("X-User-ID")
	if merchantID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req domain.CreatePaymentLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Basic validation
	if req.ItemName == "" || req.DropoffAddress == "" || req.ItemImageURL == "" {
		http.Error(w, "Missing required fields", http.StatusBadRequest)
		return
	}

	link, err := h.svc.CreateLink(r.Context(), merchantID, req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    link,
	})
}

func (h *PaymentLinkHandler) GetLink(w http.ResponseWriter, r *http.Request) {
	// Extract ID from URL path, e.g. /api/v1/payment-links/{id}
	parts := strings.Split(r.URL.Path, "/")
	id := parts[len(parts)-1]

	if id == "" || id == "payment-links" {
		http.Error(w, "Missing link ID", http.StatusBadRequest)
		return
	}

	link, err := h.svc.GetLink(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    link,
	})
}

func (h *PaymentLinkHandler) ListLinks(w http.ResponseWriter, r *http.Request) {
	merchantID := r.Header.Get("X-User-ID")
	if merchantID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit, _ := strconv.Atoi(limitStr)
	if limit <= 0 {
		limit = 10
	}
	offset, _ := strconv.Atoi(offsetStr)

	links, err := h.svc.ListLinks(r.Context(), merchantID, limit, offset)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    links,
	})
}

func (h *PaymentLinkHandler) CheckoutLink(w http.ResponseWriter, r *http.Request) {
	// Extract ID from URL path, e.g. /api/v1/payment-links/{id}/checkout
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 2 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}
	id := parts[len(parts)-2]

	if id == "" {
		http.Error(w, "Missing link ID", http.StatusBadRequest)
		return
	}

	resp, err := h.svc.CheckoutLink(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    resp,
	})
}

func (h *PaymentLinkHandler) HandleRequest(w http.ResponseWriter, r *http.Request) {
	// Simple routing for /api/v1/payment-links based on Method and Path
	if r.Method == http.MethodPost {
		if strings.HasSuffix(r.URL.Path, "/checkout") {
			h.CheckoutLink(w, r)
		} else {
			h.CreateLink(w, r)
		}
		return
	}

	if r.Method == http.MethodGet {
		if strings.HasSuffix(r.URL.Path, "/payment-links") || strings.HasSuffix(r.URL.Path, "/payment-links/") {
			h.ListLinks(w, r)
		} else {
			h.GetLink(w, r)
		}
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func (h *PaymentLinkHandler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	// Midtrans webhook sends JSON body. We simulate standard payload reading.
	var data map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
		return
	}

	orderID, _ := data["order_id"].(string)
	transactionStatus, _ := data["transaction_status"].(string)
	statusCode, _ := data["status_code"].(string)
	grossAmount, _ := data["gross_amount"].(string)
	signatureKey, _ := data["signature_key"].(string)

	if orderID == "" || transactionStatus == "" || signatureKey == "" {
		http.Error(w, "Missing required fields", http.StatusBadRequest)
		return
	}

	serverKey := h.configRepo.GetStringConfig(r.Context(), "midtrans_server_key", os.Getenv("MIDTRANS_SERVER_KEY"))
	
	// Validate signature
	// SHA512(order_id + status_code + gross_amount + server_key)
	hash := sha512.New()
	hash.Write([]byte(orderID + statusCode + grossAmount + serverKey))
	expectedSignature := hex.EncodeToString(hash.Sum(nil))

	if signatureKey != expectedSignature {
		http.Error(w, "Invalid signature", http.StatusUnauthorized)
		return
	}

	// Route to service
	if err := h.svc.HandleWebhook(r.Context(), orderID, transactionStatus); err != nil {
		// Log error, but usually webhooks should return 200 to acknowledge receipt
		// unless we want Midtrans to retry. We'll return 400 for bad requests for now.
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func (h *PaymentLinkHandler) CheckTariff(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	provider := r.URL.Query().Get("provider")
	if provider == "" {
		http.Error(w, "provider parameter is required", http.StatusBadRequest)
		return
	}

	origin := r.URL.Query().Get("origin_code")
	dest := r.URL.Query().Get("destination_code")
	
	weightStr := r.URL.Query().Get("weight_kg")
	weight, _ := strconv.ParseFloat(weightStr, 64)
	if weight <= 0 {
		weight = 1.0 // default 1kg
	}

	resp, err := h.svc.CheckTariff(r.Context(), provider, origin, dest, weight)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    resp,
	})
}
