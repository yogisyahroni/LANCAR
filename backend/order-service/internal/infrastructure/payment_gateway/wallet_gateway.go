package payment_gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"tembus/order-service/internal/domain"
)

type WalletRefundGateway struct {
	paymentServiceURL string
	orderRepo         domain.OrderRepository
	client            *http.Client
}

func NewWalletRefundGateway(paymentServiceURL string, orderRepo domain.OrderRepository) domain.RefundGateway {
	if paymentServiceURL == "" {
		paymentServiceURL = "http://localhost:8084"
	}
	return &WalletRefundGateway{
		paymentServiceURL: paymentServiceURL,
		orderRepo:         orderRepo,
		client:            &http.Client{Timeout: 10 * time.Second},
	}
}

func (g *WalletRefundGateway) ProcessRefund(ctx context.Context, orderID string, paymentRef string, amount int, reason string) (string, error) {
	if orderID == "" {
		return "", fmt.Errorf("order_id is required for wallet refund")
	}

	order, err := g.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return "", fmt.Errorf("failed to get order %s for refund: %w", orderID, err)
	}

	if order.CustomerID == "" {
		return "", fmt.Errorf("order %s has no customer_id", orderID)
	}

	reqBody := map[string]any{
		"amount":       float64(amount),
		"order_id":     orderID,
		"reference_id": orderID,
		"reason":       reason,
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal refund request: %w", err)
	}

	url := fmt.Sprintf("%s/api/internal/wallet/refund", g.paymentServiceURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("failed to create refund http request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", order.CustomerID)
	req.Header.Set("X-User-Role", "customer")

	resp, err := g.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("payment-service refund call failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		var errResp map[string]string
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		errMsg := errResp["error"]
		if errMsg == "" {
			errMsg = fmt.Sprintf("status code %d", resp.StatusCode)
		}
		return "", fmt.Errorf("payment-service returned error: %s", errMsg)
	}

	return fmt.Sprintf("wallet-ref-%s", orderID), nil
}
