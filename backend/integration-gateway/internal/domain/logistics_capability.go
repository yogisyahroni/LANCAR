package domain

// LogisticsCapability identifies one operation a provider explicitly supports.
// Providers are allowed to expose only the capabilities they actually implement.
type LogisticsCapability string

const (
	CapabilityTariff       LogisticsCapability = "tariff"
	CapabilityShipment     LogisticsCapability = "shipment"
	CapabilityTracking     LogisticsCapability = "tracking_pull"
	CapabilityWebhook      LogisticsCapability = "tracking_webhook"
	CapabilityPickup       LogisticsCapability = "pickup"
	CapabilityCancellation LogisticsCapability = "cancellation"
	CapabilityLabel        LogisticsCapability = "label"
	CapabilityPOD          LogisticsCapability = "pod"
	CapabilityInsurance    LogisticsCapability = "insurance"
	CapabilityCOD          LogisticsCapability = "cod"
	CapabilityReturn       LogisticsCapability = "return"
	CapabilityClaim        LogisticsCapability = "claim"
)

// ProviderService is an optional native service advertised by a provider.
// Tariff responses remain authoritative for services that are lane-dependent.
type ProviderService struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type ProviderDescriptor struct {
	Code               string                `json:"code"`
	Name               string                `json:"name"`
	Capabilities       []LogisticsCapability `json:"capabilities"`
	Services           []ProviderService     `json:"services,omitempty"`
	TrackingMode       string                `json:"tracking_mode,omitempty"`
	TrackingDegraded   bool                  `json:"tracking_degraded"`
	Available          bool                  `json:"available"`
	AvailabilityReason string                `json:"availability_reason,omitempty"`
}

type ProviderDiagnostic struct {
	Code               string                `json:"code"`
	Name               string                `json:"name"`
	Ready              bool                  `json:"ready"`
	Missing            []LogisticsCapability `json:"missing_capabilities,omitempty"`
	Capabilities       []LogisticsCapability `json:"capabilities"`
	Available          bool                  `json:"available"`
	AvailabilityReason string                `json:"availability_reason,omitempty"`
}
