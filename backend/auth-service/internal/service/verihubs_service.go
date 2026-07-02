package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

type VerihubsLiveness struct {
	appID      string
	apiKey     string
	apiURL     string
	httpClient *http.Client
}

func NewVerihubsLiveness(appID, apiKey string) *VerihubsLiveness {
	apiURL := os.Getenv("VERIHUBS_API_URL")
	if apiURL == "" {
		apiURL = "https://api.verihubs.com/v1/liveness" // Default
	}

	return &VerihubsLiveness{
		appID:  appID,
		apiKey: apiKey,
		apiURL: apiURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

type verihubsRequest struct {
	Image string `json:"image"` // Base64
}

type verihubsResponse struct {
	Data struct {
		Liveness struct {
			Passed bool    `json:"passed"`
			Score  float64 `json:"score"`
		} `json:"liveness"`
	} `json:"data"`
	Message string `json:"message"`
}

func (s *VerihubsLiveness) Verify(ctx context.Context, imageBase64 string) (bool, error) {
	if s.appID == "" || s.apiKey == "" {
		return false, fmt.Errorf("verihubs credentials not configured")
	}

	if !strings.HasPrefix(s.apiURL, "https://") {
		return false, fmt.Errorf("insecure or invalid API URL: %s", s.apiURL)
	}

	reqBody, _ := json.Marshal(verihubsRequest{Image: imageBase64})
	req, err := http.NewRequestWithContext(ctx, "POST", s.apiURL, bytes.NewBuffer(reqBody))

	if err != nil {
		return false, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("App-ID", s.appID)
	req.Header.Set("API-Key", s.apiKey)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("verihubs returned status %d", resp.StatusCode)
	}

	var vResp verihubsResponse
	if err := json.NewDecoder(resp.Body).Decode(&vResp); err != nil {
		return false, err
	}

	// Logic threshold for production
	return vResp.Data.Liveness.Passed && vResp.Data.Liveness.Score > 0.8, nil
}
