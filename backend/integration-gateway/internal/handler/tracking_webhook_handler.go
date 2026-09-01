package handler

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"tembus/integration-gateway/internal/domain"
	providerpkg "tembus/integration-gateway/internal/provider"
)

// TrackingWebhookHandler bertanggung jawab menerima webhook tracking/POD
// dari berbagai ekspedisi 3PL (JNE, J&T, SiCepat, AnterAja, dll), memverifikasi keamanannya,
// menormalisasi format payload, dan meneruskannya ke order-service internal webhook.
type TrackingWebhookHandler struct {
	orderServiceURL string
	internalAPIKey  string
	webhookSecret   string // rahasia verifikasi signature webhook dari 3PL
	httpClient      *http.Client
	webhookAdapters domain.WebhookAdapterRegistry
}

// NewTrackingWebhookHandler membuat instance TrackingWebhookHandler baru.
func NewTrackingWebhookHandler() *TrackingWebhookHandler {
	orderSvcURL := os.Getenv("ORDER_SERVICE_URL")
	if orderSvcURL == "" {
		orderSvcURL = "http://order-service:8083"
	}

	return &TrackingWebhookHandler{
		orderServiceURL: strings.TrimRight(orderSvcURL, "/"),
		internalAPIKey:  os.Getenv("INTERNAL_API_KEY"),
		webhookSecret:   os.Getenv("LOGISTICS_WEBHOOK_SECRET"),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		webhookAdapters: providerpkg.NewWebhookAdapterRegistry(),
	}
}

// NormalizedTrackingEvent is retained as a compatibility alias for callers
// while the canonical event contract lives in domain.CarrierEvent.
type NormalizedTrackingEvent = domain.CarrierEvent

// HandleProviderWebhook adalah endpoint universal/spesifik untuk menerima webhook tracking 3PL.
// Route: POST /api/v1/logistics/webhook/{provider} atau POST /api/v1/logistics/webhook
func (h *TrackingWebhookHandler) HandleProviderWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// ─── 1. Ambil provider dari query atau path ─────────────────────────────────
	provider := strings.ToLower(r.URL.Query().Get("provider"))
	if provider == "" {
		// Coba parse path trailing: /api/v1/logistics/webhook/jne -> jne
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) > 0 {
			lastPart := strings.ToLower(parts[len(parts)-1])
			if lastPart != "webhook" {
				provider = lastPart
			}
		}
	}
	if provider == "" {
		provider = "generic"
	}

	// ─── 2. Baca payload raw ──────────────────────────────────────────────────
	bodyBytes, err := io.ReadAll(io.LimitReader(r.Body, 1024*1024)) // max 1MB
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// ─── 3. Resolve adapter and verify provider-owned signature ────────────────
	adapter, knownProvider := h.webhookAdapters.Get(provider)
	if !knownProvider {
		// Unknown providers are accepted only through the generic raw-preserving
		// adapter and remain UNKNOWN/manual until an adapter is registered.
		adapter = providerpkg.NewGenericWebhookAdapter(provider)
		slog.WarnContext(r.Context(), "tracking_webhook: provider has no registered adapter; degraded manual tracking", "provider", provider)
	}
	if err := adapter.VerifySignature(r.Header, bodyBytes, h.webhookSecret); err != nil {
		if strings.Contains(err.Error(), "not configured") {
			slog.ErrorContext(r.Context(), "tracking_webhook: verification secret is not configured", "provider", provider)
			http.Error(w, "Webhook verification secret is not configured", http.StatusInternalServerError)
			return
		}
		slog.WarnContext(r.Context(), "tracking_webhook: provider signature verification failed", "provider", provider, "error", err)
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	// ─── 4. Parse payload ke format standar ──────────────────────────────────
	event, err := h.normalizePayload(provider, bodyBytes)
	if err != nil {
		slog.ErrorContext(r.Context(), "tracking_webhook: normalizePayload error",
			"provider", provider, "error", err)
		http.Error(w, "Invalid webhook payload format", http.StatusBadRequest)
		return
	}

	// Simpan raw payload asli untuk keperluan audit
	event.RawPayload = string(bodyBytes)
	event.PayloadHash = sha256Hex(bodyBytes)
	if headerID := strings.TrimSpace(r.Header.Get("X-Event-ID")); headerID != "" {
		event.EventID = headerID
	} else {
		event.EventID = provider + ":" + event.PayloadHash
	}

	// ─── 5. Teruskan event ke order-service internal delivery webhook ─────────
	if err := h.forwardToOrderService(r.Context(), event); err != nil {
		slog.ErrorContext(r.Context(), "tracking_webhook: failed to forward to order-service",
			"awb_number", event.AWBNumber, "error", err)
		// Kirim 500 supaya 3PL tahu proses gagal dan bisa meretry pengiriman webhook
		http.Error(w, "Failed to process delivery event", http.StatusInternalServerError)
		return
	}

	slog.InfoContext(r.Context(), "tracking_webhook: successfully forwarded tracking event",
		"provider", event.Provider, "awb_number", event.AWBNumber, "status", event.Status)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "received",
		"awb_no":  event.AWBNumber,
		"message": "Webhook processed successfully",
	})
}

// normalizePayload delegates provider-specific parsing to the registered
// adapter. The central handler remains transport/security orchestration only.
func (h *TrackingWebhookHandler) normalizePayload(provider string, body []byte) (NormalizedTrackingEvent, error) {
	registry := h.webhookAdapters
	if registry == nil {
		registry = providerpkg.NewWebhookAdapterRegistry()
	}
	var adapter domain.WebhookAdapter
	ok := false
	adapter, ok = registry.Get(provider)
	if !ok {
		adapter = providerpkg.NewGenericWebhookAdapter(provider)
	}
	event, err := adapter.Normalize(body)
	if err != nil {
		return NormalizedTrackingEvent{}, err
	}
	if event.RawStatus == "" {
		event.RawStatus = event.Status
	}
	if event.Status == "" {
		event.Status = "UNKNOWN"
	}
	if event.CanonicalStatus == "" {
		event.CanonicalStatus = event.Status
	}
	if event.ProviderStatus == "" {
		event.ProviderStatus = event.RawStatus
	}
	if event.ProviderCode == "" {
		event.ProviderCode = event.RawCode
	}
	if event.ProviderDetail == "" {
		event.ProviderDetail = event.RawDescription
	}
	if event.ProviderLocation == "" {
		event.ProviderLocation = event.RawLocation
	}
	if event.ProviderTimestamp == "" {
		event.ProviderTimestamp = event.OccurredAt
	}
	if event.RawStatus == "" {
		event.RawStatus = "UNKNOWN"
	}
	if event.ProviderStatus == "" {
		event.ProviderStatus = event.RawStatus
	}
	return event, nil
}

func sha256Hex(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

// forwardToOrderService mengirim event yang sudah dinormalisasi ke endpoint internal order-service.
func (h *TrackingWebhookHandler) forwardToOrderService(ctx context.Context, event NormalizedTrackingEvent) error {
	payloadBytes, err := json.Marshal(event)
	if err != nil {
		return err
	}

	targetURL := fmt.Sprintf("%s/api/v1/internal/delivery/webhook", h.orderServiceURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	if h.internalAPIKey != "" {
		req.Header.Set("X-Internal-Api-Key", h.internalAPIKey)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("HTTP error calling order-service: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("order-service returned non-2XX status %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}
