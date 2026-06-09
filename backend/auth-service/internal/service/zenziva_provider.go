package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"tembus/auth-service/internal/domain"
)

// ─────────────────────────────────────────────
// ZenzivaOTPProvider
// ─────────────────────────────────────────────

// ZenzivaOTPProvider implements domain.OTPProvider using the Zenziva API.
// WhatsApp OTP is the primary channel; SMS is the fallback.
//
// Required env variables:
//   ZENZIVA_BASE_URL           - Zenziva API base URL
//   ZENZIVA_API_KEY            - API key from Zenziva dashboard
//   ZENZIVA_USER_KEY           - User key from Zenziva dashboard
//   ZENZIVA_WHATSAPP_SENDER    - Approved WhatsApp sender/WABA number
//   ZENZIVA_SMS_SENDER_ID      - SMS sender ID (if available)
//   ZENZIVA_WEBHOOK_SECRET     - Shared secret for webhook HMAC validation
//   ZENZIVA_CONNECT_TIMEOUT_MS - HTTP connect timeout (default 3000)
//   ZENZIVA_REQUEST_TIMEOUT_MS - HTTP request timeout (default 7000)
//   ZENZIVA_WEBHOOK_REPLAY_WINDOW_SECONDS - max age of valid webhook (default 300)
type ZenzivaOTPProvider struct {
	baseURL              string
	apiKey               string
	userKey              string
	waSender             string
	smsSenderID          string
	webhookSecret        string
	webhookReplayWindow  time.Duration
	httpClient           *http.Client
	waCircuitBreaker     *CircuitBreaker
	smsCircuitBreaker    *CircuitBreaker
	retryConfig          RetryConfig
}

// zenzivaResponse is the common API response envelope from Zenziva.
type zenzivaResponse struct {
	Status    string `json:"status"`
	Code      string `json:"code"`
	Message   string `json:"message"`
	To        string `json:"to"`
	MessageID string `json:"messageId"`
}

// NewZenzivaOTPProvider constructs a ZenzivaOTPProvider from environment variables.
// Returns an error if any required variable is missing.
func NewZenzivaOTPProvider() (*ZenzivaOTPProvider, error) {
	required := map[string]string{
		"ZENZIVA_BASE_URL":        os.Getenv("ZENZIVA_BASE_URL"),
		"ZENZIVA_API_KEY":         os.Getenv("ZENZIVA_API_KEY"),
		"ZENZIVA_USER_KEY":        os.Getenv("ZENZIVA_USER_KEY"),
		"ZENZIVA_WHATSAPP_SENDER": os.Getenv("ZENZIVA_WHATSAPP_SENDER"),
		"ZENZIVA_WEBHOOK_SECRET":  os.Getenv("ZENZIVA_WEBHOOK_SECRET"),
	}
	for name, val := range required {
		if strings.TrimSpace(val) == "" {
			return nil, fmt.Errorf("zenziva: required env variable %s is not set", name)
		}
	}

	requestTimeoutMs := int64(7000)
	if v := os.Getenv("ZENZIVA_REQUEST_TIMEOUT_MS"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			requestTimeoutMs = n
		}
	}

	replayWindowSeconds := int64(300)
	if v := os.Getenv("ZENZIVA_WEBHOOK_REPLAY_WINDOW_SECONDS"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			replayWindowSeconds = n
		}
	}

	return &ZenzivaOTPProvider{
		baseURL:             strings.TrimRight(os.Getenv("ZENZIVA_BASE_URL"), "/"),
		apiKey:              os.Getenv("ZENZIVA_API_KEY"),
		userKey:             os.Getenv("ZENZIVA_USER_KEY"),
		waSender:            os.Getenv("ZENZIVA_WHATSAPP_SENDER"),
		smsSenderID:         os.Getenv("ZENZIVA_SMS_SENDER_ID"),
		webhookSecret:       os.Getenv("ZENZIVA_WEBHOOK_SECRET"),
		webhookReplayWindow: time.Duration(replayWindowSeconds) * time.Second,
		httpClient: &http.Client{
			Timeout: time.Duration(requestTimeoutMs) * time.Millisecond,
		},
		// Circuit breaker: open after 5 failures, require 2 successes to close, stay open 30s
		waCircuitBreaker:  NewCircuitBreaker("zenziva_wa", 5, 2, 30*time.Second),
		smsCircuitBreaker: NewCircuitBreaker("zenziva_sms", 5, 2, 30*time.Second),
		retryConfig:       DefaultRetryConfig(),
	}, nil
}

