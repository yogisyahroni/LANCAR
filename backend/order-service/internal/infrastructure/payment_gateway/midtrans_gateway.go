package payment_gateway

import (
	"context"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"

	"lancar/order-service/internal/domain"
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

func (g *MidtransGateway) GenerateQRIS(ctx context.Context, req domain.PaymentGatewayRequest) (domain.PaymentGatewayResponse, error) {
	// In a real implementation, this would use github.com/midtrans/midtrans-go/coreapi
	// and call coreapi.ChargeTransaction(...) with payment_type "qris".
	
	slog.InfoContext(ctx, "Mocking Midtrans QRIS generation", "order_id", req.OrderID, "amount", req.AmountIDR)

	// Mock response
	providerRef := "MOCK-MT-" + req.PaymentNumber
	dummyQR := "00020101021126580011ID.CO.QRIS.WWW01189360091531234567890215ID12345678901230303UMI51440014ID.CO.QRIS.WWW0215ID12345678901230303UMI5204581253033605406" + fmt.Sprintf("%d", req.AmountIDR) + "5802ID5910LANCAR LOG6007JAKARTA6105123456304CA20"
	dummyURL := "https://api.sandbox.midtrans.com/v2/qris/" + providerRef + "/qr-code"

	return domain.PaymentGatewayResponse{
		ProviderReference: providerRef,
		QRCodeURL:         dummyURL,
		QRCodeString:      dummyQR,
	}, nil
}

func (g *MidtransGateway) VerifyWebhookSignature(ctx context.Context, payload []byte, signature string) error {
	// Midtrans signature formula: SHA512(order_id + status_code + gross_amount + server_key)
	// Because we receive the payload as JSON, we need to extract those fields to verify.
	// For the mock, if ServerKey is empty or signature is "MOCK_SIGNATURE", we bypass.
	
	if signature == "MOCK_SIGNATURE" {
		return nil
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
