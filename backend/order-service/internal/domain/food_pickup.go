package domain

import (
	"errors"
	"strings"
	"time"
)

// FoodPickupWaitState is the server-side interpretation of the courier's
// pickup wait lifecycle. It is derived from authoritative order timestamps
// and status, never from a client countdown.
type FoodPickupWaitState string

const (
	FoodPickupWaitingForArrival FoodPickupWaitState = "waiting_for_arrival"
	FoodPickupWaitingForReady   FoodPickupWaitState = "waiting_for_ready"
	FoodPickupReady             FoodPickupWaitState = "ready_for_pickup"
	FoodPickupPickedUp          FoodPickupWaitState = "picked_up"
)

type FoodPickupWait struct {
	State       FoodPickupWaitState `json:"state"`
	ArrivedAt   *time.Time          `json:"arrived_at,omitempty"`
	ReadyAt     *time.Time          `json:"ready_at,omitempty"`
	WaitSeconds int64               `json:"wait_seconds"`
}

// ResolveFoodPickupWait derives the wait phase. A missing arrival timestamp
// means no timer has started; once arrived, the timer is measured against the
// supplied server time. searching/ready_for_pickup is the ready signal emitted
// by the food preparation/matching workflow.
func ResolveFoodPickupWait(status OrderStatus, foodReadyAt, arrivedAt *time.Time, now time.Time) FoodPickupWait {
	result := FoodPickupWait{State: FoodPickupWaitingForArrival, ArrivedAt: arrivedAt, ReadyAt: foodReadyAt}
	if status == StatusPickedUp || status == StatusDelivering || status == StatusDelivered {
		result.State = FoodPickupPickedUp
	} else if arrivedAt != nil {
		result.State = FoodPickupWaitingForReady
		if status == StatusSearching || status == StatusReadyForPickup || (foodReadyAt != nil && !foodReadyAt.After(now)) {
			result.State = FoodPickupReady
		}
		if now.After(*arrivedAt) {
			result.WaitSeconds = int64(now.Sub(*arrivedAt).Seconds())
		}
	}
	return result
}

type FoodPickupIssueCode string

const (
	FoodPickupIssueNotReady     FoodPickupIssueCode = "not_ready"
	FoodPickupIssuePartial      FoodPickupIssueCode = "partial_handoff"
	FoodPickupIssueMerchantLate FoodPickupIssueCode = "merchant_timeout"
)

var ErrInvalidFoodPickupIssue = errors.New("INVALID_FOOD_PICKUP_ISSUE")

// ValidateFoodPickupIssue keeps operational reports structured and bounded.
// The note is evidence context; the code remains the machine-readable cause.
func ValidateFoodPickupIssue(code FoodPickupIssueCode, note string) error {
	switch code {
	case FoodPickupIssueNotReady, FoodPickupIssuePartial, FoodPickupIssueMerchantLate:
		if len([]rune(strings.TrimSpace(note))) < 8 {
			return ErrInvalidFoodPickupIssue
		}
		return nil
	default:
		return ErrInvalidFoodPickupIssue
	}
}