func (p *ZenzivaOTPProvider) Name() domain.OTPProviderName {
	return domain.OTPProviderZenziva
}

// SendOTP sends the OTP via Zenziva with retry + circuit breaker.
// Dispatches to sendWhatsApp or sendSMS based on the requested channel.
func (p *ZenzivaOTPProvider) SendOTP(ctx context.Context, req domain.OTPSendRequest) (domain.OTPSendResult, error) {
	start := time.Now()

	switch req.Channel {
	case domain.OTPChannelWhatsApp:
		result, err := p.sendWithCircuitBreaker(ctx, req, p.waCircuitBreaker, p.sendWhatsApp)
		result.LatencyMS = time.Since(start).Milliseconds()
		return result, err
	case domain.OTPChannelSMS:
		result, err := p.sendWithCircuitBreaker(ctx, req, p.smsCircuitBreaker, p.sendSMS)
		result.LatencyMS = time.Since(start).Milliseconds()
		return result, err
	default:
		return domain.OTPSendResult{
			Retryable:       false,
			NormalizedError: "unsupported_channel",
		}, fmt.Errorf("zenziva: unsupported channel %q", req.Channel)
	}
}

// sendWithCircuitBreaker wraps a send function with circuit breaker + retry.
func (p *ZenzivaOTPProvider) sendWithCircuitBreaker(
	ctx context.Context,
	req domain.OTPSendRequest,
	cb *CircuitBreaker,
	sendFn func(context.Context, domain.OTPSendRequest) (domain.OTPSendResult, error),
) (domain.OTPSendResult, error) {
	// Check circuit breaker before attempting
	if err := cb.Allow(); err != nil {
		return domain.OTPSendResult{
			Retryable:       false,
			NormalizedError: "circuit_breaker_open",
		}, fmt.Errorf("zenziva: %w", err)
	}

	var finalResult domain.OTPSendResult
	var finalErr error

	retryErr := WithRetry(ctx, p.retryConfig, func() (bool, error) {
		result, err := sendFn(ctx, req)
		finalResult = result
		finalErr = err
		if err != nil {
			return result.Retryable, err
		}
		return false, nil
	})

	if retryErr != nil || finalErr != nil {
		cb.RecordFailure()
		if retryErr != nil {
			finalErr = retryErr
		}
		return finalResult, finalErr
	}

	cb.RecordSuccess()
	return finalResult, nil
}

