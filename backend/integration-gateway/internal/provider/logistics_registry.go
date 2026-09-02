package provider

import (
	"fmt"
	"sort"
	"strings"

	"tembus/integration-gateway/internal/domain"
)

type LogisticsProviderRegistry struct {
	providers map[string]domain.ProviderRegistration
}

func NewLogisticsProviderRegistry() *LogisticsProviderRegistry {
	return &LogisticsProviderRegistry{providers: make(map[string]domain.ProviderRegistration)}
}

func (r *LogisticsProviderRegistry) Register(registration domain.ProviderRegistration) {
	code := strings.ToLower(strings.TrimSpace(registration.Descriptor.Code))
	if code == "" || strings.TrimSpace(registration.Descriptor.Name) == "" {
		return
	}
	registration.Descriptor.Code = code
	r.providers[code] = registration
}

func (r *LogisticsProviderRegistry) Get(code string) (domain.ProviderRegistration, bool) {
	registration, ok := r.providers[strings.ToLower(strings.TrimSpace(code))]
	return registration, ok
}

func (r *LogisticsProviderRegistry) List() []domain.ProviderDescriptor {
	items := make([]domain.ProviderDescriptor, 0, len(r.providers))
	for _, registration := range r.providers {
		descriptor := registration.Descriptor
		descriptor.TrackingMode, descriptor.TrackingDegraded = trackingMode(registration), false
		if descriptor.TrackingMode == "degraded_manual" {
			descriptor.TrackingDegraded = true
		}
		items = append(items, descriptor)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Code < items[j].Code })
	return items
}

func trackingMode(registration domain.ProviderRegistration) string {
	if registration.Webhook != nil {
		return "webhook"
	}
	if registration.Tracking != nil {
		return "polling"
	}
	return "degraded_manual"
}

// Validate enforces that every declared capability has a concrete adapter.
// This fails fast during startup instead of exposing a provider that can only
// advertise an operation but cannot execute it.
func (r *LogisticsProviderRegistry) Validate() error {
	for code, registration := range r.providers {
		for _, capability := range registration.Descriptor.Capabilities {
			if !hasImplementation(registration, capability) {
				return fmt.Errorf("provider %s declares capability %s without an adapter", code, capability)
			}
		}
	}
	return nil
}

func (r *LogisticsProviderRegistry) Diagnostics() []domain.ProviderDiagnostic {
	items := make([]domain.ProviderDiagnostic, 0, len(r.providers))
	for _, registration := range r.providers {
		missing := make([]domain.LogisticsCapability, 0)
		for _, capability := range registration.Descriptor.Capabilities {
			if !hasImplementation(registration, capability) {
				missing = append(missing, capability)
			}
		}
		items = append(items, domain.ProviderDiagnostic{
			Code: registration.Descriptor.Code, Name: registration.Descriptor.Name,
			Ready: len(missing) == 0, Missing: missing,
			Capabilities: registration.Descriptor.Capabilities,
		})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Code < items[j].Code })
	return items
}

func hasImplementation(registration domain.ProviderRegistration, capability domain.LogisticsCapability) bool {
	switch capability {
	case domain.CapabilityTariff:
		return registration.Tariff != nil
	case domain.CapabilityShipment:
		return registration.Shipment != nil
	case domain.CapabilityTracking:
		return registration.Tracking != nil
	case domain.CapabilityWebhook:
		return registration.Webhook != nil
	default:
		// Capability interfaces for future operations are intentionally not
		// advertised until their concrete adapter can be wired here.
		return false
	}
}
