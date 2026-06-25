package provider

import (
	"fmt"
	"os"
	"strings"
	"tembus/integration-gateway/internal/domain"
)

// NewPaymentProvider creates a PaymentProvider based on the given provider name
func NewPaymentProvider(providerName string) (domain.PaymentProvider, error) {
	if providerName == "" {
		providerName = os.Getenv("ACTIVE_PAYMENT_PROVIDER")
	}

	switch strings.ToLower(providerName) {
	case "midtrans":
		return NewMidtransProvider(), nil
	case "xendit":
		return NewXenditProvider(), nil
	default:
		fmt.Printf("[integration-gateway] Warning: Unknown payment provider '%s', falling back to midtrans\n", providerName)
		return NewMidtransProvider(), nil
	}
}
