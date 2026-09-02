package worker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"tembus/integration-gateway/internal/domain"
)

type HTTPTrackingPollSource struct {
	baseURL string
	apiKey  string
	client  *http.Client
}

func NewHTTPTrackingPollSource(baseURL, apiKey string) *HTTPTrackingPollSource {
	return &HTTPTrackingPollSource{baseURL: strings.TrimRight(baseURL, "/"), apiKey: apiKey, client: &http.Client{Timeout: 10 * time.Second}}
}

func (s *HTTPTrackingPollSource) ListTrackingPollTargets(ctx context.Context) ([]domain.TrackingPollTarget, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, s.baseURL+"/api/v1/internal/delivery/tracking-poll-targets", nil)
	if err != nil {
		return nil, err
	}
	if s.apiKey != "" {
		request.Header.Set("X-Internal-Api-Key", s.apiKey)
	}
	response, err := s.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("load tracking poll targets: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return nil, fmt.Errorf("tracking poll target source returned %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
	}
	var payload struct {
		Targets []domain.TrackingPollTarget `json:"targets"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode tracking poll targets: %w", err)
	}
	return payload.Targets, nil
}

type HTTPTrackingEventSink struct {
	baseURL string
	apiKey  string
	client  *http.Client
}

func NewHTTPTrackingEventSink(baseURL, apiKey string) *HTTPTrackingEventSink {
	return &HTTPTrackingEventSink{baseURL: strings.TrimRight(baseURL, "/"), apiKey: apiKey, client: &http.Client{Timeout: 10 * time.Second}}
}

func (s *HTTPTrackingEventSink) PublishCarrierEvent(ctx context.Context, event domain.CarrierEvent) error {
	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("encode polled carrier event: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/api/v1/internal/delivery/webhook", bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	if s.apiKey != "" {
		request.Header.Set("X-Internal-Api-Key", s.apiKey)
	}
	response, err := s.client.Do(request)
	if err != nil {
		return fmt.Errorf("publish polled carrier event: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		responseBody, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return fmt.Errorf("carrier event sink returned %d: %s", response.StatusCode, strings.TrimSpace(string(responseBody)))
	}
	return nil
}
