package service

import (
	"context"
	"fmt"

	"tembus/integration-gateway/internal/domain"
)

// ProviderRegistry is the minimum catalog contract needed by the
// orchestrator. Keeping it narrow lets tests and future registries plug in
// without coupling the service to provider construction or credentials.
type ProviderRegistry interface {
	Resolve(reference string) (domain.LogisticsProvider, error)
	List() []domain.ProviderDescriptor
}

type LogisticsOrchestrator struct {
	registry ProviderRegistry
}

func NewLogisticsOrchestrator(registry ProviderRegistry) *LogisticsOrchestrator {
	return &LogisticsOrchestrator{registry: registry}
}

func (o *LogisticsOrchestrator) ListProviders() []domain.ProviderDescriptor {
	if o == nil || o.registry == nil {
		return nil
	}
	return o.registry.List()
}

func (o *LogisticsOrchestrator) ProviderHealth(ctx context.Context) []domain.ProviderHealth {
	if o == nil || o.registry == nil {
		return nil
	}
	if registry, ok := o.registry.(interface {
		Health(context.Context) []domain.ProviderHealth
	}); ok {
		return registry.Health(ctx)
	}
	return nil
}

func (o *LogisticsOrchestrator) CheckTariff(ctx context.Context, reference string, req domain.TariffRequest) (*domain.TariffResponse, error) {
	p, err := o.resolve(reference, domain.CapabilityTariff)
	if err != nil {
		return nil, err
	}
	operation, ok := p.(domain.TariffProvider)
	if !ok {
		return nil, unsupportedCapability(p.Identity(), domain.CapabilityTariff)
	}
	result, err := operation.CheckTariff(ctx, req)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, fmt.Errorf("provider %q returned an empty tariff response", p.Identity().Code)
	}
	identity := p.Identity()
	result.Provider = identity.Name
	result.ProviderID = identity.ID
	result.ProviderCode = identity.Code
	result.ProviderName = identity.Name
	return result, nil
}

func (o *LogisticsOrchestrator) CreateOrder(ctx context.Context, reference string, req domain.LogisticsOrderRequest) (*domain.LogisticsOrderResponse, error) {
	p, err := o.resolve(reference, domain.CapabilityShipment)
	if err != nil {
		return nil, err
	}
	operation, ok := p.(domain.ShipmentProvider)
	if !ok {
		return nil, unsupportedCapability(p.Identity(), domain.CapabilityShipment)
	}
	return operation.CreateOrder(ctx, req)
}

func (o *LogisticsOrchestrator) TrackOrder(ctx context.Context, reference, awb string) (*domain.TrackingResponse, error) {
	p, err := o.resolve(reference, domain.CapabilityTrackingPull)
	if err != nil {
		return nil, err
	}
	operation, ok := p.(domain.TrackingPullProvider)
	if !ok {
		return nil, unsupportedCapability(p.Identity(), domain.CapabilityTrackingPull)
	}
	return operation.TrackOrder(ctx, awb)
}

func (o *LogisticsOrchestrator) resolve(reference string, capability domain.Capability) (domain.LogisticsProvider, error) {
	if o == nil || o.registry == nil {
		return nil, fmt.Errorf("logistics provider registry is not configured")
	}
	p, err := o.registry.Resolve(reference)
	if err != nil {
		return nil, err
	}
	for _, supported := range p.Capabilities() {
		if supported == capability {
			return p, nil
		}
	}
	return nil, unsupportedCapability(p.Identity(), capability)
}

func unsupportedCapability(identity domain.ProviderIdentity, capability domain.Capability) error {
	return fmt.Errorf("provider %q does not support capability %q", identity.Code, capability)
}
