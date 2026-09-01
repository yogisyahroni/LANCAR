package provider

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"tembus/integration-gateway/internal/domain"
)

// LogisticsRegistry is the server-side provider catalog. Lookup accepts a
// canonical id, code, or a case-insensitive name; credentials never leave an
// adapter and are therefore absent from the descriptor returned to clients.
type LogisticsRegistry struct {
	providers map[string]domain.LogisticsProvider
}

func NewLogisticsRegistry(providers ...domain.LogisticsProvider) (*LogisticsRegistry, error) {
	r := &LogisticsRegistry{providers: make(map[string]domain.LogisticsProvider)}
	for _, p := range providers {
		if err := r.Register(p); err != nil {
			return nil, err
		}
	}
	return r, nil
}

func (r *LogisticsRegistry) Register(p domain.LogisticsProvider) error {
	if p == nil {
		return fmt.Errorf("logistics provider cannot be nil")
	}
	identity := p.Identity()
	if err := identity.Validate(); err != nil {
		return err
	}
	if err := ValidateProviderCapabilityMatrix(p); err != nil {
		return fmt.Errorf("provider %q capability matrix is invalid: %w", identity.Code, err)
	}
	keys := []string{identity.ID, identity.Code, identity.Name}
	for _, key := range keys {
		key = normalizeProviderRef(key)
		if existing, ok := r.providers[key]; ok && existing != p {
			return fmt.Errorf("provider reference %q is already registered", key)
		}
	}
	for _, key := range keys {
		r.providers[normalizeProviderRef(key)] = p
	}
	return nil
}

// ValidateProviderCapabilityMatrix prevents a provider from advertising an
// operation without implementing its corresponding contract. This is called
// at startup, before the adapter can receive traffic.
func ValidateProviderCapabilityMatrix(p domain.LogisticsProvider) error {
	if p == nil {
		return fmt.Errorf("provider cannot be nil")
	}
	for _, capability := range p.Capabilities() {
		var implemented bool
		switch capability {
		case domain.CapabilityTariff:
			_, implemented = p.(domain.TariffProvider)
		case domain.CapabilityShipment:
			_, implemented = p.(domain.ShipmentProvider)
		case domain.CapabilityTrackingPull:
			_, implemented = p.(domain.TrackingPullProvider)
		case domain.CapabilityTrackingWebhook:
			_, implemented = p.(domain.TrackingWebhookProvider)
		case domain.CapabilityPickup:
			_, implemented = p.(domain.PickupProvider)
		case domain.CapabilityCancellation:
			_, implemented = p.(domain.CancellationProvider)
		case domain.CapabilityLabel:
			_, implemented = p.(domain.LabelProvider)
		case domain.CapabilityPOD:
			_, implemented = p.(domain.PODProvider)
		case domain.CapabilityInsurance:
			_, implemented = p.(domain.InsuranceProvider)
		case domain.CapabilityCOD:
			_, implemented = p.(domain.CODProvider)
		case domain.CapabilityReturn:
			_, implemented = p.(domain.ReturnProvider)
		case domain.CapabilityClaim:
			_, implemented = p.(domain.ClaimProvider)
		default:
			return fmt.Errorf("unknown capability %q", capability)
		}
		if !implemented {
			return fmt.Errorf("declared capability %q has no implementation", capability)
		}
	}
	return nil
}

func (r *LogisticsRegistry) Resolve(reference string) (domain.LogisticsProvider, error) {
	if r == nil {
		return nil, fmt.Errorf("logistics registry is not configured")
	}
	p, ok := r.providers[normalizeProviderRef(reference)]
	if !ok {
		return nil, fmt.Errorf("logistics provider %q is not registered", reference)
	}
	return p, nil
}

func (r *LogisticsRegistry) List() []domain.ProviderDescriptor {
	if r == nil {
		return nil
	}
	seen := make(map[string]struct{})
	descriptors := make([]domain.ProviderDescriptor, 0)
	for _, p := range r.providers {
		identity := p.Identity()
		if _, ok := seen[identity.ID]; ok {
			continue
		}
		seen[identity.ID] = struct{}{}
		descriptors = append(descriptors, identity.Descriptor(p.Capabilities()))
	}
	sort.Slice(descriptors, func(i, j int) bool { return descriptors[i].Code < descriptors[j].Code })
	return descriptors
}

func (r *LogisticsRegistry) Health(ctx context.Context) []domain.ProviderHealth {
	if r == nil {
		return nil
	}
	seen := make(map[string]struct{})
	result := make([]domain.ProviderHealth, 0)
	for _, p := range r.providers {
		identity := p.Identity()
		if _, ok := seen[identity.ID]; ok {
			continue
		}
		seen[identity.ID] = struct{}{}
		if diagnostic, ok := p.(domain.ProviderHealthProvider); ok {
			result = append(result, diagnostic.Health(ctx))
			continue
		}
		result = append(result, domain.ProviderHealth{
			ProviderID: identity.ID, ProviderCode: identity.Code, ProviderName: identity.Name,
			Status: "unknown", Reason: "adapter has no health diagnostic",
		})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].ProviderCode < result[j].ProviderCode })
	return result
}

func normalizeProviderRef(reference string) string {
	return strings.ToLower(strings.TrimSpace(reference))
}
