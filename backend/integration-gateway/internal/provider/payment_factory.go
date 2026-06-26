package provider

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"tembus/integration-gateway/internal/domain"
)

var (
	midtransProv domain.PaymentProvider
	xenditProv   domain.PaymentProvider
	once         sync.Once
)

func initProviders() {
	once.Do(func() {
		midtransProv = NewMidtransProvider()
		xenditProv = NewXenditProvider()
	})
}

// GetPaymentProvider returns a PaymentProvider based on the given provider name
func GetPaymentProvider(providerName string) (domain.PaymentProvider, error) {
	initProviders()

	if providerName == "" {
		providerName = os.Getenv("ACTIVE_PAYMENT_PROVIDER")
	}

	switch strings.ToLower(providerName) {
	case "midtrans":
		return midtransProv, nil
	case "xendit":
		return xenditProv, nil
	default:
		fmt.Printf("[integration-gateway] Warning: Unknown payment provider '%s', falling back to midtrans\n", providerName)
		return midtransProv, nil
	}
}
