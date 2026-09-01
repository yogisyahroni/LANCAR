package provider

import (
	"context"
	"testing"

	"tembus/integration-gateway/internal/domain"
)

type registryTestProvider struct {
	identity     domain.ProviderIdentity
	capabilities []domain.Capability
}

func (p *registryTestProvider) Identity() domain.ProviderIdentity { return p.identity }
func (p *registryTestProvider) Capabilities() []domain.Capability { return p.capabilities }
func (p *registryTestProvider) CheckTariff(context.Context, domain.TariffRequest) (*domain.TariffResponse, error) {
	return &domain.TariffResponse{}, nil
}

func TestLogisticsRegistryResolvesCanonicalReferences(t *testing.T) {
	jne := &registryTestProvider{
		identity:     domain.ProviderIdentity{ID: "jne", Code: "JNE", Name: "JNE"},
		capabilities: []domain.Capability{domain.CapabilityTariff},
	}
	registry, err := NewLogisticsRegistry(jne)
	if err != nil {
		t.Fatalf("NewLogisticsRegistry() error = %v", err)
	}

	for _, reference := range []string{"jne", " JNE ", "jne"} {
		resolved, err := registry.Resolve(reference)
		if err != nil {
			t.Fatalf("Resolve(%q) error = %v", reference, err)
		}
		if resolved != jne {
			t.Fatalf("Resolve(%q) returned a different provider", reference)
		}
	}

	descriptors := registry.List()
	if len(descriptors) != 1 || descriptors[0].ID != "jne" {
		t.Fatalf("List() = %#v, want one JNE descriptor", descriptors)
	}
}

func TestLogisticsRegistryRejectsDuplicateProviderReference(t *testing.T) {
	first := &registryTestProvider{identity: domain.ProviderIdentity{ID: "one", Code: "DUP", Name: "One"}}
	second := &registryTestProvider{identity: domain.ProviderIdentity{ID: "two", Code: "DUP", Name: "Two"}}
	if _, err := NewLogisticsRegistry(first, second); err == nil {
		t.Fatal("NewLogisticsRegistry() accepted duplicate provider reference")
	}
}

func TestLogisticsRegistryHealthDoesNotExposeCredentials(t *testing.T) {
	jne := &JNEProvider{apiKey: "secret-key", username: "server-user"}
	registry, err := NewLogisticsRegistry(jne)
	if err != nil {
		t.Fatalf("NewLogisticsRegistry() error = %v", err)
	}
	health := registry.Health(context.Background())
	if len(health) != 1 || health[0].Status != "ready" {
		t.Fatalf("Health() = %#v, want ready diagnostic", health)
	}
	if health[0].Reason == "secret-key" || health[0].Reason == "server-user" {
		t.Fatal("Health() exposed provider credentials")
	}
}

// Compile-time assertion documents that real provider adapters satisfy the
// small identity contract used by the registry.
var _ domain.LogisticsProvider = (*JNEProvider)(nil)
