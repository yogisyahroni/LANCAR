package notification

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"lancar/order-service/internal/domain"
)

type HTTPDeliveryProvider struct {
	repo       domain.NotificationRepository
	httpClient *http.Client
	endpoints  map[domain.NotificationChannel]string
	tokens     map[domain.NotificationChannel]string
}

type deliveryPayload struct {
	NotificationID string                     `json:"notification_id"`
	UserID         string                     `json:"user_id"`
	Title          string                     `json:"title"`
	Body           string                     `json:"body"`
	Type           string                     `json:"type"`
	Channel        domain.NotificationChannel `json:"channel"`
	OrderID        string                     `json:"order_id,omitempty"`
	Metadata       json.RawMessage            `json:"metadata,omitempty"`
}

func NewHTTPDeliveryProvider(repo domain.NotificationRepository) *HTTPDeliveryProvider {
	return &HTTPDeliveryProvider{
		repo: repo,
		httpClient: &http.Client{
			Timeout: envDuration("NOTIFICATION_PROVIDER_TIMEOUT_SECONDS", 15*time.Second),
		},
		endpoints: map[domain.NotificationChannel]string{
			domain.ChannelPush:      strings.TrimSpace(os.Getenv("NOTIFICATION_PUSH_PROVIDER_URL")),
			domain.ChannelEmail:     strings.TrimSpace(os.Getenv("NOTIFICATION_EMAIL_PROVIDER_URL")),
			domain.ChannelSMS:       strings.TrimSpace(os.Getenv("NOTIFICATION_SMS_PROVIDER_URL")),
			domain.ChannelWhatsApp:  strings.TrimSpace(os.Getenv("NOTIFICATION_WHATSAPP_PROVIDER_URL")),
			domain.ChannelWebSocket: strings.TrimSpace(os.Getenv("NOTIFICATION_WEBSOCKET_PROVIDER_URL")),
		},
		tokens: map[domain.NotificationChannel]string{
			domain.ChannelPush:      strings.TrimSpace(os.Getenv("NOTIFICATION_PUSH_PROVIDER_TOKEN")),
			domain.ChannelEmail:     strings.TrimSpace(os.Getenv("NOTIFICATION_EMAIL_PROVIDER_TOKEN")),
			domain.ChannelSMS:       strings.TrimSpace(os.Getenv("NOTIFICATION_SMS_PROVIDER_TOKEN")),
			domain.ChannelWhatsApp:  strings.TrimSpace(os.Getenv("NOTIFICATION_WHATSAPP_PROVIDER_TOKEN")),
			domain.ChannelWebSocket: strings.TrimSpace(os.Getenv("NOTIFICATION_WEBSOCKET_PROVIDER_TOKEN")),
		},
	}
}

func (p *HTTPDeliveryProvider) Deliver(ctx context.Context, notificationID uuid.UUID, channel domain.NotificationChannel) error {
	if channel == domain.ChannelInApp {
		return nil
	}
	if p.repo == nil {
		return fmt.Errorf("notification_repository_not_configured")
	}

	endpoint := p.endpoints[channel]
	if endpoint == "" {
		return fmt.Errorf("notification_provider_%s_not_configured", channel)
	}

	notif, err := p.repo.GetNotificationByID(ctx, notificationID)
	if err != nil {
		return fmt.Errorf("notification_lookup_failed: %w", err)
	}

	payload := deliveryPayload{
		NotificationID: notif.ID.String(),
		UserID:         notif.UserID.String(),
		Title:          notif.Title,
		Body:           notif.Body,
		Type:           notif.Type,
		Channel:        channel,
	}
	if notif.OrderID != nil {
		payload.OrderID = notif.OrderID.String()
	}
	if notif.Metadata != nil && strings.TrimSpace(*notif.Metadata) != "" {
		payload.Metadata = json.RawMessage(*notif.Metadata)
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("notification_payload_encode_failed: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("notification_provider_request_failed: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Tembus-Notification-Channel", string(channel))
	if token := p.tokens[channel]; token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("notification_provider_delivery_failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("notification_provider_rejected_%s_status_%d", channel, resp.StatusCode)
	}

	return nil
}

func envDuration(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	if seconds, err := strconv.Atoi(value); err == nil {
		return time.Duration(seconds) * time.Second
	}
	parsedDuration, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return parsedDuration
}
