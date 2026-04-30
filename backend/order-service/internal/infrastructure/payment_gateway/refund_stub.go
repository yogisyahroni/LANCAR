package payment_gateway

import (
	"context"
	"log"

	"github.com/google/uuid"
)

// StubRefundGateway implements domain.RefundGateway for MVP/Testing
type StubRefundGateway struct{}

func NewStubRefundGateway() *StubRefundGateway {
	return &StubRefundGateway{}
}

func (s *StubRefundGateway) ProcessRefund(ctx context.Context, paymentRef string, amount int, reason string) (string, error) {
	log.Printf("STUB REFUND: payment_ref=%s, amount=%d, reason=%s\n", paymentRef, amount, reason)
	// Simulate success with a fake reference ID
	return "refd_" + uuid.NewString(), nil
}
