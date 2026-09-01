package service

import (
	"context"
	"strings"
	"testing"

	"tembus/integration-gateway/internal/domain"
)

type fakeRegistryProvider struct {
	identity     domain.ProviderIdentity
	capabilities []domain.Capability
	services     []domain.TariffServiceOption
}

func (p *fakeRegistryProvider) Identity() domain.ProviderIdentity { return p.identity }
func (p *fakeRegistryProvider) Capabilities() []domain.Capability { return p.capabilities }
func (p *fakeRegistryProvider) CheckTariff(context.Context, domain.TariffRequest) (*domain.TariffResponse, error) {
	return &domain.TariffResponse{Services: append([]domain.TariffServiceOption(nil), p.services...)}, nil
}

type fakeRegistry struct{ provider domain.LogisticsProvider }

func (r *fakeRegistry) Resolve(string) (domain.LogisticsProvider, error) { return r.provider, nil }
func (r *fakeRegistry) List() []domain.ProviderDescriptor {
	return []domain.ProviderDescriptor{r.provider.Identity().Descriptor(r.provider.Capabilities())}
}

var _ domain.TariffProvider = (*fakeRegistryProvider)(nil)

func TestLogisticsOrchestratorUsesDeclaredCapabilityAndCanonicalMetadata(t *testing.T) {
	fake := &fakeRegistryProvider{
		identity:     domain.ProviderIdentity{ID: "sandbox", Code: "SBOX", Name: "Sandbox Carrier"},
		capabilities: []domain.Capability{domain.CapabilityTariff},
		services:     []domain.TariffServiceOption{{ServiceCode: "FAST", ServiceName: "Fast", TariffGross: 12000}},
	}
	orchestrator := NewLogisticsOrchestrator(&fakeRegistry{provider: fake})

	result, err := orchestrator.CheckTariff(context.Background(), "SBOX", domain.TariffRequest{WeightKG: 1})
	if err != nil {
		t.Fatalf("CheckTariff() error = %v", err)
	}
	if result.ProviderID != "sandbox" || result.ProviderCode != "SBOX" || result.ProviderName != "Sandbox Carrier" {
		t.Fatalf("CheckTariff() metadata = %#v", result)
	}
	if result.Services[0].ServiceCode != "FAST" || result.Services[0].ServiceName != "Fast" {
		t.Fatalf("CheckTariff() did not preserve native service identity: %#v", result.Services[0])
	}
}

func TestLogisticsOrchestratorFailsClosedForUndeclaredCapability(t *testing.T) {
	fake := &fakeRegistryProvider{
		identity:     domain.ProviderIdentity{ID: "tracking-only", Code: "TRACK", Name: "Tracking Only"},
		capabilities: []domain.Capability{domain.CapabilityTrackingPull},
	}
	orchestrator := NewLogisticsOrchestrator(&fakeRegistry{provider: fake})

	_, err := orchestrator.CheckTariff(context.Background(), "TRACK", domain.TariffRequest{WeightKG: 1})
	if err == nil || !strings.Contains(err.Error(), `does not support capability "tariff"`) {
		t.Fatalf("CheckTariff() error = %v, want explicit unsupported-capability error", err)
	}
}