// sendWhatsApp calls the Zenziva WhatsApp OTP API.
func (p *ZenzivaOTPProvider) sendWhatsApp(ctx context.Context, req domain.OTPSendRequest) (domain.OTPSendResult, error) {
	endpoint := p.baseURL + "/api/2.0/sendmsgotp"

	params := url.Values{}
	params.Set("userkey", p.userKey)
	params.Set("passkey", p.apiKey)
	params.Set("to", req.RecipientPhone)
	params.Set("masking", p.waSender)
	params.Set("message", req.OTPCode)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(params.Encode()))
	if err != nil {
		return domain.OTPSendResult{Retryable: true, NormalizedError: "request_build_failed"}, err
	}
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if req.IdempotencyKey != "" {
		httpReq.Header.Set("X-Idempotency-Key", req.IdempotencyKey)
	}

	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return domain.OTPSendResult{Retryable: true, NormalizedError: "network_error"},
			fmt.Errorf("zenziva wa: http error: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if err != nil {
		return domain.OTPSendResult{Retryable: true, NormalizedError: "response_read_failed"}, err
	}

	switch {
	case resp.StatusCode == http.StatusTooManyRequests:
		return domain.OTPSendResult{Retryable: true, NormalizedError: "provider_rate_limited"},
			fmt.Errorf("zenziva wa: rate limited (429)")
	case resp.StatusCode >= 500:
		return domain.OTPSendResult{Retryable: true, NormalizedError: "provider_server_error"},
			fmt.Errorf("zenziva wa: server error %d", resp.StatusCode)
	case resp.StatusCode >= 400:
		return domain.OTPSendResult{Retryable: false, NormalizedError: "provider_client_error"},
			fmt.Errorf("zenziva wa: client error %d", resp.StatusCode)
	}

	var zenResp zenzivaResponse
	if err := json.Unmarshal(body, &zenResp); err != nil {
		return domain.OTPSendResult{Retryable: true, NormalizedError: "response_parse_failed"}, err
	}

	switch strings.ToLower(zenResp.Status) {
	case "1", "success", "accepted", "sent":
		return domain.OTPSendResult{
			ProviderMessageID: zenResp.MessageID,
			Channel:           domain.OTPChannelWhatsApp,
			Status:            domain.OTPDeliveryAccepted,
			Retryable:         false,
		}, nil
	case "0", "failed", "error":
		return domain.OTPSendResult{
			ProviderMessageID: zenResp.MessageID,
			Channel:           domain.OTPChannelWhatsApp,
			Status:            domain.OTPDeliveryFailed,
			NormalizedError:   zenResp.Code,
			Retryable:         false,
		}, fmt.Errorf("zenziva wa: delivery failed: code=%s", zenResp.Code)
	default:
		return domain.OTPSendResult{
			Retryable:       true,
			NormalizedError: "unknown_provider_status",
		}, fmt.Errorf("zenziva wa: unknown status %q", zenResp.Status)
	}
}

// sendSMS calls the Zenziva SMS OTP API.
func (p *ZenzivaOTPProvider) sendSMS(ctx context.Context, req domain.OTPSendRequest) (domain.OTPSendResult, error) {
	endpoint := p.baseURL + "/api/2.0/sendsms"

	params := url.Values{}
	params.Set("userkey", p.userKey)
	params.Set("passkey", p.apiKey)
	params.Set("to", req.RecipientPhone)
	params.Set("message", fmt.Sprintf("Kode OTP Anda adalah %s. Berlaku 5 menit. Jangan bagikan ke siapapun.", req.OTPCode))
	if p.smsSenderID != "" {
		params.Set("masking", p.smsSenderID)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(params.Encode()))
	if err != nil {
		return domain.OTPSendResult{Retryable: true, NormalizedError: "request_build_failed"}, err
	}
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if req.IdempotencyKey != "" {
		httpReq.Header.Set("X-Idempotency-Key", req.IdempotencyKey)
	}

	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return domain.OTPSendResult{Retryable: true, NormalizedError: "network_error"},
			fmt.Errorf("zenziva sms: http error: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if err != nil {
		return domain.OTPSendResult{Retryable: true, NormalizedError: "response_read_failed"}, err
	}

	switch {
	case resp.StatusCode == http.StatusTooManyRequests:
		return domain.OTPSendResult{Retryable: true, NormalizedError: "provider_rate_limited"},
			fmt.Errorf("zenziva sms: rate limited (429)")
	case resp.StatusCode >= 500:
		return domain.OTPSendResult{Retryable: true, NormalizedError: "provider_server_error"},
			fmt.Errorf("zenziva sms: server error %d", resp.StatusCode)
	case resp.StatusCode >= 400:
		return domain.OTPSendResult{Retryable: false, NormalizedError: "provider_client_error"},
			fmt.Errorf("zenziva sms: client error %d", resp.StatusCode)
	}

	var zenResp zenzivaResponse
	if err := json.Unmarshal(body, &zenResp); err != nil {
		return domain.OTPSendResult{Retryable: true, NormalizedError: "response_parse_failed"}, err
	}

	switch strings.ToLower(zenResp.Status) {
	case "1", "success", "accepted", "sent":
		return domain.OTPSendResult{
			ProviderMessageID: zenResp.MessageID,
			Channel:           domain.OTPChannelSMS,
			Status:            domain.OTPDeliveryAccepted,
			Retryable:         false,
		}, nil
	default:
		return domain.OTPSendResult{
			ProviderMessageID: zenResp.MessageID,
			Channel:           domain.OTPChannelSMS,
			Status:            domain.OTPDeliveryFailed,
			NormalizedError:   zenResp.Code,
			Retryable:         false,
		}, fmt.Errorf("zenziva sms: delivery failed: code=%s", zenResp.Code)
	}
}

