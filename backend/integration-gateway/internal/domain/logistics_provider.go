package domain

import "context"

// Small capability interfaces keep unsupported provider operations explicit.
type TariffProvider interface {
	CheckTariff(ctx context.Context, req TariffRequest) (*TariffResponse, error)
}

type ShipmentProvider interface {
	CreateOrder(ctx context.Context, req LogisticsOrderRequest) (*LogisticsOrderResponse, error)
}

type TrackingPullProvider interface {
	TrackOrder(ctx context.Context, awb string) (*TrackingResponse, error)
}

type PickupProvider interface{}
type CancellationProvider interface{}
type LabelProvider interface{}
type PODProvider interface{}
type InsuranceProvider interface{}
type CODProvider interface{}
type ReturnProvider interface{}
type ClaimProvider interface{}

// ProviderAvailability is an optional runtime health contract. Providers that
// depend on credentials or a circuit breaker implement it so the registry can
// expose selectable providers without leaking fake availability to clients.
type ProviderAvailability interface {
	Availability() (available bool, reason string)
}

type ProviderRegistration struct {
	Descriptor ProviderDescriptor
	Tariff     TariffProvider
	Shipment   ShipmentProvider
	Tracking   TrackingPullProvider
	Webhook    WebhookAdapter
}

type LogisticsProviderRegistry interface {
	Get(code string) (ProviderRegistration, bool)
	List() []ProviderDescriptor
	Validate() error
	Diagnostics() []ProviderDiagnostic
}
