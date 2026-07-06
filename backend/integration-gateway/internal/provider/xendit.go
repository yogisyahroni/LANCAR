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

type XenditProvider struct {
	secretKey  string
	httpClient *http.Client
}

func NewXenditProvider() *XenditProvider {
	return &XenditProvider{
		secretKey:  os.Getenv("XENDIT_SECRET_KEY"),
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (x *XenditProvider) CreateInvoice(ctx context.Context, req domain.InvoiceRequest) (*domain.InvoiceResponse, error) {
	if x.secretKey == "" {
		return nil, errors.New("XENDIT_SECRET_KEY is not configured")
	}

	payload := map[string]any{
		"external_id":      req.ReferenceID,
		"amount":           req.Amount,
		"payer_email":      req.CustomerEmail,
		"description":      req.Description,
		"customer": map[string]any{
			"given_names": req.CustomerName,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.xendit.co/v2/invoices", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(x.secretKey+":")))

	resp, err := x.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("xendit create invoice request failed: %w", err)
	}
	defer resp.Body.Close()

	var data struct {
		ID         string `json:"id"`
		InvoiceURL string `json:"invoice_url"`
		ErrorCode  string `json:"error_code"`
		Message    string `json:"message"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("failed to parse xendit response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("xendit rejected invoice: %s - %s", data.ErrorCode, data.Message)
	}

	return &domain.InvoiceResponse{
		Token:      data.ID,
		InvoiceURL: data.InvoiceURL,
	}, nil
}

func (x *XenditProvider) CreateDisbursement(ctx context.Context, req domain.DisbursementRequest) (*domain.DisbursementResponse, error) {
	if x.secretKey == "" {
		return nil, errors.New("XENDIT_SECRET_KEY is not configured")
	}

	payload := map[string]any{
		"external_id":          req.ReferenceID,
		"amount":               req.Amount,
		"bank_code":            req.BeneficiaryBank,
		"account_holder_name":  req.BeneficiaryName,
		"account_number":       req.BeneficiaryAccount,
		"description":          req.Notes,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.xendit.co/disbursements", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(x.secretKey+":")))
	httpReq.Header.Set("X-Idempotency-Key", req.ReferenceID)

	resp, err := x.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("xendit disbursement request failed: %w", err)
	}
	defer resp.Body.Close()

	var data struct {
		ID        string `json:"id"`
		Status    string `json:"status"`
		ErrorCode string `json:"error_code"`
		Message   string `json:"message"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("failed to parse xendit response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("xendit rejected disbursement: %s - %s", data.ErrorCode, data.Message)
	}

	return &domain.DisbursementResponse{
		Status: data.Status,
	}, nil
}