// CheckDeliveryStatus queries Zenziva for the delivery status of a message.
func (p *ZenzivaOTPProvider) CheckDeliveryStatus(ctx context.Context, providerMessageID string) (domain.OTPDeliveryStatusResult, error) {
	endpoint := fmt.Sprintf("%s/api/2.0/getmsgstatus?userkey=%s&passkey=%s&messageid=%s",
		p.baseURL,
		url.QueryEscape(p.userKey),
		url.QueryEscape(p.apiKey),
		url.QueryEscape(providerMessageID),
	)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return domain.OTPDeliveryStatusResult{}, err
	}

	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return domain.OTPDeliveryStatusResult{}, fmt.Errorf("zenziva status: http error: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return domain.OTPDeliveryStatusResult{}, err
	}

	var zenResp zenzivaResponse
	if err := json.Unmarshal(body, &zenResp); err != nil {
		return domain.OTPDeliveryStatusResult{}, err
	}

	result := domain.OTPDeliveryStatusResult{ProviderMessageID: providerMessageID}
	switch strings.ToLower(zenResp.Status) {
	case "delivered":
		result.Status = domain.OTPDeliveryDelivered
		now := time.Now().Unix()
		result.DeliveredAt = &now
	case "sent", "accepted", "1":
		result.Status = domain.OTPDeliverySent
	case "failed", "error", "0":
		result.Status = domain.OTPDeliveryFailed
	default:
		result.Status = domain.OTPDeliverySent
	}
	return result, nil
}

// VerifyWebhookSignature validates the HMAC-SHA256 signature of an incoming Zenziva webhook.
// Also enforces timestamp replay protection: rejects webhooks older than webhookReplayWindow.
//
// Signature: HMAC-SHA256(timestamp + "." + payload, ZENZIVA_WEBHOOK_SECRET)
func (p *ZenzivaOTPProvider) VerifyWebhookSignature(payload []byte, signature string, timestamp string) error {
	if len(payload) == 0 {
		return fmt.Errorf("zenziva webhook: empty payload")
	}
	if signature == "" {
		return fmt.Errorf("zenziva webhook: missing signature")
	}

	// ── Timestamp replay protection ──────────────────────
	if timestamp != "" {
		ts, err := strconv.ParseInt(strings.TrimSpace(timestamp), 10, 64)
		if err != nil {
			return fmt.Errorf("zenziva webhook: invalid timestamp format")
		}
		age := time.Since(time.Unix(ts, 0))
		if age < 0 {
			// future timestamp — clock skew or replay
			age = -age
		}
		if age > p.webhookReplayWindow {
			return fmt.Errorf("zenziva webhook: timestamp too old (%s > %s)", age.Round(time.Second), p.webhookReplayWindow)
		}
	}

	// ── HMAC-SHA256 verification ─────────────────────────
	mac := hmac.New(sha256.New, []byte(p.webhookSecret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write(payload)
	expected := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expected), []byte(strings.TrimSpace(signature))) {
		return fmt.Errorf("zenziva webhook: signature mismatch")
	}
	return nil
}

// CircuitBreakerStatus returns the status of both WA and SMS circuit breakers (for metrics).
func (p *ZenzivaOTPProvider) CircuitBreakerStatus() map[string]string {
	return map[string]string{
		"whatsapp": p.waCircuitBreaker.State(),
		"sms":      p.smsCircuitBreaker.State(),
	}
}
