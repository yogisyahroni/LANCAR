package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

type DisbursementService struct {
	apiKey     string
	baseUrl    string
	httpClient *http.Client
}

func NewDisbursementService() *DisbursementService {
	// Midtrans Iris API Key should be set in environment variables
	apiKey := os.Getenv("MIDTRANS_IRIS_API_KEY")
	baseUrl := "https://app.sandbox.midtrans.com/iris/api/v1" // Use production URL for live
	
	if os.Getenv("ENVIRONMENT") == "production" {
		baseUrl = "https://app.midtrans.com/iris/api/v1"
	}

	return &DisbursementService{
		apiKey:     apiKey,
		baseUrl:    baseUrl,
		httpClient: &http.Client{},
	}
}

type DisbursementRequest struct {
	Payouts []Payout `json:"payouts"`
}

type Payout struct {
	BeneficiaryName   string `json:"beneficiary_name"`
	BeneficiaryAccount string `json:"beneficiary_account"`
	BeneficiaryBank    string `json:"beneficiary_bank"`
	Amount             string `json:"amount"`
	Notes              string `json:"notes"`
}

func (s *DisbursementService) CreatePayout(ctx context.Context, referenceID string, amount float64, bankDetails map[string]any) error {
	if s.apiKey == "" {
		fmt.Println("[WARNING] MIDTRANS_IRIS_API_KEY is not set. Skipping real disbursement.")
		return nil
	}

	// Prepare Payout Data
	payout := Payout{
		BeneficiaryName:    fmt.Sprintf("%v", bankDetails["account_holder"]),
		BeneficiaryAccount: fmt.Sprintf("%v", bankDetails["account_number"]),
		BeneficiaryBank:    fmt.Sprintf("%v", bankDetails["bank_name"]),
		Amount:             fmt.Sprintf("%.0f", amount),
		Notes:              fmt.Sprintf("Withdrawal %s", referenceID),
	}

	reqBody := DisbursementRequest{
		Payouts: []Payout{payout},
	}

	jsonBody, _ := json.Marshal(reqBody)

	req, err := http.NewRequestWithContext(ctx, "POST", s.baseUrl+"/payouts", bytes.NewBuffer(jsonBody))
	if err != nil {
		return err
	}

	// Midtrans Iris uses Basic Auth (API Key as username, password empty)
	auth := base64.StdEncoding.EncodeToString([]byte(s.apiKey + ":"))
	req.Header.Set("Authorization", "Basic "+auth)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Idempotency-Key", referenceID) // Very important for safety

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		var errResp map[string]any
		json.NewDecoder(resp.Body).Decode(&errResp)
		return fmt.Errorf("midtrans iris error: %v", errResp)
	}

	return nil
}
