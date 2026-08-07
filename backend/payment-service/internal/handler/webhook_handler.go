package handler

import (
	"encoding/json"
	"net/http"
	"tembus/payment-service/internal/domain"
	"tembus/payment-service/internal/middleware"
	"log/slog"
)

type WebhookHandler struct {
	svc domain.WalletService
}

func NewWebhookHandler(svc domain.WalletService) *WebhookHandler {
	return &WebhookHandler{svc: svc}
}

// XenditWebhook receives payment notifications from Xendit.
// For FVA (Fixed Virtual Accounts) and Invoices, Xendit sends webhook when paid.
// For Disbursements, Xendit sends webhook when sent or failed.
func (h *WebhookHandler) XenditWebhook(w http.ResponseWriter, r *http.Request) {
	correlationID := middleware.GetCorrelationID(r.Context())
	
	// Ensure we verify the Xendit Webhook Verification Token
	// xenditToken := r.Header.Get("x-callback-token")
	// For production, you must verify this token against the one in Xendit dashboard
	
	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		h.respondError(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	slog.InfoContext(r.Context(), "xendit_webhook_received", "correlation_id", correlationID, "payload", payload)

	// Check if this is an Invoice paid webhook
	// Usually contains "external_id" and "status"
	if status, ok := payload["status"].(string); ok {
		if status == "PAID" { // Invoice paid
			if externalID, ok := payload["external_id"].(string); ok {
				// Let's call a new specialized method: HandleTopUpCallback
				err := h.svc.HandleTopUpCallback(r.Context(), externalID)
				if err != nil {
					slog.ErrorContext(r.Context(), "xendit_webhook_invoice_failed", "correlation_id", correlationID, "external_id", externalID, "error", err)
					h.respondError(w, "Failed to process deposit", http.StatusInternalServerError)
					return
				}
				
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte("SUCCESS"))
				return
			}
		} else if status == "COMPLETED" { // Disbursement completed
			if externalID, ok := payload["external_id"].(string); ok {
				// Handle disbursement completion
				err := h.svc.HandleDisbursementCallback(r.Context(), externalID, "COMPLETED")
				if err != nil {
					slog.ErrorContext(r.Context(), "xendit_webhook_disbursement_failed", "correlation_id", correlationID, "external_id", externalID, "error", err)
					h.respondError(w, "Failed to process disbursement", http.StatusInternalServerError)
					return
				}
				
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte("SUCCESS"))
				return
			}
		} else if status == "FAILED" { // Disbursement failed
			if externalID, ok := payload["external_id"].(string); ok {
				// Handle disbursement failure (refund to wallet)
				err := h.svc.HandleDisbursementCallback(r.Context(), externalID, "FAILED")
				if err != nil {
					slog.ErrorContext(r.Context(), "xendit_webhook_disbursement_failed", "correlation_id", correlationID, "external_id", externalID, "error", err)
					h.respondError(w, "Failed to process disbursement failure", http.StatusInternalServerError)
					return
				}
				
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte("SUCCESS"))
				return
			}
		}
	}

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("IGNORED"))
}

func (h *WebhookHandler) respondError(w http.ResponseWriter, message string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
