package payment_gateway

import (
	"context"
	"errors"
)

type UnavailablePayoutGateway struct{}

func NewUnavailablePayoutGateway() *UnavailablePayoutGateway {
	return &UnavailablePayoutGateway{}
}

func (g *UnavailablePayoutGateway) Disburse(ctx context.Context, amount int, courierBankCode, courierBankAccount, description string) (string, error) {
	return "", errors.New("payout provider is not configured")
}

type UnavailableRefundGateway struct{}

func NewUnavailableRefundGateway() *UnavailableRefundGateway {
	return &UnavailableRefundGateway{}
}

func (g *UnavailableRefundGateway) ProcessRefund(ctx context.Context, orderID string, paymentRef string, amount int, reason string) (string, error) {
	return "", errors.New("refund provider is not configured")
}
