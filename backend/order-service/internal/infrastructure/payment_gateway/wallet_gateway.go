package payment_gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"

	"tembus/order-service/internal/domain"
)

type WalletRefundGateway struct {
	paymentServiceURL string
	orderRepo         domain.OrderRepository
	client            *http.Client
}

func NewWalletRefundGateway(paymentServiceURL string, orderRepo domain.OrderRepository) *WalletRefundGateway {
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

// ProcessTip — FB-077: transfer tip customer → kurir di payment-service.
// referenceID = order_id (idempotent di sisi payment-service).
func (g *WalletRefundGateway) ProcessTip(ctx context.Context, customerID, courierID uuid.UUID, amount int64, referenceID string) error {
	if referenceID == "" {
		return fmt.Errorf("reference_id is required for tip")
	}
	if amount <= 0 {
		return fmt.Errorf("tip amount must be positive")
	}

	reqBody := map[string]any{
		"customer_id":  customerID.String(),
		"courier_id":   courierID.String(),
		"amount":       amount,
		"reference_id": referenceID,
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal tip request: %w", err)
	}

	url := fmt.Sprintf("%s/api/internal/wallet/tip", g.paymentServiceURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return fmt.Errorf("failed to create tip http request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", customerID.String())
	req.Header.Set("X-User-Role", "customer")

	resp, err := g.client.Do(req)
	if err != nil {
		return fmt.Errorf("payment-service tip call failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		var errResp map[string]string
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		errMsg := errResp["error"]
		if errMsg == "" {
			errMsg = fmt.Sprintf("status code %d", resp.StatusCode)
		}
		return fmt.Errorf("payment-service returned error: %s", errMsg)
	}

	return nil
}

// RefundTip — FB-083: balik transfer tip (debit wallet courier → credit
// wallet customer) di payment-service. referenceID BEDA dari reference tip
// original (pakai "wallet-tip-refund-{order_id}") supaya idempotency tidak
// ketuker dengan ProcessTip.
func (g *WalletRefundGateway) RefundTip(ctx context.Context, customerID, courierID uuid.UUID, amount int64, referenceID string) error {
	if referenceID == "" {
		return fmt.Errorf("reference_id is required for tip refund")
	}
	if amount <= 0 {
		return fmt.Errorf("tip refund amount must be positive")
	}

	reqBody := map[string]any{
		"customer_id":  customerID.String(),
		"courier_id":   courierID.String(),
		"amount":       amount,
		"reference_id": referenceID,
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal tip refund request: %w", err)
	}

	url := fmt.Sprintf("%s/api/internal/wallet/tip/refund", g.paymentServiceURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return fmt.Errorf("failed to create tip refund http request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", customerID.String())
	req.Header.Set("X-User-Role", "customer")

	resp, err := g.client.Do(req)
	if err != nil {
		return fmt.Errorf("payment-service tip refund call failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		var errResp map[string]string
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		errMsg := errResp["error"]
		if errMsg == "" {
			errMsg = fmt.Sprintf("status code %d", resp.StatusCode)
		}
		return fmt.Errorf("payment-service returned error: %s", errMsg)
	}

	return nil
}
