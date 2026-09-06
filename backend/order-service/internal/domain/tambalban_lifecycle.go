package domain

import "strings"

// IsTambalBanService identifies the two roadside tire-repair products without
// relying on the broader canonical on-demand category.
func IsTambalBanService(serviceSubType, serviceCode string) bool {
	value := strings.ToLower(strings.TrimSpace(serviceSubType))
	if value == "" {
		value = strings.ToLower(strings.TrimSpace(serviceCode))
	}
	return strings.HasPrefix(value, "tambal_ban")
}

// ValidateTambalBanLifecycle adds the roadside-specific ordering constraint on
// top of the generic order state machine. We intentionally reuse canonical
// order statuses so settlement, tracking, notifications and reconciliation keep
// one source of truth.
//
// Mobile stage mapping:
//
//	accepted       = technician is navigating
//	pickup_arrived = technician arrived on site
//	picking_up     = identity/inspection stage
//	picked_up      = repair in progress (before proof already captured)
//	delivering     = repair finished, completion proof/report pending
//	delivered      = proof/report accepted and service completed
func ValidateTambalBanLifecycle(serviceSubType, serviceCode string, current, target OrderStatus, actor OrderActor) error {
	if !IsTambalBanService(serviceSubType, serviceCode) {
		return nil
	}
	if current == target {
		return nil
	}
	// Admin/platform recovery still goes through the generic state machine and
	// audit boundary; this guard only prevents courier-side lifecycle shortcuts.
	if actor == OrderActorAdmin || actor == OrderActorPlatform {
		return nil
	}
	if actor != OrderActorCourier {
		return nil
	}

	// Cancellation/reassignment are governed by the existing generic state
	// machine and dedicated cancellation flows, not by the happy-path service
	// sequence below.
	if target == StatusCancelled || target == StatusSearching || target == StatusFailedDelivery {
		return nil
	}

	allowed := map[OrderStatus]OrderStatus{
		StatusSearching:     StatusAccepted,
		StatusAssigned:      StatusAccepted,
		StatusAccepted:      StatusPickupArrived,
		StatusPickupArrived: StatusPickingUp,
		StatusPickingUp:     StatusPickedUp,
		StatusPickedUp:      StatusDelivering,
		StatusDelivering:    StatusDelivered,
	}

	if expected, ok := allowed[current]; ok && expected == target {
		return nil
	}

	return &InvalidOrderTransitionError{
		Current: current,
		Target:  target,
		Actor:   actor,
		Reason:  "tambal ban lifecycle must follow arrival -> inspection -> repair -> proof -> completion",
	}
}
