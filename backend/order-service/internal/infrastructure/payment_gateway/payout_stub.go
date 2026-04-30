package payment_gateway

import (
	"context"
	"log"

	"github.com/google/uuid"
)

// StubPayoutGateway implements domain.PayoutGateway for MVP/Testing
type StubPayoutGateway struct{}

func NewStubPayoutGateway() *StubPayoutGateway {
	return &StubPayoutGateway{}
}

func (s *StubPayoutGateway) Disburse(ctx context.Context, amount int, courierBankCode, courierBankAccount, description string) (string, error) {
	log.Printf("STUB DISBURSE: amount=%d, bank=%s, account=%s, desc=%s\n", amount, courierBankCode, courierBankAccount, description)
	// Simulate success with a fake reference ID
	return "disb_" + uuid.NewString(), nil
}
