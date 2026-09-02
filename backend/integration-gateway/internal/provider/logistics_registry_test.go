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

type registryTrackingStub struct{}

func (registryTrackingStub) TrackOrder(context.Context, string) (*domain.TrackingResponse, error) {
	return &domain.TrackingResponse{AWBNumber: "AWB-1", Status: "IN_TRANSIT"}, nil
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

func TestLogisticsProviderRegistryValidatesDeclaredCapabilities(t *testing.T) {
	registry := NewLogisticsProviderRegistry()
	registry.Register(domain.ProviderRegistration{
		Descriptor: domain.ProviderDescriptor{Code: "broken", Name: "Broken", Capabilities: []domain.LogisticsCapability{domain.CapabilityShipment}},
	})
	if err := registry.Validate(); err == nil {
		t.Fatal("provider with an unwired declared capability must fail validation")
	}
	diagnostics := registry.Diagnostics()
	if len(diagnostics) != 1 || diagnostics[0].Ready || len(diagnostics[0].Missing) != 1 {
		t.Fatalf("expected not-ready diagnostics, got %#v", diagnostics)
	}
}

func TestLogisticsProviderRegistryExposesTrackingModeAndDegradedState(t *testing.T) {
	registry := NewLogisticsProviderRegistry()
	registry.Register(domain.ProviderRegistration{
		Descriptor: domain.ProviderDescriptor{Code: "webhook", Name: "Webhook", Capabilities: []domain.LogisticsCapability{domain.CapabilityWebhook}},
		Webhook:    NewGenericWebhookAdapter("webhook"),
	})
	registry.Register(domain.ProviderRegistration{
		Descriptor: domain.ProviderDescriptor{Code: "poll", Name: "Poll", Capabilities: []domain.LogisticsCapability{domain.CapabilityTracking}},
		Tracking:   registryTrackingStub{},
	})
	registry.Register(domain.ProviderRegistration{
		Descriptor: domain.ProviderDescriptor{Code: "manual", Name: "Manual"},
	})

	items := registry.List()
	if len(items) != 3 {
		t.Fatalf("expected three provider descriptors, got %#v", items)
	}
	byCode := map[string]domain.ProviderDescriptor{}
	for _, item := range items {
		byCode[item.Code] = item
	}
	if byCode["webhook"].TrackingMode != "webhook" || byCode["webhook"].TrackingDegraded {
		t.Fatalf("expected webhook-primary descriptor, got %#v", byCode["webhook"])
	}
	if byCode["poll"].TrackingMode != "polling" || byCode["poll"].TrackingDegraded {
		t.Fatalf("expected polling descriptor, got %#v", byCode["poll"])
	}
	if byCode["manual"].TrackingMode != "degraded_manual" || !byCode["manual"].TrackingDegraded {
		t.Fatalf("expected degraded manual descriptor, got %#v", byCode["manual"])
	}
}
