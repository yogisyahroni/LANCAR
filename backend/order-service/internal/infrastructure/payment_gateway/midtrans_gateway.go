package payment_gateway

import (
	"bytes"
	"context"
	"crypto/sha512"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"tembus/order-service/internal/domain"
)

type MidtransConfig struct {
	ServerKey string
	IsProd    bool
}

type MidtransGateway struct {
	config MidtransConfig
}

func NewMidtransGateway(config MidtransConfig) *MidtransGateway {
	return &MidtransGateway{
		config: config,
	}
}

func (g *MidtransGateway) coreAPIURL() string {
	if g.config.IsProd {
		return "https://api.midtrans.com/v2/charge"
	}
	return "https://api.sandbox.midtrans.com/v2/charge"
}

type midtransChargeAction struct {
	Name   string `json:"name"`
	URL    string `json:"url"`
	Method string `json:"method"`
}

type midtransChargeResponse struct {
	TransactionID string                 `json:"transaction_id"`
	OrderID       string                 `json:"order_id"`
	StatusCode    string                 `json:"status_code"`
	StatusMessage string                 `json:"status_message"`
	FraudStatus   string                 `json:"fraud_status"`
	Actions       []midtransChargeAction `json:"actions"`
}

func (g *MidtransGateway) GenerateQRIS(ctx context.Context, req domain.PaymentGatewayRequest) (domain.PaymentGatewayResponse, error) {
	if g.config.ServerKey == "" {
		return domain.PaymentGatewayResponse{}, fmt.Errorf("MIDTRANS_SERVER_KEY is not configured")
	}
	if req.AmountIDR <= 0 {
		return domain.PaymentGatewayResponse{}, fmt.Errorf("payment amount must be greater than zero")
	}

	payload := map[string]any{
		"payment_type": "qris",
		"transaction_details": map[string]any{
			"order_id":     req.PaymentNumber,
			"gross_amount": req.AmountIDR,
		},
		"custom_field1": req.OrderID,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return domain.PaymentGatewayResponse{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, g.coreAPIURL(), bytes.NewReader(body))
	if err != nil {
		return domain.PaymentGatewayResponse{}, err
	}
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(g.config.ServerKey+":")))

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return domain.PaymentGatewayResponse{}, fmt.Errorf("midtrans qris request failed: %w", err)
	}
	defer resp.Body.Close()

	var data midtransChargeResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return domain.PaymentGatewayResponse{}, fmt.Errorf("failed to parse midtrans qris response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if data.StatusMessage != "" {
			return domain.PaymentGatewayResponse{}, fmt.Errorf("midtrans qris rejected payment: %s", data.StatusMessage)
		}
		return domain.PaymentGatewayResponse{}, fmt.Errorf("midtrans qris rejected payment with status %d", resp.StatusCode)
	}

	var qrCodeURL string
	for _, action := range data.Actions {
		if action.Name == "generate-qr-code" {
			qrCodeURL = action.URL
			break
		}
	}
	if qrCodeURL == "" {
		return domain.PaymentGatewayResponse{}, fmt.Errorf("midtrans qris response did not include QR code action")
	}

	return domain.PaymentGatewayResponse{
		ProviderReference: data.TransactionID,
		QRCodeURL:         qrCodeURL,
		QRCodeString:      "",
	}, nil
}

func (g *MidtransGateway) VerifyWebhookSignature(ctx context.Context, payload []byte, signature string) error {
	// Midtrans signature formula: SHA512(order_id + status_code + gross_amount + server_key)
	// Because we receive the payload as JSON, we need to extract those fields to verify.
	if g.config.ServerKey == "" {
		return fmt.Errorf("MIDTRANS_SERVER_KEY is not configured")
	}

	var data map[string]interface{}
	if err := json.Unmarshal(payload, &data); err != nil {
		return fmt.Errorf("failed to parse webhook payload: %w", err)
	}

	orderID, _ := data["order_id"].(string)
	statusCode, _ := data["status_code"].(string)
	grossAmount, _ := data["gross_amount"].(string)

	signString := orderID + statusCode + grossAmount + g.config.ServerKey

	h := sha512.New()
	h.Write([]byte(signString))
	expectedSignature := hex.EncodeToString(h.Sum(nil))

	if signature != expectedSignature {
		return fmt.Errorf("invalid webhook signature")
	}

	return nil
}
