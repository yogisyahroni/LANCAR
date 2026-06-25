package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"tembus/auth-service/internal/domain"
)

// ─────────────────────────────────────────────
// ZenzivaOTPProvider (via Integration Gateway)
// ─────────────────────────────────────────────
//
// ZenzivaOTPProvider now acts as a client to the integration-gateway,
// fulfilling the domain.OTPProvider interface.
type ZenzivaOTPProvider struct {
	gatewayURL string
	apiKey     string
	httpClient *http.Client
}

// NewZenzivaOTPProvider constructs an OTPProvider that delegates to integration-gateway.
func NewZenzivaOTPProvider() (*ZenzivaOTPProvider, error) {
	gatewayURL := os.Getenv("INTEGRATION_GATEWAY_URL")
	if strings.TrimSpace(gatewayURL) == "" {
		// Fallback for local docker-compose
		gatewayURL = "http://integration-gateway:8085"
	}

	apiKey := os.Getenv("INTERNAL_API_KEY")

	return &ZenzivaOTPProvider{
		gatewayURL: strings.TrimRight(gatewayURL, "/"),
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}, nil
}

func (p *ZenzivaOTPProvider) Name() domain.OTPProviderName {
	return domain.OTPProviderZenziva
}

// SendOTP delegates sending to the integration-gateway.
func (p *ZenzivaOTPProvider) SendOTP(ctx context.Context, req domain.OTPSendRequest) (domain.OTPSendResult, error) {
	start := time.Now()

	var endpoint string
	switch req.Channel {
	case domain.OTPChannelWhatsApp:
		endpoint = "/api/internal/otp/send-wa"
	case domain.OTPChannelSMS:
		endpoint = "/api/internal/otp/send-sms"
	default:
		return domain.OTPSendResult{
			Retryable:       false,
			NormalizedError: "unsupported_channel",
		}, fmt.Errorf("integration-client: unsupported channel %q", req.Channel)
	}

	payload := map[string]interface{}{
		"to":      req.RecipientPhone,
		"message": fmt.Sprintf("Kode OTP anda adalah %s", req.OTPCode),
	}

	err := p.doRequest(ctx, endpoint, payload)
	
	result := domain.OTPSendResult{
		LatencyMS: time.Since(start).Milliseconds(),
	}

	if err != nil {
		result.Retryable = true // Assuming transient network error to gateway
		result.NormalizedError = "gateway_error"
		return result, err
	}

	result.ProviderMessageID = "gateway-" + fmt.Sprint(time.Now().UnixNano()) // Stub message ID
	return result, nil
}

func (p *ZenzivaOTPProvider) doRequest(ctx context.Context, endpoint string, payload map[string]interface{}) error {
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	url := p.gatewayURL + endpoint
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if p.apiKey != "" {
		req.Header.Set("X-Internal-Api-Key", p.apiKey)
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("integration gateway returned status %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func (p *ZenzivaOTPProvider) CheckDeliveryStatus(ctx context.Context, providerMessageID string) (domain.OTPDeliveryStatusResult, error) {
	return domain.OTPDeliveryStatusResult{
		ProviderMessageID: providerMessageID,
		Status:            domain.OTPDeliveryDelivered,
	}, nil
}

func (p *ZenzivaOTPProvider) VerifyWebhookSignature(payload []byte, signature string, timestamp string) error {
	return nil
}
