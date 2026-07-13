package handler

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"tembus/order-service/internal/domain"
)

// DeliveryWebhookHandler menerima event DELIVERED dari integration-gateway.
// Endpoint ini HANYA boleh dipanggil oleh internal service (integration-gateway)
// menggunakan X-Internal-Api-Key header. Tidak boleh terekspos ke publik.
type DeliveryWebhookHandler struct {
	settlementSvc  domain.MerchantSettlementService
	internalAPIKey string
}

// NewDeliveryWebhookHandler membuat handler untuk delivery webhook internal.
func NewDeliveryWebhookHandler(settlementSvc domain.MerchantSettlementService) *DeliveryWebhookHandler {
	return &DeliveryWebhookHandler{
		settlementSvc:  settlementSvc,
		internalAPIKey: os.Getenv("INTERNAL_API_KEY"),
	}
}

// deliveryWebhookPayload adalah payload yang dikirim oleh integration-gateway
// setelah menerima dan memverifikasi webhook DELIVERED dari 3PL.
type deliveryWebhookPayload struct {
	AWBNumber   string `json:"awb_number"`
	Provider    string `json:"provider"`
	Status      string `json:"status"` // "DELIVERED", "IN_TRANSIT", dll
	PodURL      string `json:"pod_url,omitempty"`
	ConfirmedAt string `json:"confirmed_at,omitempty"` // RFC3339
	RawPayload  string `json:"raw_payload,omitempty"`
}

// HandleDeliveryEvent adalah endpoint POST /api/internal/delivery/webhook.
// Menerima event pengiriman dari integration-gateway dan memulai proses settlement
// jika status = "DELIVERED".
func (h *DeliveryWebhookHandler) HandleDeliveryEvent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// ─── SECURITY: Validasi internal API key ───────────────────────────────────
	// Endpoint ini tidak boleh dapat dipanggil dari luar (hanya integration-gateway).
	// Dalam production: tambahkan network policy di Kubernetes/Docker untuk
	// memastikan hanya pod integration-gateway yang bisa menjangkau endpoint ini.
	receivedKey := r.Header.Get("X-Internal-Api-Key")
	if h.internalAPIKey != "" && receivedKey != h.internalAPIKey {
		slog.WarnContext(r.Context(), "delivery_webhook: unauthorized attempt",
			"remote_addr", r.RemoteAddr)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// ─── Read & parse body ────────────────────────────────────────────────────
	body, err := io.ReadAll(io.LimitReader(r.Body, 64*1024)) // max 64KB
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var payload deliveryWebhookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		slog.ErrorContext(r.Context(), "delivery_webhook: invalid JSON payload", "error", err)
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// ─── Validasi field wajib ─────────────────────────────────────────────────
	if strings.TrimSpace(payload.AWBNumber) == "" {
		http.Error(w, "awb_number is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(payload.Status) == "" {
		http.Error(w, "status is required", http.StatusBadRequest)
		return
	}

	// ─── Hanya proses event DELIVERED ─────────────────────────────────────────
	normalizedStatus := strings.ToUpper(strings.TrimSpace(payload.Status))
	if normalizedStatus != "DELIVERED" {
		// Event lain (IN_TRANSIT, PICKED_UP, dll) — log dan return 200 tanpa proses
		slog.InfoContext(r.Context(), "delivery_webhook: non-delivery event received, skipping settlement",
			"awb_number", payload.AWBNumber, "status", payload.Status)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "accepted_non_delivery"})
		return
	}

	// ─── Parse waktu konfirmasi ───────────────────────────────────────────────
	confirmedAt := time.Now()
	if payload.ConfirmedAt != "" {
		if parsed, err := time.Parse(time.RFC3339, payload.ConfirmedAt); err == nil {
			confirmedAt = parsed
		}
	}

	// ─── Trigger settlement service ───────────────────────────────────────────
	req := domain.DeliveryConfirmedRequest{
		AWBNumber:   strings.TrimSpace(payload.AWBNumber),
		Provider:    strings.TrimSpace(payload.Provider),
		PodURL:      payload.PodURL,
		ConfirmedAt: confirmedAt,
		RawPayload:  string(body),
	}

	if err := h.settlementSvc.HandleDeliveryConfirmed(r.Context(), req); err != nil {
		slog.ErrorContext(r.Context(), "delivery_webhook: HandleDeliveryConfirmed failed",
			"awb_number", payload.AWBNumber, "error", err)
		// Return 500 agar integration-gateway bisa retry
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	slog.InfoContext(r.Context(), "delivery_webhook: processed successfully",
		"awb_number", payload.AWBNumber, "provider", payload.Provider)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":     "settlement_initiated",
		"awb_number": payload.AWBNumber,
	})
}

// HandleListSettlements adalah endpoint GET /api/internal/merchant-settlements
// untuk keperluan monitoring dan admin dashboard.
func (h *DeliveryWebhookHandler) HandleListSettlements(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	isAdmin := r.URL.Query().Get("is_admin") == "true"
	var settlements []*domain.MerchantSettlement
	var err error

	if isAdmin {
		statusFilter := r.URL.Query().Get("status")
		settlements, err = h.settlementSvc.ListAll(r.Context(), statusFilter, 100, 0)
	} else {
		merchantID := r.Header.Get("X-User-ID")
		if merchantID == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		settlements, err = h.settlementSvc.ListByMerchant(r.Context(), merchantID, 20, 0)
	}

	if err != nil {
		slog.ErrorContext(r.Context(), "delivery_webhook: List settlements failed", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"data":  settlements,
		"count": len(settlements),
	})
}
