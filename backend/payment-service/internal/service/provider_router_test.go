package service

import (
	"context"
	"testing"
	"time"

	"tembus/payment-service/internal/domain"
	"tembus/payment-service/internal/provider"

	"github.com/google/uuid"
)

type contractAdapter struct {
	name         string
	capabilities map[provider.Capability]bool
}

func (a contractAdapter) Name() string                               { return a.name }
func (a contractAdapter) Capabilities() map[provider.Capability]bool { return a.capabilities }
func (a contractAdapter) Create(context.Context, provider.PaymentRequest) (provider.PaymentResponse, error) {
	return provider.PaymentResponse{}, provider.ErrCapabilityUnsupported
}
func (a contractAdapter) Lookup(context.Context, string) (provider.PaymentResponse, error) {
	return provider.PaymentResponse{}, provider.ErrCapabilityUnsupported
}
func (a contractAdapter) Refund(context.Context, provider.RefundRequest) (provider.RefundResponse, error) {
	return provider.RefundResponse{}, provider.ErrCapabilityUnsupported
}
func (a contractAdapter) VerifyWebhook(context.Context, []byte, string) error {
	return provider.ErrCapabilityUnsupported
}

func TestProviderRouterSkipsDisabledUnsupportedAndRoutesWithVersion(t *testing.T) {
	registry := provider.NewRegistry(
		contractAdapter{name: "disabled", capabilities: map[provider.Capability]bool{provider.CapabilityCreate: true}},
		contractAdapter{name: "healthy", capabilities: map[provider.Capability]bool{provider.CapabilityCreate: true}},
	)
	router := NewProviderRouter(registry, nil)
	router.SetHealth("disabled", ProviderDisabled, "provider outage", false)
	router.SetHealth("healthy", ProviderHealthy, "", true)
	adapter, version, err := router.Route(RoutingContext{MarketCode: "id-jk", Currency: "IDR", PaymentMethod: "qris", Capability: provider.CapabilityCreate, RuleVersion: "route-2026-09-12"}, []ProviderCandidate{{Provider: "disabled"}, {Provider: "healthy"}})
	if err != nil || adapter.Name() != "healthy" || version != "route-2026-09-12" {
		t.Fatalf("unexpected route: adapter=%v version=%s err=%v", adapter, version, err)
	}
}

func TestProviderRouterRequiresAuditedExpiringOverrideAndSafeFailover(t *testing.T) {
	registry := provider.NewRegistry(contractAdapter{name: "healthy", capabilities: map[provider.Capability]bool{provider.CapabilityCreate: true}})
	var audited RoutingOverride
	router := NewProviderRouter(registry, func(value RoutingOverride) { audited = value })
	override := RoutingOverride{Provider: "healthy", MarketCode: "id-jk", Reason: "planned maintenance", ActorID: "ops-1", ExpiresAt: time.Now().UTC().Add(time.Hour)}
	if err := router.SetOverride(override); err != nil {
		t.Fatal(err)
	}
	if audited.Reason != override.Reason || audited.ActorID != override.ActorID {
		t.Fatalf("override was not audited: %+v", audited)
	}
	intent := &domain.PaymentIntent{ID: uuidForTest(), State: domain.PaymentIntentProcessing}
	if CanFailover(intent, true, false) {
		t.Fatal("must not fail over after mutation without lookup proof")
	}
	if !CanFailover(intent, true, true) {
		t.Fatal("lookup-proven no-charge should permit failover")
	}
}

func uuidForTest() uuid.UUID { return uuid.New() }
