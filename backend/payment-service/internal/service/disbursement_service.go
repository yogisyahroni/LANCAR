package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"tembus/payment-service/internal/featureflags"
	"time"
)

type DisbursementService struct {
	gatewayUrl     string
	internalAPIKey string
	httpClient     *http.Client
	flagReader     featureflags.FlagReader
}

func NewDisbursementService(flagReader featureflags.FlagReader) *DisbursementService {
	gatewayUrl := os.Getenv("INTEGRATION_GATEWAY_URL")
	if gatewayUrl == "" {
		gatewayUrl = "http://integration-gateway:8085"
	}
	
	return &DisbursementService{
		gatewayUrl:     gatewayUrl,
		internalAPIKey: os.Getenv("INTERNAL_API_KEY"),
		httpClient:     &http.Client{Timeout: 15 * time.Second},
		flagReader:     flagReader,
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

	// Check Feature Flag for Payment Provider
	if s.flagReader != nil {
		flag, err := s.flagReader.GetFlag(ctx, "payment_provider_xendit")
		if err == nil && flag != nil && flag.IsEnabled {
			req.Header.Set("X-Payment-Provider", "xendit")
		} else {
			req.Header.Set("X-Payment-Provider", "midtrans")
		}
	} else {
		req.Header.Set("X-Payment-Provider", "midtrans")
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
