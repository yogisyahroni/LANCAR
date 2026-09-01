package domain

import (
	"context"
	"fmt"
)

type ProviderHealth struct {
	ProviderID   string `json:"provider_id"`
	ProviderCode string `json:"provider_code"`
	ProviderName string `json:"provider_name"`
	Status       string `json:"status"`
	Reason       string `json:"reason,omitempty"`
}

// ProviderHealthProvider exposes a non-secret readiness diagnostic. It must
// not leak credentials or claim upstream connectivity unless the adapter has
// actually verified it.
type ProviderHealthProvider interface {
	Health(ctx context.Context) ProviderHealth
}

// Capability-specific interfaces are intentionally independent. Providers
// can implement one operation without inheriting unrelated carrier features.
type TrackingWebhookProvider interface {
	VerifyAndNormalizeWebhook(ctx context.Context, payload []byte, signature string) (*CarrierEvent, error)
}

type PickupProvider interface {
	SchedulePickup(ctx context.Context, req PickupRequest) (*PickupResponse, error)
}

type CancellationProvider interface {
	CancelShipment(ctx context.Context, req CancellationRequest) error
}

type LabelProvider interface {
	CreateLabel(ctx context.Context, req LabelRequest) (*LabelResponse, error)
}

type PODProvider interface {
	GetProofOfDelivery(ctx context.Context, awb string) (*PODResponse, error)
}

type InsuranceProvider interface {
	QuoteInsurance(ctx context.Context, req InsuranceRequest) (*InsuranceResponse, error)
}

type CODProvider interface {
	CreateCODShipment(ctx context.Context, req CODRequest) (*CODResponse, error)
}

type ReturnProvider interface {
	CreateReturn(ctx context.Context, req ReturnRequest) (*ReturnResponse, error)
}

type ClaimProvider interface {
	CreateClaim(ctx context.Context, req ClaimRequest) (*ClaimResponse, error)
}

// Capability identifies an operation an adapter explicitly supports.
type Capability string

const (
	CapabilityTariff          Capability = "tariff"
	CapabilityShipment        Capability = "shipment"
	CapabilityTrackingPull    Capability = "tracking_pull"
	CapabilityTrackingWebhook Capability = "tracking_webhook"
	CapabilityPickup          Capability = "pickup"
	CapabilityCancellation    Capability = "cancellation"
	CapabilityLabel           Capability = "label"
	CapabilityPOD             Capability = "pod"
	CapabilityInsurance       Capability = "insurance"
	CapabilityCOD             Capability = "cod"
	CapabilityReturn          Capability = "return"
	CapabilityClaim           Capability = "claim"
)

// ProviderIdentity is the canonical, stable provider metadata exposed to
// consumers. Provider-specific service code/name remains in tariff options.
type ProviderIdentity struct {
	ID   string `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}

// ProviderDescriptor is the safe-to-expose registry projection. It contains
// no credentials or provider configuration.
type ProviderDescriptor struct {
	ID           string       `json:"id"`
	Code         string       `json:"code"`
	Name         string       `json:"name"`
	Capabilities []Capability `json:"capabilities"`
}

// These request/response envelopes are deliberately provider-neutral. Native
// fields belong in adapter-owned mapping code, while the shared orchestration
// layer can evolve without a giant provider interface.
type CarrierEvent struct {
	ProviderStatus string `json:"provider_status"`
	Description    string `json:"description"`
	AWBNumber      string `json:"awb_number"`
}

type PickupRequest struct {
	AWBNumber string `json:"awb_number"`
}
type PickupResponse struct {
	ConfirmationID string `json:"confirmation_id"`
}
type CancellationRequest struct {
	AWBNumber string `json:"awb_number"`
}
type LabelRequest struct {
	AWBNumber string `json:"awb_number"`
}
type LabelResponse struct {
	URL string `json:"url"`
}
type PODResponse struct {
	AWBNumber string `json:"awb_number"`
}
type InsuranceRequest struct {
	AWBNumber string `json:"awb_number"`
}
type InsuranceResponse struct {
	Premium int64 `json:"premium"`
}
type CODRequest struct {
	AWBNumber string `json:"awb_number"`
}
type CODResponse struct {
	Status string `json:"status"`
}
type ReturnRequest struct {
	AWBNumber string `json:"awb_number"`
}
type ReturnResponse struct {
	ReferenceID string `json:"reference_id"`
}
type ClaimRequest struct {
	AWBNumber string `json:"awb_number"`
}
type ClaimResponse struct {
	ReferenceID string `json:"reference_id"`
}

func (p ProviderIdentity) Validate() error {
	if p.ID == "" || p.Code == "" || p.Name == "" {
		return fmt.Errorf("provider identity requires id, code, and name")
	}
	return nil
}

func (p ProviderIdentity) Descriptor(capabilities []Capability) ProviderDescriptor {
	return ProviderDescriptor{
		ID:           p.ID,
		Code:         p.Code,
		Name:         p.Name,
		Capabilities: append([]Capability(nil), capabilities...),
	}
}
