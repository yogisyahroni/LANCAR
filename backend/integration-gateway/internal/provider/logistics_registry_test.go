package provider

import (
	"context"
	"testing"

	"tembus/integration-gateway/internal/domain"
)

type registryTariffStub struct{}

func (registryTariffStub) CheckTariff(context.Context, domain.TariffRequest) (*domain.TariffResponse, error) {
	return &domain.TariffResponse{}, nil
}

func TestLogisticsProviderRegistryNormalizesAndListsDescriptors(t *testing.T) {
	registry := NewLogisticsProviderRegistry()
	registry.Register(domain.ProviderRegistration{
		Descriptor: domain.ProviderDescriptor{
			Code: " JNE ", Name: "JNE Express",
			Capabilities: []domain.LogisticsCapability{domain.CapabilityTariff},
		},
		Tariff: registryTariffStub{},
	})

	registration, ok := registry.Get("jne")
	if !ok || registration.Descriptor.Code != "jne" {
		t.Fatalf("expected normalized JNE registration, got %#v (ok=%v)", registration, ok)
	}
	if len(registry.List()) != 1 || registry.List()[0].Capabilities[0] != domain.CapabilityTariff {
		t.Fatalf("expected one declared tariff capability, got %#v", registry.List())
	}
}

func TestLogisticsProviderRegistryDoesNotRegisterInvalidDescriptor(t *testing.T) {
	registry := NewLogisticsProviderRegistry()
	registry.Register(domain.ProviderRegistration{Descriptor: domain.ProviderDescriptor{Code: "", Name: ""}})

	if _, ok := registry.Get(""); ok || len(registry.List()) != 0 {
		t.Fatal("invalid provider descriptor must not be registered")
	}
}
