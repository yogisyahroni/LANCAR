package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"tembus/integration-gateway/internal/domain"
)

// HTTPPOSAdapter is the provider boundary for a POS/KDS connector. A HTTP
// 2xx alone is not an acknowledgement: the provider must return accepted=true
// in its response body. This prevents a network/proxy success from being
// presented as a merchant receipt.
type HTTPPOSAdapter struct {
	code    string
	name    string
	baseURL string
	apiKey  string
	client  *http.Client

	mu                  sync.Mutex
	consecutiveFailures int
	lastError           string
	lastLatencyMS       int64
	lastCheckedAt       time.Time
}

func NewHTTPPOSAdapter(code, name, baseURL, apiKey string) *HTTPPOSAdapter {
	return &HTTPPOSAdapter{
		code:    strings.ToLower(strings.TrimSpace(code)),
		name:    strings.TrimSpace(name),
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		apiKey:  strings.TrimSpace(apiKey),
		client:  &http.Client{Timeout: 8 * time.Second},
	}
}

func (a *HTTPPOSAdapter) ReceiveOrder(ctx context.Context, req domain.POSOrderRequest) (*domain.POSOrderReceipt, error) {
	if len(req.Payload) == 0 {
		return nil, errors.New("POS order payload is empty")
	}
	var receipt domain.POSOrderReceipt
	if err := a.postJSON(ctx, "/orders", req.IdempotencyKey, req.Payload, &receipt); err != nil {
		return nil, err
	}
	if !receipt.Accepted {
		return nil, errors.New("POS provider did not acknowledge order receipt")
	}
	return &receipt, nil
}

func (a *HTTPPOSAdapter) SyncCatalog(ctx context.Context, req domain.POSCatalogSyncRequest) (*domain.POSSynchronizationReceipt, error) {
	if len(req.Payload) == 0 {
		return nil, errors.New("POS catalog payload is empty")
	}
	var receipt domain.POSSynchronizationReceipt
	if err := a.postJSON(ctx, "/catalog", req.IdempotencyKey, req.Payload, &receipt); err != nil {
		return nil, err
	}
	if !receipt.Accepted {
		return nil, errors.New("POS provider did not acknowledge catalog sync")
	}
	return &receipt, nil
}

func (a *HTTPPOSAdapter) SyncInventory(ctx context.Context, req domain.POSInventorySyncRequest) (*domain.POSSynchronizationReceipt, error) {
	if len(req.Payload) == 0 {
		return nil, errors.New("POS inventory payload is empty")
	}
	var receipt domain.POSSynchronizationReceipt
	if err := a.postJSON(ctx, "/inventory", req.IdempotencyKey, req.Payload, &receipt); err != nil {
		return nil, err
	}
	if !receipt.Accepted {
		return nil, errors.New("POS provider did not acknowledge inventory sync")
	}
	return &receipt, nil
}

func (a *HTTPPOSAdapter) CheckHealth(ctx context.Context) domain.POSHealth {
	health := domain.POSHealth{
		ProviderCode: a.code,
		ProviderName: a.name,
		Capabilities: []domain.POSCapability{
			domain.POSCapabilityOrderReceipt,
			domain.POSCapabilityCatalogSync,
			domain.POSCapabilityInventorySync,
			domain.POSCapabilityHealth,
		},
	}
	if a.baseURL == "" {
		health.State = "unconfigured"
		health.AvailabilityReason = "POS_PROVIDER_URL is not configured"
		return health
	}
	if ctx == nil {
		ctx = context.Background()
	}
	started := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.baseURL+"/health", nil)
	if err != nil {
		a.recordFailure(err)
		health.State = "unhealthy"
		health.AvailabilityReason = "health request could not be created"
		return a.withRuntimeHealth(health, time.Since(started))
	}
	a.setAuth(req)
	resp, err := a.client.Do(req)
	if err != nil {
		a.recordFailure(err)
		health.State = "unhealthy"
		health.AvailabilityReason = "POS health endpoint is unreachable"
		return a.withRuntimeHealth(health, time.Since(started))
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		err = fmt.Errorf("POS health endpoint returned status %d", resp.StatusCode)
		a.recordFailure(err)
		health.State = "unhealthy"
		health.AvailabilityReason = "POS health endpoint reported failure"
		return a.withRuntimeHealth(health, time.Since(started))
	}
	a.recordSuccess(time.Since(started))
	health.State = "healthy"
	return a.withRuntimeHealth(health, time.Since(started))
}

func (a *HTTPPOSAdapter) postJSON(ctx context.Context, path, idempotencyKey string, payload []byte, result any) error {
	if a.baseURL == "" {
		return errors.New("POS provider is not configured")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("create POS request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Idempotency-Key", idempotencyKey)
	a.setAuth(req)
	started := time.Now()
	resp, err := a.client.Do(req)
	if err != nil {
		a.recordFailure(err)
		return errors.New("POS provider request failed")
	}
	defer resp.Body.Close()
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if readErr != nil {
		a.recordFailure(readErr)
		return errors.New("POS provider response could not be read")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		err = fmt.Errorf("POS provider returned status %d", resp.StatusCode)
		a.recordFailure(err)
		return errors.New("POS provider rejected request")
	}
	if err := json.Unmarshal(body, result); err != nil {
		a.recordFailure(err)
		return errors.New("POS provider response did not contain an acknowledgement")
	}
	a.recordSuccess(time.Since(started))
	return nil
}

func (a *HTTPPOSAdapter) setAuth(req *http.Request) {
	if a.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+a.apiKey)
	}
}

func (a *HTTPPOSAdapter) recordSuccess(latency time.Duration) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.consecutiveFailures = 0
	a.lastError = ""
	a.lastLatencyMS = latency.Milliseconds()
	a.lastCheckedAt = time.Now().UTC()
}

func (a *HTTPPOSAdapter) recordFailure(err error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.consecutiveFailures++
	a.lastError = err.Error()
	a.lastCheckedAt = time.Now().UTC()
}

func (a *HTTPPOSAdapter) withRuntimeHealth(health domain.POSHealth, latency time.Duration) domain.POSHealth {
	a.mu.Lock()
	defer a.mu.Unlock()
	health.ConsecutiveFailures = a.consecutiveFailures
	health.LastError = a.lastError
	health.LastLatencyMS = latency.Milliseconds()
	health.LastCheckedAt = a.lastCheckedAt.Format(time.RFC3339Nano)
	return health
}
