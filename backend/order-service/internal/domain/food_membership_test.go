package domain

import (
	"testing"
	"time"
)

func TestCalculateFoodMembershipBenefitExclusionsAndCap(t *testing.T) {
	now := time.Now()
	entitlement := &FoodMembershipEntitlement{ID: "ent-1", Status: MembershipActive, CurrentPeriodStart: now.Add(-time.Hour), CurrentPeriodEnd: now.Add(time.Hour), FreeDeliveryRemainingIDR: 7000}
	plan := &FoodMembershipPlan{ID: "plan-1", MinimumSubtotalIDR: 50000}
	benefit := CalculateFoodMembershipBenefit(entitlement, plan, 60000, 10000, DeliveryMethodDelivery)
	if !benefit.Eligible || benefit.DiscountIDR != 7000 || benefit.EntitlementID != "ent-1" {
		t.Fatalf("unexpected benefit: %+v", benefit)
	}
	if excluded := CalculateFoodMembershipBenefit(entitlement, plan, 60000, 10000, DeliveryMethodPickup); excluded.Eligible || excluded.Reason != "pickup_excluded" {
		t.Fatalf("pickup should be excluded: %+v", excluded)
	}
	if belowMinimum := CalculateFoodMembershipBenefit(entitlement, plan, 49999, 10000, DeliveryMethodDelivery); belowMinimum.Eligible || belowMinimum.Reason != "minimum_subtotal_not_met" {
		t.Fatalf("minimum should be enforced: %+v", belowMinimum)
	}
}

func TestResolveFoodMembershipPaymentTransition(t *testing.T) {
	tests := []struct {
		name, current, payment, want string
	}{
		{"pending success", MembershipPending, MembershipPaymentSucceeded, MembershipActive},
		{"pending failure", MembershipPending, MembershipPaymentFailed, MembershipCancelled},
		{"active failure", MembershipActive, MembershipPaymentFailed, MembershipGrace},
		{"grace failure", MembershipGrace, MembershipPaymentFailed, MembershipExpired},
		{"refund", MembershipActive, MembershipPaymentRefunded, MembershipRefunded},
		{"cancel", MembershipPending, MembershipPaymentCancelled, MembershipCancelled},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ResolveFoodMembershipPaymentTransition(tt.current, tt.payment)
			if err != nil || got != tt.want {
				t.Fatalf("transition = %q, %v; want %q", got, err, tt.want)
			}
		})
	}
	if _, err := ResolveFoodMembershipPaymentTransition(MembershipPending, "UNKNOWN"); err == nil {
		t.Fatal("expected unsupported payment state error")
	}
}
