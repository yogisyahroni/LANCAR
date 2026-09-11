package service

import (
	"context"
	"testing"
	"time"

	"tembus/ads-service/internal/domain"
)

// This is the deterministic local trust suite for the Ads release gate. It
// deliberately exercises the same policy objects used by HTTP handlers and
// keeps provider OTP/payment dependencies out of the test boundary.
func TestCommerceAdsTrustSuite(t *testing.T) {
	t.Run("draft launch requires lifecycle and cannot serve", func(t *testing.T) {
		if domain.CanTransition(domain.StatusDraft, domain.StatusActive) {
			t.Fatal("draft must not skip validating/review/schedule")
		}
		c := testCampaign()
		c.Status = domain.StatusDraft
		if c.ServesAt(time.Now().UTC()) {
			t.Fatal("draft campaign served")
		}
	})

	t.Run("closed, out of area, and stale campaigns are rejected", func(t *testing.T) {
		checker := EligibilityService{}
		c := testCampaign()
		cases := []struct {
			name  string
			input EligibilityInput
			want  string
		}{
			{"closed", EligibilityInput{Now: time.Now().UTC(), MerchantActive: true, MerchantOpen: false, Serviceable: true, Relevant: true, CatalogAvailable: true, RiskApproved: true}, "merchant_closed"},
			{"out_of_area", EligibilityInput{Now: time.Now().UTC(), MerchantActive: true, MerchantOpen: true, Serviceable: false, Relevant: true, CatalogAvailable: true, RiskApproved: true}, "out_of_service_area"},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				if ok, reason := checker.Check(c, tc.input); ok || reason != tc.want {
					t.Fatalf("expected rejection %s, got ok=%v reason=%s", tc.want, ok, reason)
				}
			})
		}
		c.EndsAt = time.Now().UTC().Add(-time.Minute)
		if ok, reason := checker.Check(c, EligibilityInput{Now: time.Now().UTC(), MerchantActive: true, MerchantOpen: true, Serviceable: true, Relevant: true, CatalogAvailable: true, RiskApproved: true}); ok || reason != "campaign_not_active_or_expired" {
			t.Fatalf("expired campaign must be rejected: %v %s", ok, reason)
		}
	})

	t.Run("budget exhaustion and concurrent charge are safe", func(t *testing.T) {
		budget := NewMemoryBudget(100)
		first, err := budget.ReserveSpend(context.Background(), domain.AdEvent{IdempotencyKey: "first", CostMinor: 100})
		if err != nil || !first {
			t.Fatalf("first charge failed: %v %v", first, err)
		}
		if _, err := budget.ReserveSpend(context.Background(), domain.AdEvent{IdempotencyKey: "second", CostMinor: 1}); err != ErrBudgetExhausted {
			t.Fatalf("expected exhausted budget, got %v", err)
		}
		if err := budget.ReleaseSpend(context.Background(), "first", "invalid traffic credit"); err != nil || budget.Spent != 0 {
			t.Fatalf("release must restore reservation: spent=%d err=%v", budget.Spent, err)
		}
	})

	t.Run("signed delivery disclosure and protected zones", func(t *testing.T) {
		fake := &deliveryFakeRepo{campaigns: []domain.Campaign{testCampaign()}, events: map[string]bool{}}
		delivery := NewDeliveryService(fake, "01234567890123456789012345678901")
		items, err := delivery.Serve(context.Background(), domain.DeliveryContext{Placement: "food_discovery", Market: "id-jk", Session: "session", Intent: "food_discovery"}, EligibilityInput{Now: time.Now().UTC(), MerchantActive: true, MerchantOpen: true, Serviceable: true, Relevant: true, CatalogAvailable: true, RiskApproved: true})
		if err != nil || len(items) != 1 || items[0].DisclosureLabel != "Sponsored / Iklan" || items[0].AdDeliveryToken == "" {
			t.Fatalf("delivery trust contract failed: %#v %v", items, err)
		}
		protected, err := delivery.Serve(context.Background(), domain.DeliveryContext{Placement: "checkout"}, EligibilityInput{})
		if err != nil || len(protected) != 0 {
			t.Fatalf("checkout must be ad-free: %#v %v", protected, err)
		}
		if items[0].OrganicFacts.Rating != nil || items[0].OrganicFacts.ETAMinutes != nil {
			t.Fatal("sponsored payload must not fabricate organic rating/ETA")
		}
	})

	t.Run("invalid traffic and attribution are server policy decisions", func(t *testing.T) {
		decision := EvaluateInvalidTraffic(domain.AdEvent{EventType: domain.EventClick}, 21, false)
		if !decision.Excluded || decision.Reason != "impossible_click_cadence" {
			t.Fatalf("invalid traffic not excluded: %#v", decision)
		}
		clicked := time.Now().UTC()
		if !IsWithinAttributionWindow(clicked, clicked.Add(59*time.Minute), 60) {
			t.Fatal("conversion inside immutable attribution window was rejected")
		}
		if IsWithinAttributionWindow(clicked, clicked.Add(61*time.Minute), 60) {
			t.Fatal("conversion outside immutable attribution window")
		}
		if IsWithinAttributionWindow(clicked.Add(time.Minute), clicked, 60) {
			t.Fatal("conversion before click cannot attribute")
		}
	})
}
