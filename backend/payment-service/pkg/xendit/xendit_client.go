package xendit

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	secretKey string
	baseURL   string
	client    *http.Client
}

func NewClient(secretKey string) *Client {
	return &Client{
		secretKey: secretKey,
		baseURL:   "https://api.xendit.co",
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

type CreateInvoiceRequest struct {
	ExternalID      string   `json:"external_id"`
	Amount          int64    `json:"amount"`
	Description     string   `json:"description,omitempty"`
	Customer        Customer `json:"customer,omitempty"`
	CustomerDetails *CustomerDetails `json:"customer_details,omitempty"`
	SuccessRedirectURL string `json:"success_redirect_url,omitempty"`
	FailureRedirectURL string `json:"failure_redirect_url,omitempty"`
}

type Customer struct {
	GivenNames   string `json:"given_names,omitempty"`
	Email        string `json:"email,omitempty"`
	MobileNumber string `json:"mobile_number,omitempty"`
}

type CustomerDetails struct {
	GivenNames   string `json:"given_names,omitempty"`
	Email        string `json:"email,omitempty"`
	MobileNumber string `json:"mobile_number,omitempty"`
}

type InvoiceResponse struct {
	ID                        string `json:"id"`
	ExternalID                string `json:"external_id"`
	Status                    string `json:"status"`
	Amount                    int64  `json:"amount"`
	InvoiceURL                string `json:"invoice_url"`
	AvailableBanks            []Bank `json:"available_banks,omitempty"`
	AvailableRetailOutlets    []RetailOutlet `json:"available_retail_outlets,omitempty"`
	AvailableEwallets         []Ewallet `json:"available_ewallets,omitempty"`
	AvailableQRcodes          []QRcode `json:"available_qr_codes,omitempty"`
}

type Bank struct {
	BankCode      string `json:"bank_code"`
	CollectionType string `json:"collection_type"`
	BankAccountNumber string `json:"bank_account_number"`
	TransferAmount int64 `json:"transfer_amount"`
}

type RetailOutlet struct {
	RetailOutletName string `json:"retail_outlet_name"`
	PaymentCode      string `json:"payment_code"`
}

type Ewallet struct {
	EwalletType string `json:"ewallet_type"`
}

type QRcode struct {
	QRCodeType string `json:"qr_code_type"`
}

func (c *Client) CreateInvoice(ctx context.Context, req CreateInvoiceRequest) (*InvoiceResponse, error) {
	bodyBytes, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal invoice req: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v2/invoices", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}

	httpReq.SetBasicAuth(c.secretKey, "")
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("xendit request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("xendit returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var invResp InvoiceResponse
	if err := json.Unmarshal(respBody, &invResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal invoice response: %w", err)
	}

	return &invResp, nil
}

type CreateDisbursementRequest struct {
	ExternalID        string `json:"external_id"`
	Amount            int64  `json:"amount"`
	BankCode          string `json:"bank_code"`
	AccountHolderName string `json:"account_holder_name"`
	AccountNumber     string `json:"account_number"`
	Description       string `json:"description,omitempty"`
}

type DisbursementResponse struct {
	ID                string `json:"id"`
	ExternalID        string `json:"external_id"`
	Amount            int64  `json:"amount"`
	BankCode          string `json:"bank_code"`
	AccountHolderName string `json:"account_holder_name"`
	AccountNumber     string `json:"account_number"`
	Description       string `json:"description"`
	Status            string `json:"status"` // PENDING, COMPLETED, FAILED
}

func (c *Client) CreateDisbursement(ctx context.Context, req CreateDisbursementRequest) (*DisbursementResponse, error) {
	bodyBytes, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal disbursement req: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/disbursements", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}

	httpReq.SetBasicAuth(c.secretKey, "")
	httpReq.Header.Set("Content-Type", "application/json")
	// Idempotency key using ExternalID
	httpReq.Header.Set("X-Idempotency-Key", req.ExternalID)

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("xendit request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("xendit returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var disResp DisbursementResponse
	if err := json.Unmarshal(respBody, &disResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal disbursement response: %w", err)
	}

	return &disResp, nil
}
