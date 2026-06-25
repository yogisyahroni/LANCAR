package provider

import (
	"fmt"
	"os"
	"strings"
	"tembus/integration-gateway/internal/domain"
)

func NewMapsProvider(providerName string) (domain.MapsProvider, error) {
	if providerName == "" {
		providerName = os.Getenv("ACTIVE_MAPS_PROVIDER")
	}

	switch strings.ToLower(providerName) {
	case "tomtom":
		return NewTomTomProvider()
	// case "googlemaps":
	// 	return NewGoogleMapsProvider()
	default:
		return nil, fmt.Errorf("unsupported maps provider: %s", providerName)
	}
}
