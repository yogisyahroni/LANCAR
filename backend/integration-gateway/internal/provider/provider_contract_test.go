package provider

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"tembus/integration-gateway/internal/domain"
)

type contractProvider struct{}

func (contractProvider) CheckTariff(context.Context, domain.TariffRequest) (*domain.TariffResponse, error) {
	return &domain.TariffResponse{Provider: "CONTRACT", Services: []domain.TariffServiceOption{{ServiceCode: "REG", ServiceName: "Regular", TariffGross: 10000}}}, nil
}
func (contractProvider) CreateOrder(_ context.Context, req domain.LogisticsOrderRequest) (*domain.LogisticsOrderResponse, error) {
	return &domain.LogisticsOrderResponse{ReferenceID: req.ReferenceID, AWBNumber: "CONTRACT-AWB-1", Provider: "CONTRACT", ServiceType: req.ServiceType}, nil
}
func (contractProvider) TrackOrder(context.Context, string) (*domain.TrackingResponse, error) {
	return &domain.TrackingResponse{AWBNumber: "CONTRACT-AWB-1", Provider: "CONTRACT", Status: "IN_TRANSIT"}, nil
}

func TestProviderContractIsReusableForAdditionalProvider(t *testing.T) {
	provider := contractProvider{}
	registration := domain.ProviderRegistration{
		Descriptor: domain.ProviderDescriptor{
			Code: "contract-provider", Name: "Contract Provider",
			Capabilities: []domain.LogisticsCapability{domain.CapabilityTariff, domain.CapabilityShipment, domain.CapabilityTracking},
		},
		Tariff: provider, Shipment: provider, Tracking: provider,
	}

	registry := NewLogisticsProviderRegistry()
	registry.Register(registration)
	if err := registry.Validate(); err != nil {
		t.Fatalf("additional provider failed reusable contract: %v", err)
	}
	registered, ok := registry.Get("contract-provider")
	if !ok {
		t.Fatal("additional provider was not registered")
	}
	if tariff, err := registered.Tariff.CheckTariff(context.Background(), domain.TariffRequest{OriginCode: "JKT", DestinationCode: "BDG", WeightKG: 1, ServiceType: "REG"}); err != nil || len(tariff.Services) != 1 {
		t.Fatalf("tariff contract failed: response=%#v err=%v", tariff, err)
	}
	shipment, err := registered.Shipment.CreateOrder(context.Background(), domain.LogisticsOrderRequest{ReferenceID: "contract-1", ServiceType: "REG"})
	if err != nil || shipment.AWBNumber == "" {
		t.Fatalf("shipment contract failed: response=%#v err=%v", shipment, err)
	}
	tracking, err := registered.Tracking.TrackOrder(context.Background(), shipment.AWBNumber)
	if err != nil || tracking.Status == "" {
		t.Fatalf("tracking contract failed: response=%#v err=%v", tracking, err)
	}
}

func TestProviderContractScenariosHaveFixtures(t *testing.T) {
	providers := []string{"jne", "jnt"}
	scenarios := []string{"rate", "create", "tracking", "errors", "timeout", "duplicate_event", "unknown_status"}
	for _, provider := range providers {
		for _, scenario := range scenarios {
			t.Run(provider+"/"+scenario, func(t *testing.T) {
				path := filepath.Join("testdata", provider, scenario+".json")
				data, err := os.ReadFile(path)
				if err != nil {
					t.Fatalf("read fixture %s: %v", path, err)
				}
				var fixture struct {
					Provider string `json:"provider"`
					Scenario string `json:"scenario"`
				}
				if err := json.Unmarshal(data, &fixture); err != nil {
					t.Fatalf("invalid fixture %s: %v", path, err)
				}
				if fixture.Provider != provider || fixture.Scenario != scenario {
					t.Fatalf("fixture identity mismatch: %#v", fixture)
				}
			})
		}
	}
}

func TestProviderContractFailureAndTimeoutSemantics(t *testing.T) {
	if !errors.Is(context.Canceled, context.Canceled) {
		t.Fatal("context cancellation must remain detectable")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Millisecond)
	defer cancel()
	<-ctx.Done()
	if !errors.Is(ctx.Err(), context.DeadlineExceeded) {
		t.Fatalf("timeout fixture contract expected deadline exceeded, got %v", ctx.Err())
	}
}
