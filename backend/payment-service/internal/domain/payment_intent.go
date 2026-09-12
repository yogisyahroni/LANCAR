package domain

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

// PaymentIntentState is the only state vocabulary exposed by the payment
// orchestration boundary. Provider-specific statuses are retained separately
// on PaymentIntentEvent and never become an order truth by themselves.
type PaymentIntentState string

const (
	PaymentIntentCreated           PaymentIntentState = "CREATED"
	PaymentIntentRequiresAction    PaymentIntentState = "REQUIRES_ACTION"
	PaymentIntentProcessing        PaymentIntentState = "PROCESSING"
	PaymentIntentAuthorized        PaymentIntentState = "AUTHORIZED"
	PaymentIntentPaid              PaymentIntentState = "PAID"
	PaymentIntentCaptured          PaymentIntentState = "CAPTURED"
	PaymentIntentSettled           PaymentIntentState = "SETTLED"
	PaymentIntentFailed            PaymentIntentState = "FAILED"
	PaymentIntentCancelled         PaymentIntentState = "CANCELLED"
	PaymentIntentExpired           PaymentIntentState = "EXPIRED"
	PaymentIntentPartiallyRefunded PaymentIntentState = "PARTIALLY_REFUNDED"
	PaymentIntentRefunded          PaymentIntentState = "REFUNDED"
	PaymentIntentChargeback        PaymentIntentState = "CHARGEBACK"
)

var (
	ErrInvalidPaymentTransition = errors.New("invalid payment intent transition")
	ErrPaymentIntentTerminal    = errors.New("payment intent is terminal")
	ErrPaymentEventReplay       = errors.New("payment provider event already applied")
)

type PaymentIntent struct {
	ID                 uuid.UUID          `json:"id"`
	OrderID            uuid.UUID          `json:"order_id"`
	CustomerID         uuid.UUID          `json:"customer_id"`
	MarketCode         string             `json:"market_code"`
	Currency           string             `json:"currency"`
	AmountMinor        int64              `json:"amount_minor"`
	Provider           string             `json:"provider"`
	PaymentMethod      string             `json:"payment_method"`
	State              PaymentIntentState `json:"state"`
	ProviderRawStatus  string             `json:"provider_raw_status,omitempty"`
	ProviderReference  string             `json:"provider_reference,omitempty"`
	RoutingRuleVersion string             `json:"routing_rule_version,omitempty"`
	IdempotencyKey     string             `json:"-"`
	RequestHash        string             `json:"-"`
	Version            int64              `json:"version"`
	ExpiresAt          time.Time          `json:"expires_at"`
	CreatedAt          time.Time          `json:"created_at"`
	UpdatedAt          time.Time          `json:"updated_at"`
}

type PaymentIntentEvent struct {
	ID                uuid.UUID          `json:"id"`
	IntentID          uuid.UUID          `json:"intent_id"`
	EventID           string             `json:"event_id"`
	Source            string             `json:"source"`
	ProviderRawStatus string             `json:"provider_raw_status"`
	NormalizedState   PaymentIntentState `json:"normalized_state"`
	ProviderReference string             `json:"provider_reference,omitempty"`
	Payload           []byte             `json:"payload,omitempty"`
	OccurredAt        time.Time          `json:"occurred_at"`
}

type PaymentIntentRepository interface {
	Create(ctx context.Context, intent *PaymentIntent) (*PaymentIntent, error)
	GetByID(ctx context.Context, id, customerID uuid.UUID) (*PaymentIntent, error)
	ApplyEvent(ctx context.Context, event PaymentIntentEvent) (*PaymentIntent, error)
}

func IsTerminalPaymentIntentState(state PaymentIntentState) bool {
	switch state {
	case PaymentIntentFailed, PaymentIntentCancelled, PaymentIntentExpired,
		PaymentIntentRefunded, PaymentIntentChargeback:
		return true
	default:
		return false
	}
}

func canTransitionPaymentIntent(from, to PaymentIntentState) bool {
	if from == to {
		return true
	}
	switch from {
	case PaymentIntentCreated:
		return to == PaymentIntentRequiresAction || to == PaymentIntentProcessing || to == PaymentIntentFailed || to == PaymentIntentCancelled || to == PaymentIntentExpired
	case PaymentIntentRequiresAction:
		return to == PaymentIntentProcessing || to == PaymentIntentAuthorized || to == PaymentIntentPaid || to == PaymentIntentCaptured || to == PaymentIntentFailed || to == PaymentIntentCancelled || to == PaymentIntentExpired
	case PaymentIntentProcessing:
		return to == PaymentIntentAuthorized || to == PaymentIntentPaid || to == PaymentIntentCaptured || to == PaymentIntentSettled || to == PaymentIntentFailed || to == PaymentIntentCancelled || to == PaymentIntentExpired
	case PaymentIntentAuthorized, PaymentIntentPaid:
		return to == PaymentIntentCaptured || to == PaymentIntentSettled || to == PaymentIntentFailed || to == PaymentIntentCancelled || to == PaymentIntentPartiallyRefunded || to == PaymentIntentRefunded || to == PaymentIntentChargeback
	case PaymentIntentCaptured:
		return to == PaymentIntentSettled || to == PaymentIntentPartiallyRefunded || to == PaymentIntentRefunded || to == PaymentIntentChargeback
	case PaymentIntentSettled:
		return to == PaymentIntentPartiallyRefunded || to == PaymentIntentRefunded || to == PaymentIntentChargeback
	case PaymentIntentPartiallyRefunded:
		return to == PaymentIntentRefunded || to == PaymentIntentChargeback
	default:
		return false
	}
}

// ApplyEvent is idempotent on the provider event id. A late success received
// after cancellation/expiry is retained by the caller as an exception but
// cannot revive the intent or mark its order paid.
func (p *PaymentIntent) ApplyEvent(event PaymentIntentEvent) error {
	if p == nil || event.IntentID != p.ID {
		return ErrInvalidPaymentTransition
	}
	if strings.TrimSpace(event.EventID) == "" {
		return errors.New("payment provider event id is required")
	}
	if IsTerminalPaymentIntentState(p.State) {
		return ErrPaymentIntentTerminal
	}
	if !canTransitionPaymentIntent(p.State, event.NormalizedState) {
		return ErrInvalidPaymentTransition
	}
	p.State = event.NormalizedState
	p.ProviderRawStatus = event.ProviderRawStatus
	if event.ProviderReference != "" {
		p.ProviderReference = event.ProviderReference
	}
	p.Version++
	p.UpdatedAt = event.OccurredAt
	return nil
}

// CanTransition is exported for persistence adapters and contract tests.
func CanTransition(from, to PaymentIntentState) bool {
	return canTransitionPaymentIntent(from, to)
}
