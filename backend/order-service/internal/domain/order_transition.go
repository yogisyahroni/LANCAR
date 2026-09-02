package domain

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	// These errors are intentionally typed so HTTP callers can distinguish a
	// rejected transition from an infrastructure failure.
	ErrTransitionProofRequired     = errors.New("ORDER_TRANSITION_PROOF_REQUIRED")
	ErrTransitionLedgerRequired    = errors.New("ORDER_TRANSITION_LEDGER_REQUIRED")
	ErrAdminOverrideReasonRequired = errors.New("ADMIN_OVERRIDE_REASON_REQUIRED")
)

// OrderTransitionRequest is the single write contract for lifecycle changes.
// Proof and ledger effects are optional for ordinary transitions, but the
// repository requires them for delivered transitions before committing state.
type OrderTransitionRequest struct {
	OrderID             string
	ActorID             string
	Actor               OrderActor
	TargetStatus        OrderStatus
	Reason              string
	IdempotencyKey      string
	EventMessage        string
	Proof               *PackageScan
	ProofReference      string
	CourierID           string
	ClearCourier        bool
	ClearDispatchExpiry bool
	// PreparationMinutes lets the merchant acceptance transition persist its
	// food readiness timestamps inside the same database transaction.
	PreparationMinutes int
}

type OrderTransitionResult struct {
	Applied         bool
	Replayed        bool
	OrderID         string
	PreviousStatus  OrderStatus
	Status          OrderStatus
	StateVersion    int64
	AuditEventID    string
	LedgerJournalID *uuid.UUID
	ProofID         string
}

// OrderTransitionRepository owns the database transaction for state, audit,
// proof, and ledger effects. It is deliberately an optional capability so old
// in-memory repositories used by unrelated unit tests remain source compatible.
type OrderTransitionRepository interface {
	TransitionOrder(ctx context.Context, request OrderTransitionRequest) (OrderTransitionResult, error)
}

func (r OrderTransitionRequest) Normalized() OrderTransitionRequest {
	r.OrderID = strings.TrimSpace(r.OrderID)
	r.ActorID = strings.TrimSpace(r.ActorID)
	r.Reason = strings.TrimSpace(r.Reason)
	r.IdempotencyKey = strings.TrimSpace(r.IdempotencyKey)
	r.EventMessage = strings.TrimSpace(r.EventMessage)
	r.ProofReference = strings.TrimSpace(r.ProofReference)
	r.CourierID = strings.TrimSpace(r.CourierID)
	if r.Proof != nil {
		r.Proof.OrderID = strings.TrimSpace(r.Proof.OrderID)
		r.Proof.ScanType = strings.TrimSpace(r.Proof.ScanType)
		r.Proof.ScannedBy = strings.TrimSpace(r.Proof.ScannedBy)
	}
	return r
}

func TransitionEventTime() time.Time {
	return time.Now().UTC()
}
