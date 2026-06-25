package provider

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"tembus/integration-gateway/internal/domain"
	"time"
)

type MidtransProvider struct {
	serverKey  string
	irisKey    string
	env        string
	httpClient *http.Client
}

func NewMidtransProvider() *MidtransProvider {
	return &MidtransProvider{
		serverKey:  os.Getenv("MIDTRANS_SERVER_KEY"),
		irisKey:    os.Getenv("MIDTRANS_IRIS_API_KEY"),
		env:        os.Getenv("MIDTRANS_ENV"), // "production" or "sandbox"
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (m *MidtransProvider) snapURL() string {
	if m.env == "production" {
		return "https://app.midtrans.com/snap/v1/transactions"
	}
	return "https://app.sandbox.midtrans.com/snap/v1/transactions"
}

func (m *MidtransProvider) irisURL() string {
	if m.env == "production" {
		return "https://app.midtrans.com/iris/api/v1"
	}
	return "https://app.sandbox.midtrans.com/iris/api/v1"
}

func (m *MidtransProvider) CreateInvoice(ctx context.Context, req domain.InvoiceRequest) (*domain.InvoiceResponse, error) {
	if m.serverKey == "" {
		return nil, errors.New("MIDTRANS_SERVER_KEY is not configured")
	}

	payload := map[string]any{
		"transaction_details": map[string]any{
			"order_id":     req.ReferenceID,
			"gross_amount": req.Amount,
		},
		"customer_details": map[string]any{
			"first_name": req.CustomerName,
			"email":      req.CustomerEmail,
		},
		"credit_card": map[string]any{
			"secure": true,
		},
		"expiry": map[string]any{
			"unit":     "minutes",
			"duration": 30,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, m.snapURL(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(m.serverKey+":")))

	resp, err := m.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("midtrans snap request failed: %w", err)
	}
	defer resp.Body.Close()

	var snap struct {
		Token       string `json:"token"`
		RedirectURL string `json:"redirect_url"`
		Message     string `json:"message"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&snap); err != nil {
		return nil, fmt.Errorf("failed to parse midtrans snap response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if snap.Message != "" {
			return nil, fmt.Errorf("midtrans snap rejected: %s", snap.Message)
		}
		return nil, fmt.Errorf("midtrans snap rejected with status %d", resp.StatusCode)
	}

	return &domain.InvoiceResponse{
		Token:      snap.Token,
		InvoiceURL: snap.RedirectURL,
	}, nil
}

type payoutData struct {
	BeneficiaryName    string `json:"beneficiary_name"`
	BeneficiaryAccount string `json:"beneficiary_account"`
	BeneficiaryBank    string `json:"beneficiary_bank"`
	Amount             string `json:"amount"`
	Notes              string `json:"notes"`
}

type disbursementRequestMidtrans struct {
	Payouts []payoutData `json:"payouts"`
}

func (m *MidtransProvider) CreateDisbursement(ctx context.Context, req domain.DisbursementRequest) (*domain.DisbursementResponse, error) {
	if m.irisKey == "" {
		fmt.Println("[WARNING] MIDTRANS_IRIS_API_KEY is not set. Skipping real disbursement.")
		return &domain.DisbursementResponse{Status: "skipped_no_key"}, nil
	}

	payout := payoutData{
		BeneficiaryName:    req.BeneficiaryName,
		BeneficiaryAccount: req.BeneficiaryAccount,
		BeneficiaryBank:    req.BeneficiaryBank,
		Amount:             fmt.Sprintf("%.0f", req.Amount),
		Notes:              req.Notes,
	}

	reqBody := disbursementRequestMidtrans{
		Payouts: []payoutData{payout},
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, m.irisURL()+"/payouts", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}

	auth := base64.StdEncoding.EncodeToString([]byte(m.irisKey + ":"))
	httpReq.Header.Set("Authorization", "Basic "+auth)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Idempotency-Key", req.ReferenceID)

	resp, err := m.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		var errResp map[string]any
		json.NewDecoder(resp.Body).Decode(&errResp)
		return nil, fmt.Errorf("midtrans iris error: %v", errResp)
	}

	return &domain.DisbursementResponse{Status: "pending"}, nil
}
