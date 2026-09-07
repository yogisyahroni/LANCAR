package provider

import (
	"context"
	"errors"
	"testing"

	"tembus/integration-gateway/internal/domain"
)

type fakeMapsProvider struct {
	name       string
	fail       bool
	calls      int
	distanceKM float64
}

func (p *fakeMapsProvider) Name() string { return p.name }

func (p *fakeMapsProvider) Capabilities() []domain.MapsCapability {
	return []domain.MapsCapability{domain.MapsCapabilityRouting, domain.MapsCapabilityTraffic}
}

func (p *fakeMapsProvider) GetDistanceMatrix(context.Context, float64, float64, float64, float64, bool) (float64, float64, string, string, error) {
	p.calls++
	if p.fail {
		return 0, 0, "", "", errors.New("provider unavailable")
	}
	return p.distanceKM, 12, "origin", "destination", nil
}

func (p *fakeMapsProvider) OptimizeWaypoints(context.Context, domain.Waypoint, []domain.Waypoint, domain.Waypoint, bool) (*domain.OptimizedRouteResult, error) {
	if p.fail {
		return nil, errors.New("provider unavailable")
	}
	return &domain.OptimizedRouteResult{DistanceKM: p.distanceKM, DurationMin: 12, OptimizedIndices: []int{0}}, nil
}

func TestMapsProviderRegistryFailsOverWithProviderAttribution(t *testing.T) {
	primary := &fakeMapsProvider{name: "primary", fail: true}
	secondary := &fakeMapsProvider{name: "secondary", distanceKM: 4.2}
	registry := NewMapsProviderRegistry()
	if err := registry.Register(primary); err != nil {
		t.Fatal(err)
	}
	if err := registry.Register(secondary); err != nil {
		t.Fatal(err)
	}

	result, err := registry.GetDistanceMatrixWithMetadata(context.Background(), -6.2, 106.8, -6.21, 106.81, true)
	if err != nil {
		t.Fatalf("failover returned error: %v", err)
	}
	if result.Provider != "secondary" || result.DistanceKM != 4.2 {
		t.Fatalf("unexpected failover result: %+v", result)
	}
	if primary.calls != 1 || secondary.calls != 1 {
		t.Fatalf("expected one call per provider, got primary=%d secondary=%d", primary.calls, secondary.calls)
	}
}

func TestMapsProviderRegistryOpensCircuitAndReturnsNoFabricatedRoute(t *testing.T) {
	provider := &fakeMapsProvider{name: "unavailable", fail: true}
	registry := NewMapsProviderRegistry()
	if err := registry.Register(provider); err != nil {
		t.Fatal(err)
	}

	for i := 0; i < 3; i++ {
		result, err := registry.GetDistanceMatrixWithMetadata(context.Background(), -6.2, 106.8, -6.21, 106.81, true)
		if err == nil || result != (domain.DistanceMatrixResult{}) {
			t.Fatalf("attempt %d fabricated a route or omitted error: result=%+v err=%v", i, result, err)
		}
	}
	if provider.calls != 3 {
		t.Fatalf("circuit did not open after threshold, calls=%d", provider.calls)
	}
	_, _ = registry.GetDistanceMatrixWithMetadata(context.Background(), -6.2, 106.8, -6.21, 106.81, true)
	if provider.calls != 3 {
		t.Fatalf("open circuit still called provider, calls=%d", provider.calls)
	}
	diagnostics := registry.Diagnostics()
	if len(diagnostics) != 1 || diagnostics[0].State != "circuit_open" || diagnostics[0].QuotaStatus != "unknown" {
		t.Fatalf("unexpected provider diagnostics: %+v", diagnostics)
	}
}

func TestMapsProviderRegistryRejectsProviderWithoutCapability(t *testing.T) {
	registry := NewMapsProviderRegistry()
	if err := registry.Register(&invalidMapsProvider{}); err == nil {
		t.Fatal("expected provider without declared capabilities to be rejected")
	}
}

type invalidMapsProvider struct{}

func (*invalidMapsProvider) Name() string                          { return "invalid" }
func (*invalidMapsProvider) Capabilities() []domain.MapsCapability { return nil }
func (*invalidMapsProvider) GetDistanceMatrix(context.Context, float64, float64, float64, float64, bool) (float64, float64, string, string, error) {
	return 0, 0, "", "", nil
}
func (*invalidMapsProvider) OptimizeWaypoints(context.Context, domain.Waypoint, []domain.Waypoint, domain.Waypoint, bool) (*domain.OptimizedRouteResult, error) {
	return nil, nil
}
