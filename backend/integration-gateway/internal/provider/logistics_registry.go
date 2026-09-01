package provider

import (
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
		items = append(items, registration.Descriptor)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Code < items[j].Code })
	return items
}
