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
		tomtom, err := NewTomTomProvider()
		if err != nil {
			return nil, err
		}
		registry := NewMapsProviderRegistry()
		if err := registry.Register(tomtom); err != nil {
			return nil, err
		}
		return registry, nil
	// case "googlemaps":
	// 	return NewGoogleMapsProvider()
	default:
		return nil, fmt.Errorf("unsupported maps provider: %s", providerName)
	}
}
