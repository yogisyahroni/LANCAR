package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"tembus/integration-gateway/internal/domain"
	"time"
)

type TomTomProvider struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

type tomTomRouteResponse struct {
	Routes []struct {
		Summary struct {
			LengthInMeters     float64 `json:"lengthInMeters"`
			TravelTimeSeconds  float64 `json:"travelTimeInSeconds"`
			TrafficDelaySecond float64 `json:"trafficDelayInSeconds"`
		} `json:"summary"`
	} `json:"routes"`
	OptimizedWaypoints []struct {
		ProvidedIndex  int `json:"providedIndex"`
		OptimizedIndex int `json:"optimizedIndex"`
	} `json:"optimizedWaypoints"`
}

func NewTomTomProvider() (*TomTomProvider, error) {
	apiKey := os.Getenv("TOMTOM_SERVER_API_KEY")
	if strings.TrimSpace(apiKey) == "" {
		return nil, fmt.Errorf("TOMTOM_SERVER_API_KEY is not configured")
	}

	baseURL := strings.TrimRight(os.Getenv("TOMTOM_ROUTING_API_URL"), "/")
	if baseURL == "" {
		baseURL = "https://api.tomtom.com/routing/1"
	}

	timeout := 6 * time.Second
	if rawTimeout := strings.TrimSpace(os.Getenv("TOMTOM_ROUTING_TIMEOUT_MS")); rawTimeout != "" {
		if parsed, err := time.ParseDuration(rawTimeout + "ms"); err == nil && parsed >= time.Second && parsed <= 15*time.Second {
			timeout = parsed
		}
	}

	return &TomTomProvider{
		apiKey:  strings.TrimSpace(apiKey),
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}, nil
}

func (p *TomTomProvider) GetDistanceMatrix(ctx context.Context, originLat, originLng, destLat, destLng float64, useTraffic bool) (float64, float64, string, string, error) {
	coordinates := fmt.Sprintf("%.6f,%.6f:%.6f,%.6f", originLat, originLng, destLat, destLng)
	endpoint := fmt.Sprintf("%s/calculateRoute/%s/json", p.baseURL, coordinates)
	requestURL, err := url.Parse(endpoint)
	if err != nil {
		return 0, 0, "", "", fmt.Errorf("tomtom route endpoint invalid: %w", err)
	}

	query := requestURL.Query()
	query.Set("key", p.apiKey)
	if useTraffic {
		query.Set("traffic", "true")
	} else {
		query.Set("traffic", "false")
	}
	query.Set("travelMode", "car")
	query.Set("routeRepresentation", "summaryOnly")
	query.Set("computeTravelTimeFor", "all")
	query.Set("language", "id-ID")
	requestURL.RawQuery = query.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL.String(), nil)
	if err != nil {
		return 0, 0, "", "", fmt.Errorf("tomtom route request invalid: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "TEMBUS-IntegrationGateway/1.0")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return 0, 0, "", "", fmt.Errorf("tomtom routing request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return 0, 0, "", "", fmt.Errorf("tomtom routing api error: status %d", resp.StatusCode)
	}

	var payload tomTomRouteResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return 0, 0, "", "", fmt.Errorf("tomtom routing response invalid: %w", err)
	}
	if len(payload.Routes) == 0 {
		return 0, 0, "", "", fmt.Errorf("tomtom routing returned no routes")
	}

	summary := payload.Routes[0].Summary
	if summary.LengthInMeters <= 0 || summary.TravelTimeSeconds <= 0 {
		return 0, 0, "", "", fmt.Errorf("tomtom routing summary invalid")
	}

	distKM := summary.LengthInMeters / 1000.0
	durMin := summary.TravelTimeSeconds / 60.0
	originAddr := fmt.Sprintf("%.6f, %.6f", originLat, originLng)
	destAddr := fmt.Sprintf("%.6f, %.6f", destLat, destLng)

	return distKM, durMin, originAddr, destAddr, nil
}

func (p *TomTomProvider) OptimizeWaypoints(ctx context.Context, origin domain.Waypoint, waypoints []domain.Waypoint, dest domain.Waypoint, useTraffic bool) (*domain.OptimizedRouteResult, error) {
	if len(waypoints) == 0 {
		return nil, fmt.Errorf("no waypoints provided")
	}

	var coords []string
	coords = append(coords, fmt.Sprintf("%.6f,%.6f", origin.Lat, origin.Lng))
	for _, wp := range waypoints {
		coords = append(coords, fmt.Sprintf("%.6f,%.6f", wp.Lat, wp.Lng))
	}
	coords = append(coords, fmt.Sprintf("%.6f,%.6f", dest.Lat, dest.Lng))

	coordinates := strings.Join(coords, ":")
	endpoint := fmt.Sprintf("%s/calculateRoute/%s/json", p.baseURL, coordinates)
	requestURL, err := url.Parse(endpoint)
	if err != nil {
		return nil, fmt.Errorf("tomtom route endpoint invalid: %w", err)
	}

	query := requestURL.Query()
	query.Set("key", p.apiKey)
	if useTraffic {
		query.Set("traffic", "true")
	} else {
		query.Set("traffic", "false")
	}
	query.Set("travelMode", "car")
	query.Set("routeRepresentation", "summaryOnly")
	query.Set("computeBestOrder", "true")
	requestURL.RawQuery = query.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("tomtom optimize request invalid: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "TEMBUS-IntegrationGateway/1.0")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("tomtom optimize request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("tomtom optimize api error: status %d", resp.StatusCode)
	}

	var payload tomTomRouteResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("tomtom optimize response invalid: %w", err)
	}
	if len(payload.Routes) == 0 {
		return nil, fmt.Errorf("tomtom optimize returned no routes")
	}

	summary := payload.Routes[0].Summary
	distKM := summary.LengthInMeters / 1000.0
	durMin := summary.TravelTimeSeconds / 60.0

	var optimizedIndices []int
	if len(payload.OptimizedWaypoints) > 0 {
		optimizedIndices = make([]int, len(payload.OptimizedWaypoints))
		for _, ow := range payload.OptimizedWaypoints {
			if ow.OptimizedIndex >= 0 && ow.OptimizedIndex < len(optimizedIndices) {
				optimizedIndices[ow.OptimizedIndex] = ow.ProvidedIndex
			}
		}
	} else {
		// Fallback if no optimization happened (e.g. only 1 waypoint)
		for i := 0; i < len(waypoints); i++ {
			optimizedIndices = append(optimizedIndices, i)
		}
	}

	return &domain.OptimizedRouteResult{
		DistanceKM:       distKM,
		DurationMin:      durMin,
		OptimizedIndices: optimizedIndices,
	}, nil
}
