package provider

import (
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

func normalizeProviderRef(reference string) string {
	return strings.ToLower(strings.TrimSpace(reference))
}
