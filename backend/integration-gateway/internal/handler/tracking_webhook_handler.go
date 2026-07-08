package handler

import (
	"bytes"
	"context"
	"crypto/hmac"
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
)

// TrackingWebhookHandler bertanggung jawab menerima webhook tracking/POD
// dari berbagai ekspedisi 3PL (JNE, J&T, SiCepat, AnterAja, dll), memverifikasi keamanannya,
// menormalisasi format payload, dan meneruskannya ke order-service internal webhook.
type TrackingWebhookHandler struct {
	orderServiceURL string
	internalAPIKey  string
	webhookSecret   string // rahasia verifikasi signature webhook dari 3PL
	httpClient      *http.Client
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
	}
}

// NormalizedTrackingEvent mewakili format payload standar yang dikirim ke order-service.
type NormalizedTrackingEvent struct {
	AWBNumber   string `json:"awb_number"`
	Provider    string `json:"provider"`
	Status      string `json:"status"` // "DELIVERED", "IN_TRANSIT", dll
	PodURL      string `json:"pod_url,omitempty"`
	ConfirmedAt string `json:"confirmed_at,omitempty"` // RFC3339 timestamp
	RawPayload  string `json:"raw_payload,omitempty"`
}

// jneWebhookPayload merepresentasikan format webhook JNE
type jneWebhookPayload struct {
	AWB       string `json:"cnote_no"`
	Status    string `json:"status"` // "DELIVERED", dll
	Receiver  string `json:"receiver_name"`
	Date      string `json:"delivery_date"`
	PODImage  string `json:"pod_photo_url"`
}

// jntWebhookPayload merepresentasikan format webhook J&T Express
type jntWebhookPayload struct {
	WaybillNo string `json:"billcode"`
	ScanType  string `json:"scantype"` // "Penandatanganan" / "Delivered"
	PhotoURL  string `json:"signpic"`
	ScanTime  string `json:"scantime"`
}

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

	// ─── 3. Verifikasi Signature Webhook (WAJIB jika secret dikonfigurasi) ──────
	// SECURITY 2026: Jika LOGISTICS_WEBHOOK_SECRET di-set, header X-Webhook-Signature
	// WAJIB ada DAN WAJIB valid. Sebelumnya hanya dicek jika header hadir (double-optional
	// flaw) — ini memungkinkan siapapun memicu escrow tanpa tanda tangan.
	if h.webhookSecret != "" {
		receivedSig := r.Header.Get("X-Webhook-Signature")
		if receivedSig == "" {
			// Header wajib ada jika secret dikonfigurasi
			slog.WarnContext(r.Context(), "tracking_webhook: missing required X-Webhook-Signature header",
				"provider", provider)
			http.Error(w, "Missing webhook signature", http.StatusUnauthorized)
			return
		}
		expectedSig := h.computeHMAC(bodyBytes, h.webhookSecret)
		if !hmac.Equal([]byte(receivedSig), []byte(expectedSig)) {
			slog.WarnContext(r.Context(), "tracking_webhook: HMAC signature mismatch — possible unauthorized webhook injection",
				"provider", provider)
			http.Error(w, "Invalid webhook signature", http.StatusUnauthorized)
			return
		}
	} else {
		// Tidak ada secret dikonfigurasi — log peringatan tapi masih proses
		// (agar backward-compatible selama onboarding ekspedisi baru)
		slog.WarnContext(r.Context(), "tracking_webhook: LOGISTICS_WEBHOOK_SECRET not set — webhook accepted without signature verification",
			"provider", provider)
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

// normalizePayload menormalisasi webhook dari berbagai provider 3PL.
func (h *TrackingWebhookHandler) normalizePayload(provider string, body []byte) (NormalizedTrackingEvent, error) {
	var event NormalizedTrackingEvent
	event.Provider = strings.ToUpper(provider)
	event.ConfirmedAt = time.Now().Format(time.RFC3339)

	switch provider {
	case "jne":
		var p jneWebhookPayload
		if err := json.Unmarshal(body, &p); err != nil {
			return event, err
		}
		event.AWBNumber = p.AWB
		event.PodURL = p.PODImage
		if strings.EqualFold(p.Status, "DELIVERED") {
			event.Status = "DELIVERED"
		} else {
			event.Status = strings.ToUpper(p.Status)
		}

	case "jnt", "jnt_express":
		var p jntWebhookPayload
		if err := json.Unmarshal(body, &p); err != nil {
			return event, err
		}
		event.AWBNumber = p.WaybillNo
		event.PodURL = p.PhotoURL
		if strings.Contains(strings.ToLower(p.ScanType), "delivered") ||
			strings.Contains(strings.ToLower(p.ScanType), "penandatanganan") {
			event.Status = "DELIVERED"
		} else {
			event.Status = strings.ToUpper(p.ScanType)
		}

	default:
		// Generic JSON payload with standardized fields
		var generic map[string]any
		if err := json.Unmarshal(body, &generic); err != nil {
			return event, err
		}
		if awb, ok := generic["awb_number"].(string); ok {
			event.AWBNumber = awb
		} else if awb, ok := generic["awb"].(string); ok {
			event.AWBNumber = awb
		}
		if status, ok := generic["status"].(string); ok {
			event.Status = strings.ToUpper(status)
		}
		if pod, ok := generic["pod_url"].(string); ok {
			event.PodURL = pod
		}
	}

	if event.AWBNumber == "" {
		return event, fmt.Errorf("could not extract AWB number from %s webhook payload", provider)
	}

	return event, nil
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

func (h *TrackingWebhookHandler) computeHMAC(payload []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}
