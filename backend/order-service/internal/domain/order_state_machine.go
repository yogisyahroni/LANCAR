package domain

import "fmt"

// OrderActor identifies the authority that is attempting a state transition.
// Internal workers use platform; external actors must be narrowed by the HTTP
// handler before the transition reaches the service.
type OrderActor string

const (
	OrderActorPlatform OrderActor = "platform"
	OrderActorAdmin    OrderActor = "admin"
	OrderActorCourier  OrderActor = "courier"
	OrderActorMerchant OrderActor = "merchant"
	OrderActorCustomer OrderActor = "customer"
	OrderActorCarrier  OrderActor = "carrier"
)

type InvalidOrderTransitionError struct {
	Current OrderStatus
	Target  OrderStatus
	Actor   OrderActor
	Reason  string
}

func (e *InvalidOrderTransitionError) Error() string {
	if e.Reason == "terminal state cannot move backward" {
		return fmt.Sprintf("order sudah berstatus final (%s), tidak bisa diubah ke %s", e.Current, e.Target)
	}
	if e.Reason != "" {
		return fmt.Sprintf("invalid order transition %s -> %s for %s: %s", e.Current, e.Target, e.Actor, e.Reason)
	}
	return fmt.Sprintf("invalid order transition %s -> %s for %s", e.Current, e.Target, e.Actor)
}

type ConcurrentOrderTransitionError struct {
	OrderID string
}

func (e *ConcurrentOrderTransitionError) Error() string {
	return fmt.Sprintf("order %s changed before this transition was committed", e.OrderID)
}

func IsTerminalOrderStatus(status OrderStatus) bool {
	switch status {
	case StatusDelivered, StatusCancelled:
		return true
	default:
		return false
	}
}

// allowedOrderTransitions is deliberately explicit. A transition can only be
// accepted when both its lifecycle edge and actor policy match. Platform is
// used by workers and internal orchestration after their endpoint-specific
// authorization has already succeeded.
var allowedOrderTransitions = map[OrderStatus]map[OrderStatus]bool{
	StatusPendingPayment:      {StatusPendingAssignment: true, StatusPendingMerchant: true, StatusScheduled: true, StatusReadyForPickup: true, StatusCancelled: true},
	StatusScheduled:           {StatusPendingMerchant: true, StatusCancelled: true},
	StatusPendingMerchant:     {StatusPreparing: true, StatusCancelled: true},
	StatusPreparing:           {StatusSearching: true, StatusCancelled: true},
	StatusPending:             {StatusPendingAssignment: true, StatusSearching: true, StatusReadyForPickup: true, StatusCancelled: true},
	StatusPendingAssignment:   {StatusSearching: true, StatusReadyForPickup: true, StatusCancelled: true},
	StatusReadyForPickup:      {StatusPickedUp: true, StatusSearching: true, StatusCancelled: true},
	StatusSearching:           {StatusAssigned: true, StatusAccepted: true, StatusNoCourierFound: true, StatusCancelled: true},
	StatusNoCourierFound:      {StatusSearching: true, StatusCancelled: true},
	StatusAssigned:            {StatusAccepted: true, StatusSearching: true, StatusCancelled: true},
	StatusAccepted:            {StatusPickupArrived: true, StatusSearching: true, StatusCancelled: true},
	StatusPickupArrived:       {StatusPickingUp: true, StatusCancelled: true},
	StatusPickingUp:           {StatusPickedUp: true, StatusCancelled: true},
	StatusPickedUp:            {StatusInboundOrigin: true, StatusDelivering: true, StatusFailedDelivery: true},
	StatusInboundOrigin:       {StatusOutboundOrigin: true, StatusFailedDelivery: true},
	StatusOutboundOrigin:      {StatusInboundDestination: true, StatusFailedDelivery: true},
	StatusInboundDestination:  {StatusOutboundDestination: true, StatusFailedDelivery: true},
	StatusOutboundDestination: {StatusDelivering: true, StatusFailedDelivery: true},
	StatusDelivering:          {StatusDelivered: true, StatusFailedDelivery: true, StatusReturnToSender: true},
	StatusFailedDelivery:      {StatusSearching: true, StatusReturnToSender: true, StatusCancelled: true},
	StatusReturnToSender:      {StatusCancelled: true},
}

var courierTransitions = map[OrderStatus]bool{
	StatusPickupArrived: true, StatusPickingUp: true, StatusPickedUp: true,
	StatusInboundOrigin: true, StatusOutboundOrigin: true, StatusInboundDestination: true,
	StatusOutboundDestination: true, StatusDelivering: true, StatusDelivered: true,
	StatusFailedDelivery: true, StatusReturnToSender: true,
}

var merchantTransitions = map[OrderStatus]bool{StatusPreparing: true, StatusCancelled: true}

var customerTransitions = map[OrderStatus]bool{StatusCancelled: true}

var carrierTransitions = map[OrderStatus]bool{
	StatusReadyForPickup: true, StatusPickedUp: true, StatusDelivering: true, StatusDelivered: true,
	StatusFailedDelivery: true, StatusReturnToSender: true, StatusCancelled: true,
}

func actorMayTransition(actor OrderActor, target OrderStatus, category CanonicalServiceCategory) bool {
	switch actor {
	case OrderActorPlatform, OrderActorAdmin:
		return true
	case OrderActorCourier:
		return courierTransitions[target]
	case OrderActorMerchant:
		return category == CanonicalFood && merchantTransitions[target]
	case OrderActorCustomer:
		return customerTransitions[target]
	case OrderActorCarrier:
		return category == CanonicalAggregator && carrierTransitions[target]
	default:
		return false
	}
}

// ValidateOrderTransition validates the state edge independently from storage.
// Same-state delivery is idempotent and therefore accepted by callers before
// persistence; terminal states reject every different target.
func ValidateOrderTransition(current, target OrderStatus, actor OrderActor, category CanonicalServiceCategory) error {
	if current == target {
		return nil
	}
	if IsTerminalOrderStatus(current) {
		return &InvalidOrderTransitionError{Current: current, Target: target, Actor: actor, Reason: "terminal state cannot move backward"}
	}
	if !allowedOrderTransitions[current][target] {
		return &InvalidOrderTransitionError{Current: current, Target: target, Actor: actor, Reason: "lifecycle edge is not allowed"}
	}
	if !actorMayTransition(actor, target, category) {
		return &InvalidOrderTransitionError{Current: current, Target: target, Actor: actor, Reason: "actor is not authorized for this state"}
	}
	return nil
}
