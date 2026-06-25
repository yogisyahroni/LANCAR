package provider

import (
	"fmt"
	"os"
	"strings"
	"tembus/integration-gateway/internal/domain"
)

// NewOTPProvider creates an OTPProvider based on the given provider name
func NewOTPProvider(providerName string) (domain.OTPProvider, error) {
	if providerName == "" {
		providerName = os.Getenv("ACTIVE_OTP_PROVIDER")
	}
	
	switch strings.ToLower(providerName) {
	case "zenziva":
		return NewZenzivaOTPProvider()
	// Add more cases here in the future, e.g. "twilio"
	default:
		// Fallback to Zenziva if not configured or unknown
		fmt.Printf("[integration-gateway] Warning: Unknown OTP provider '%s', falling back to zenziva\n", providerName)
		return NewZenzivaOTPProvider()
	}
}
