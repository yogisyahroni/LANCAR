package provider

import "context"

type Capability string

const (
	CapabilityCreate     Capability = "create"
	CapabilityAuthorize  Capability = "authorize"
	CapabilityCapture    Capability = "capture"
	CapabilityVoid       Capability = "void"
	CapabilityRefund     Capability = "refund"
	CapabilityTokenize   Capability = "tokenize"
	CapabilityChallenge  Capability = "challenge"
	CapabilityWebhook    Capability = "webhook"
	CapabilityChargeback Capability = "chargeback"
)

type PaymentRequest struct {
	IntentID       string
	OrderID        string
	AmountMinor    int64
	Currency       string
	MarketCode     string
	PaymentMethod  string
	IdempotencyKey string
	Token          string
}

type PaymentResponse struct {
	ProviderReference string
	RawStatus         string
	RequiresAction    bool
	ActionURL         string
	RawPayload        []byte
}

type RefundRequest struct {
	IntentID          string
	ProviderReference string
	AmountMinor       int64
	Currency          string
	IdempotencyKey    string
}

type RefundResponse struct {
	ProviderReference string
	RawStatus         string
	RawPayload        []byte
}

// Adapter is deliberately capability-oriented. Implementations must return
// ErrCapabilityUnsupported for operations the provider does not advertise;
// callers must not emulate a successful result.
type Adapter interface {
	Name() string
	Capabilities() map[Capability]bool
	Create(ctx context.Context, request PaymentRequest) (PaymentResponse, error)
	Lookup(ctx context.Context, providerReference string) (PaymentResponse, error)
	Refund(ctx context.Context, request RefundRequest) (RefundResponse, error)
	VerifyWebhook(ctx context.Context, payload []byte, signature string) error
}
