package repository

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"tembus/order-service/internal/domain"
	"time"
)

type mapsRepo struct {
	gatewayURL     string
	internalAPIKey string
	httpClient     *http.Client
}

func NewMapsRepository(apiKey string) (domain.MapsRepository, error) {
	// apiKey is ignored because we hit the gateway, but we keep the signature 
	// for backward compatibility with cmd/api/main.go.
	gatewayURL := strings.TrimRight(os.Getenv("INTEGRATION_GATEWAY_URL"), "/")
	if gatewayURL == "" {
		gatewayURL = "http://integration-gateway:8085"
	}
	internalAPIKey := os.Getenv("INTERNAL_API_KEY")

	timeout := 15 * time.Second

	return &mapsRepo{
		gatewayURL:     gatewayURL,
		internalAPIKey: internalAPIKey,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}, nil
}

type DistanceMatrixRequest struct {
	OriginLat  float64 `json:"origin_lat"`
	OriginLng  float64 `json:"origin_lng"`
	DestLat    float64 `json:"dest_lat"`
	DestLng    float64 `json:"dest_lng"`
	UseTraffic bool    `json:"use_traffic"`
}

type DistanceMatrixResponse struct {
	DistanceKM  float64 `json:"distance_km"`
	DurationMin float64 `json:"duration_min"`
	OriginAddr  string  `json:"origin_addr"`
	DestAddr    string  `json:"dest_addr"`
}

func (r *mapsRepo) GetDistanceMatrix(ctx context.Context, originLat, originLng, destLat, destLng float64, useTraffic bool) (float64, float64, string, string, error) {
	payload := DistanceMatrixRequest{
		OriginLat:  originLat,
		OriginLng:  originLng,
		DestLat:    destLat,
		DestLng:    destLng,
		UseTraffic: useTraffic,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return 0, 0, "", "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.gatewayURL+"/api/internal/maps/distance-matrix", bytes.NewReader(body))
	if err != nil {
		return 0, 0, "", "", fmt.Errorf("maps gateway request invalid: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if r.internalAPIKey != "" {
		req.Header.Set("X-Internal-Api-Key", r.internalAPIKey)
	}

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return 0, 0, "", "", fmt.Errorf("maps gateway request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return 0, 0, "", "", fmt.Errorf("maps gateway api error: status %d", resp.StatusCode)
	}

	var result DistanceMatrixResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, 0, "", "", fmt.Errorf("maps gateway response invalid: %w", err)
	}

	return result.DistanceKM, result.DurationMin, result.OriginAddr, result.DestAddr, nil
}

type OptimizeWaypointsRequest struct {
	Origin     domain.Waypoint   `json:"origin"`
	Waypoints  []domain.Waypoint `json:"waypoints"`
	Dest       domain.Waypoint   `json:"dest"`
	UseTraffic bool              `json:"use_traffic"`
}

func (r *mapsRepo) OptimizeWaypoints(ctx context.Context, origin domain.Waypoint, waypoints []domain.Waypoint, dest domain.Waypoint, useTraffic bool) (*domain.OptimizedRouteResult, error) {
	payload := OptimizeWaypointsRequest{
		Origin:     origin,
		Waypoints:  waypoints,
		Dest:       dest,
		UseTraffic: useTraffic,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.gatewayURL+"/api/internal/maps/optimize-waypoints", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("maps gateway optimize request invalid: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if r.internalAPIKey != "" {
		req.Header.Set("X-Internal-Api-Key", r.internalAPIKey)
	}

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("maps gateway optimize request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("maps gateway optimize api error: status %d", resp.StatusCode)
	}

	var result domain.OptimizedRouteResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("maps gateway optimize response invalid: %w", err)
	}

	return &result, nil
}
