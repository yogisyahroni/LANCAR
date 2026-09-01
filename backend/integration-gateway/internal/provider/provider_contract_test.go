package provider

import (
	"encoding/json"
	"os"
	"testing"

	"tembus/integration-gateway/internal/domain"
)

func TestRegisteredProvidersSatisfyCapabilityContracts(t *testing.T) {
	providers := []domain.LogisticsProvider{NewJNEProvider(), NewJNTProvider()}
	for _, p := range providers {
		if err := ValidateProviderCapabilityMatrix(p); err != nil {
			t.Errorf("%s capability matrix: %v", p.Identity().Code, err)
		}
	}
}

func TestCapabilityMatrixRejectsUnsupportedAdvertisement(t *testing.T) {
	invalid := &registryTestProvider{
		identity:     domain.ProviderIdentity{ID: "invalid", Code: "INVALID", Name: "Invalid"},
		capabilities: []domain.Capability{domain.CapabilityShipment},
	}
	if err := ValidateProviderCapabilityMatrix(invalid); err == nil {
		t.Fatal("ValidateProviderCapabilityMatrix() accepted an undeclared shipment implementation")
	}
}

func TestProviderContractFixtureMatrixCoversRequiredScenarios(t *testing.T) {
	fixture, err := os.ReadFile("testdata/provider_contract_fixtures.json")
	if err != nil {
		t.Fatalf("read provider contract fixtures: %v", err)
	}
	var scenarios map[string]struct {
		Required []string `json:"required"`
	}
	if err := json.Unmarshal(fixture, &scenarios); err != nil {
		t.Fatalf("decode provider contract fixtures: %v", err)
	}
	for _, scenario := range []string{"rate", "create_shipment_awb", "tracking", "error", "timeout", "duplicate_event", "unknown_status"} {
		entry, ok := scenarios[scenario]
		if !ok || len(entry.Required) == 0 {
			t.Errorf("fixture scenario %q is missing required fields", scenario)
		}
	}
}
