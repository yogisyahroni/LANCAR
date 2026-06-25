package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

type DisbursementService struct {
	gatewayUrl     string
	internalAPIKey string
	httpClient     *http.Client
}

func NewDisbursementService() *DisbursementService {
	gatewayUrl := os.Getenv("INTEGRATION_GATEWAY_URL")
	if gatewayUrl == "" {
		gatewayUrl = "http://integration-gateway:8085"
	}
	
	return &DisbursementService{
		gatewayUrl:     gatewayUrl,
		internalAPIKey: os.Getenv("INTERNAL_API_KEY"),
		httpClient:     &http.Client{Timeout: 15 * time.Second},
	}
}

type disbursementRequest struct {
	ReferenceID        string  `json:"ReferenceID"`
	Amount             float64 `json:"Amount"`
	BeneficiaryName    string  `json:"BeneficiaryName"`
	BeneficiaryAccount string  `json:"BeneficiaryAccount"`
	BeneficiaryBank    string  `json:"BeneficiaryBank"`
	Notes              string  `json:"Notes"`
}

type disbursementResponse struct {
	Status string `json:"Status"`
}

func (s *DisbursementService) CreatePayout(ctx context.Context, referenceID string, amount float64, bankDetails map[string]any) error {
	// Prepare payload for integration-gateway
	payload := disbursementRequest{
		ReferenceID:        referenceID,
		Amount:             amount,
		BeneficiaryName:    fmt.Sprintf("%v", bankDetails["account_holder"]),
		BeneficiaryAccount: fmt.Sprintf("%v", bankDetails["account_number"]),
		BeneficiaryBank:    fmt.Sprintf("%v", bankDetails["bank_name"]),
		Notes:              fmt.Sprintf("Withdrawal %s", referenceID),
	}

	jsonBody, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", s.gatewayUrl+"/api/internal/payment/disburse", bytes.NewReader(jsonBody))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	if s.internalAPIKey != "" {
		req.Header.Set("X-Internal-Api-Key", s.internalAPIKey)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("payment gateway request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		var errResp map[string]any
		json.NewDecoder(resp.Body).Decode(&errResp)
		return fmt.Errorf("payment gateway error: %v", errResp)
	}

	return nil
}
