package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type PaymentHandler struct {
	paymentService domain.PaymentService
}

func NewPaymentHandler(ps domain.PaymentService) *PaymentHandler {
	return &PaymentHandler{
		paymentService: ps,
	}
}

type CreatePaymentRequest struct {
	OrderID string `json:"order_id"`
}

func (h *PaymentHandler) CreatePayment(w http.ResponseWriter, r *http.Request) {
	var req CreatePaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request", middleware.GetCorrelationID(r.Context()))
		return
	}

	if req.OrderID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "order_id is required", middleware.GetCorrelationID(r.Context()))
		return
	}

	payment, err := h.paymentService.CreatePayment(r.Context(), req.OrderID)
	if err != nil {
		// In a real app we'd map domain errors to HTTP 400/404/500
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(payment)
}

func (h *PaymentHandler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	// Midtrans mengirim JSON body dengan field "signature_key" di dalamnya.
	// Signature diverifikasi di payment service menggunakan server key.

	payload, err := io.ReadAll(r.Body)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Failed to read payload", middleware.GetCorrelationID(r.Context()))
		return
	}
	defer r.Body.Close()

	// Ekstrak "signature_key" dari payload JSON Midtrans.
	var data map[string]interface{}
	if err := json.Unmarshal(payload, &data); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid JSON payload", middleware.GetCorrelationID(r.Context()))
		return
	}

	signature, _ := data["signature_key"].(string)

	if err := h.paymentService.HandleWebhook(r.Context(), payload, signature); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid webhook request", middleware.GetCorrelationID(r.Context()))
		return
	}

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("OK"))
}

func (h *PaymentHandler) GetPaymentStatus(w http.ResponseWriter, r *http.Request) {
	orderID := strings.TrimPrefix(r.URL.Path, "/api/v1/payments/")
	if orderID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "missing order id in path", middleware.GetCorrelationID(r.Context()))
		return
	}

	payment, err := h.paymentService.GetPaymentStatus(r.Context(), orderID)
	if err != nil {
		if err == domain.ErrNotFound {
			middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Payment not found", middleware.GetCorrelationID(r.Context()))
			return
		}
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(payment)
}
