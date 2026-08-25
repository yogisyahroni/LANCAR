package provider

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
)

// ZenzivaProvider handles communication with Zenziva API
type ZenzivaProvider struct {
	baseURL           string
	apiKey            string
	userKey           string
	waSender          string
	smsSenderID       string
	httpClient        *http.Client
	waCircuitBreaker  *CircuitBreaker
	smsCircuitBreaker *CircuitBreaker
}

// zenzivaResponse is the common API response envelope from Zenziva.
type zenzivaResponse struct {
	Status    any    `json:"status"`
	Code      string `json:"code"`
	Message   string `json:"message"`
	Error     string `json:"error"`
	To        string `json:"to"`
	MessageID string `json:"messageId"`
}

func NewZenzivaOTPProvider() (*ZenzivaProvider, error) {
	required := map[string]string{
		"ZENZIVA_BASE_URL": os.Getenv("ZENZIVA_BASE_URL"),
		"ZENZIVA_API_KEY":  os.Getenv("ZENZIVA_API_KEY"),
		"ZENZIVA_USER_KEY": os.Getenv("ZENZIVA_USER_KEY"),
	}
	for name, val := range required {
		if strings.TrimSpace(val) == "" {
			return nil, fmt.Errorf("zenziva: required env variable %s is not set", name)
		}
	}

	return &ZenzivaProvider{
		baseURL:           strings.TrimRight(os.Getenv("ZENZIVA_BASE_URL"), "/"),
		apiKey:            os.Getenv("ZENZIVA_API_KEY"),
		userKey:           os.Getenv("ZENZIVA_USER_KEY"),
		waSender:          os.Getenv("ZENZIVA_WHATSAPP_SENDER"),
		smsSenderID:       os.Getenv("ZENZIVA_SMS_SENDER_ID"),
		httpClient:        &http.Client{Timeout: 7 * time.Second},
		waCircuitBreaker:  NewCircuitBreaker("zenziva_wa", 5, 2, 30*time.Second),
		smsCircuitBreaker: NewCircuitBreaker("zenziva_sms", 5, 2, 30*time.Second),
	}, nil
}

// SendWA sends a WhatsApp message via Zenziva
func (z *ZenzivaProvider) SendWA(ctx context.Context, to string, message string) error {
	if err := z.waCircuitBreaker.Allow(); err != nil {
		return err
	}

	payload := map[string]interface{}{
		"userkey": z.userKey,
		"passkey": z.apiKey,
		"nohp":    to,
		"pesan":   message,
	}

	if z.waSender != "" {
		payload["sender"] = z.waSender
	}

	err := z.doRequest(ctx, "/v2/wa/send", payload)
	if err != nil {
		z.waCircuitBreaker.RecordFailure()
		return fmt.Errorf("zenziva WA error: %w", err)
	}

	z.waCircuitBreaker.RecordSuccess()
	return nil
}

// SendSMS sends an SMS message via Zenziva
func (z *ZenzivaProvider) SendSMS(ctx context.Context, to string, message string) error {
	if err := z.smsCircuitBreaker.Allow(); err != nil {
		return err
	}

	payload := map[string]interface{}{
		"userkey": z.userKey,
		"passkey": z.apiKey,
		"nohp":    to,
		"pesan":   message,
	}

	if z.smsSenderID != "" {
		payload["sender"] = z.smsSenderID
	}

	err := z.doRequest(ctx, "/v2/reguler/send", payload) // or /v2/masking/send based on your config, assuming reguler or sms
	if err != nil {
		z.smsCircuitBreaker.RecordFailure()
		return fmt.Errorf("zenziva SMS error: %w", err)
	}

	z.smsCircuitBreaker.RecordSuccess()
	return nil
}

func (z *ZenzivaProvider) doRequest(ctx context.Context, endpoint string, payload map[string]interface{}) error {
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	url := z.baseURL + endpoint

	// Retry transport failures / 5xx with exponential backoff; business-level
	// rejections below are terminal and never retried.
	resp, err := doHTTPWithRetry(ctx, z.httpClient, func() (*http.Request, error) {
		req, reqErr := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
		if reqErr != nil {
			return nil, reqErr
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		return req, nil
	})
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
	}

	var zResp zenzivaResponse
	if err := json.NewDecoder(resp.Body).Decode(&zResp); err != nil {
		return err
	}

	if zResp.Status != "1" && zResp.Status != 1 && zResp.Status != "success" && zResp.Status != "true" {
		return fmt.Errorf("Zenziva rejected: code=%s, msg=%s", zResp.Code, zResp.Message)
	}

	return nil
}
