package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"

	"tembus/order-service/internal/domain"
)

// DeliveryWebhookHandler menerima event DELIVERED dari integration-gateway.
// Endpoint ini HANYA boleh dipanggil oleh internal service (integration-gateway)
// menggunakan X-Internal-Api-Key header. Tidak boleh terekspos ke publik.
type DeliveryWebhookHandler struct {
	settlementSvc   domain.MerchantSettlementService
	carrierEventSvc domain.CarrierEventService
	internalAPIKey  string
}

// NewDeliveryWebhookHandler membuat handler untuk delivery webhook internal.
func NewDeliveryWebhookHandler(settlementSvc domain.MerchantSettlementService, carrierEventSvc domain.CarrierEventService) *DeliveryWebhookHandler {
	return &DeliveryWebhookHandler{
		settlementSvc:   settlementSvc,
		carrierEventSvc: carrierEventSvc,
		internalAPIKey:  os.Getenv("INTERNAL_API_KEY"),
	}
}

// deliveryWebhookPayload adalah payload yang dikirim oleh integration-gateway
// setelah menerima dan memverifikasi webhook DELIVERED dari 3PL.
type deliveryWebhookPayload struct {
	EventID           string `json:"event_id,omitempty"`
	PayloadHash       string `json:"payload_hash,omitempty"`
	AWBNumber         string `json:"awb_number"`
	Provider          string `json:"provider"`
	Status            string `json:"status"` // "DELIVERED", "IN_TRANSIT", dll
	CanonicalStatus   string `json:"canonical_status,omitempty"`
	ProviderStatus    string `json:"provider_status,omitempty"`
	ProviderCode      string `json:"provider_status_code,omitempty"`
	ProviderDetail    string `json:"provider_status_description,omitempty"`
	ProviderLocation  string `json:"provider_location,omitempty"`
	ProviderTimestamp string `json:"provider_timestamp,omitempty"`
	PodURL            string `json:"pod_url,omitempty"`
	ConfirmedAt       string `json:"confirmed_at,omitempty"` // RFC3339
	RawPayload        string `json:"raw_payload,omitempty"`
	RawStatus         string `json:"raw_status,omitempty"`
	RawCode           string `json:"raw_code,omitempty"`
	RawDescription    string `json:"raw_description,omitempty"`
	RawLocation       string `json:"raw_location,omitempty"`
	OccurredAt        string `json:"occurred_at,omitempty"`
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

// HandleChargeback adalah endpoint POST /api/v1/internal/settlements/chargeback.
// FB-080: dipanggil admin-service saat dispute food resolved memihak customer —
// settlement merchant untuk order ditahan (DISPUTED), dana tidak di-disburse.
func (h *DeliveryWebhookHandler) HandleChargeback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	receivedKey := r.Header.Get("X-Internal-Api-Key")
	if h.internalAPIKey != "" && receivedKey != h.internalAPIKey {
		slog.WarnContext(r.Context(), "settlement_chargeback: unauthorized attempt", "remote_addr", r.RemoteAddr)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var payload struct {
		OrderID string `json:"order_id"`
		AdminID string `json:"admin_id"`
		Reason  string `json:"reason"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64*1024)).Decode(&payload); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if payload.OrderID == "" {
		http.Error(w, "order_id is required", http.StatusBadRequest)
		return
	}

	adminUUID, err := uuid.Parse(payload.AdminID)
	if err != nil {
		adminUUID = uuid.Nil
	}

	if err := h.settlementSvc.ChargebackByOrder(r.Context(), payload.OrderID, adminUUID, payload.Reason); err != nil {
		slog.ErrorContext(r.Context(), "settlement_chargeback: failed", "order_id", payload.OrderID, "error", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":  "success",
		"message": "Chargeback applied (settlement DISPUTED) untuk order " + payload.OrderID,
	})
}

// HandleFoodSettlement adalah endpoint POST /api/v1/internal/orders/food-settlement.
// Dipanggil admin-service setelah proof delivery sukses untuk order food on-demand
// (jalur courier mobile) — parity dengan ScanPackage (Go) yang memanggil
// HandleFoodOrderDelivered saat delivered. Idempotent via settle-order-<orderID>.
func (h *DeliveryWebhookHandler) HandleFoodSettlement(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	receivedKey := r.Header.Get("X-Internal-Api-Key")
	if h.internalAPIKey != "" && receivedKey != h.internalAPIKey {
		slog.WarnContext(r.Context(), "food_settlement: unauthorized attempt", "remote_addr", r.RemoteAddr)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var payload struct {
		OrderID string `json:"order_id"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64*1024)).Decode(&payload); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if payload.OrderID == "" {
		http.Error(w, "order_id is required", http.StatusBadRequest)
		return
	}

	if err := h.settlementSvc.HandleFoodOrderDelivered(r.Context(), payload.OrderID); err != nil {
		slog.ErrorContext(r.Context(), "food_settlement: failed", "order_id", payload.OrderID, "error", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":  "success",
		"message": "Food settlement initiated (idempotent) untuk order " + payload.OrderID,
	})
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

	// Raw-first inbox: persist every provider event before any settlement or
	// lifecycle side effect. Missing provider event IDs fall back to body hash.
	if h.carrierEventSvc != nil {
		eventID := strings.TrimSpace(payload.EventID)
		payloadHash := strings.TrimSpace(payload.PayloadHash)
		if payloadHash == "" {
			sum := sha256.Sum256(body)
			payloadHash = hex.EncodeToString(sum[:])
		}
		if eventID == "" {
			eventID = payload.Provider + ":" + payloadHash
		}
		var occurredAt *time.Time
		if payload.OccurredAt != "" {
			if parsed, parseErr := time.Parse(time.RFC3339, payload.OccurredAt); parseErr == nil {
				occurredAt = &parsed
			}
		}
		if err := h.carrierEventSvc.Process(r.Context(), &domain.CarrierEvent{
			ID: uuid.NewString(), Provider: strings.TrimSpace(payload.Provider), EventID: eventID,
			PayloadHash: payloadHash, AWBNumber: strings.TrimSpace(payload.AWBNumber),
			CanonicalStatus:   firstNonEmpty(strings.ToUpper(strings.TrimSpace(payload.CanonicalStatus)), strings.ToUpper(strings.TrimSpace(payload.Status))),
			ProviderStatus:    firstNonEmpty(payload.ProviderStatus, payload.RawStatus),
			ProviderCode:      firstNonEmpty(payload.ProviderCode, payload.RawCode),
			ProviderDetail:    firstNonEmpty(payload.ProviderDetail, payload.RawDescription),
			ProviderLocation:  firstNonEmpty(payload.ProviderLocation, payload.RawLocation),
			ProviderTimestamp: firstNonEmpty(payload.ProviderTimestamp, payload.OccurredAt),
			RawStatus:         firstNonEmpty(payload.RawStatus, payload.ProviderStatus, payload.Status),
			RawCode:           firstNonEmpty(payload.RawCode, payload.ProviderCode), RawDescription: firstNonEmpty(payload.RawDescription, payload.ProviderDetail), RawLocation: firstNonEmpty(payload.RawLocation, payload.ProviderLocation),
			OccurredAt: occurredAt, ReceivedAt: time.Now(), RawPayload: string(body),
		}); err != nil {
			slog.ErrorContext(r.Context(), "delivery_webhook: carrier event inbox failed", "awb_number", payload.AWBNumber, "error", err)
			http.Error(w, "Failed to persist carrier event", http.StatusInternalServerError)
			return
		}
	}

	// ─── Settlement hanya untuk event DELIVERED; event lain sudah masuk inbox ─
	normalizedStatus := strings.ToUpper(strings.TrimSpace(payload.Status))
	if normalizedStatus != "DELIVERED" {
		// Event lain (IN_TRANSIT, PICKED_UP, dll) — log dan return 200 tanpa proses
		slog.InfoContext(r.Context(), "delivery_webhook: non-delivery event received, skipping settlement",
			"awb_number", payload.AWBNumber, "status", payload.Status)
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "accepted_non_delivery"})
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
	_ = json.NewEncoder(w).Encode(map[string]string{
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
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data":  settlements,
		"count": len(settlements),
	})
}
