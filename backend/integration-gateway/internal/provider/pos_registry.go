package provider

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"tembus/integration-gateway/internal/domain"
)

type POSProviderRegistry struct {
	providers map[string]domain.POSProviderRegistration
}

func NewPOSProviderRegistry() *POSProviderRegistry {
	return &POSProviderRegistry{providers: make(map[string]domain.POSProviderRegistration)}
}

func (r *POSProviderRegistry) Register(registration domain.POSProviderRegistration) {
	code := strings.ToLower(strings.TrimSpace(registration.Descriptor.Code))
	if code == "" || strings.TrimSpace(registration.Descriptor.Name) == "" {
		return
	}
	registration.Descriptor.Code = code
	r.providers[code] = registration
}

func (r *POSProviderRegistry) Get(code string) (domain.POSProviderRegistration, bool) {
	registration, ok := r.providers[strings.ToLower(strings.TrimSpace(code))]
	if !ok {
		return domain.POSProviderRegistration{}, false
	}
	return registration, true
}

func (r *POSProviderRegistry) List() []domain.POSProviderDescriptor {
	items := make([]domain.POSProviderDescriptor, 0, len(r.providers))
	for _, registration := range r.providers {
		items = append(items, registration.Descriptor)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Code < items[j].Code })
	return items
}

func (r *POSProviderRegistry) Validate() error {
	for code, registration := range r.providers {
		for _, capability := range registration.Descriptor.Capabilities {
			switch capability {
			case domain.POSCapabilityOrderReceipt:
				if registration.Order == nil {
					return fmt.Errorf("POS provider %s declares capability %s without an adapter", code, capability)
				}
			case domain.POSCapabilityCatalogSync:
				if registration.Catalog == nil {
					return fmt.Errorf("POS provider %s declares capability %s without an adapter", code, capability)
				}
			case domain.POSCapabilityInventorySync:
				if registration.Inventory == nil {
					return fmt.Errorf("POS provider %s declares capability %s without an adapter", code, capability)
				}
			case domain.POSCapabilityHealth:
				if registration.Health == nil {
					return fmt.Errorf("POS provider %s declares capability %s without an adapter", code, capability)
				}
			default:
				return fmt.Errorf("POS provider %s declares unknown capability %s", code, capability)
			}
		}
	}
	return nil
}

func (r *POSProviderRegistry) Health(ctx context.Context) []domain.POSHealth {
	if ctx == nil {
		ctx = context.Background()
	}
	items := make([]domain.POSHealth, 0, len(r.providers))
	for _, registration := range r.providers {
		if registration.Health == nil {
			items = append(items, domain.POSHealth{
				ProviderCode:       registration.Descriptor.Code,
				ProviderName:       registration.Descriptor.Name,
				State:              "unknown",
				Capabilities:       registration.Descriptor.Capabilities,
				AvailabilityReason: "health capability is not configured",
			})
			continue
		}
		health := registration.Health.CheckHealth(ctx)
		if health.ProviderCode == "" {
			health.ProviderCode = registration.Descriptor.Code
		}
		if health.ProviderName == "" {
			health.ProviderName = registration.Descriptor.Name
		}
		if len(health.Capabilities) == 0 {
			health.Capabilities = registration.Descriptor.Capabilities
		}
		items = append(items, health)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].ProviderCode < items[j].ProviderCode })
	return items
}
