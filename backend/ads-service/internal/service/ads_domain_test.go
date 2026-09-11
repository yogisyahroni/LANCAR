package service

import (
	"context"
	"testing"
	"time"

	"tembus/ads-service/internal/domain"
)

func testCampaign() domain.Campaign {
	now := time.Now().UTC()
	return domain.Campaign{ID: "campaign-1", OwnerID: "owner-1", MerchantID: "merchant-1", MarketCode: "id-jk", Name: "Lunch visibility", Objective: "visibility", Placements: []string{"food_discovery"}, Audience: domain.Audience{}, Budget: domain.Budget{Currency: "IDR", TotalMinor: 10000, DailyMinor: 10000, BillingModel: "cpc"}, Bid: domain.BidStrategy{Kind: "manual", MaxMinor: 100}, StartsAt: now.Add(-time.Minute), EndsAt: now.Add(time.Hour), Timezone: "Asia/Jakarta", Creative: domain.Creative{Headline: "Try our menu", AltText: "Food merchant advertisement"}, Status: domain.StatusActive, PolicyStatus: "approved", Version: 1, Attribution: domain.Attribution{Model: "last_touch", WindowMinutes: 60, Version: "ads-v1"}}
}

func TestCampaignLifecycleAndServing(t *testing.T) {
	c := testCampaign()
	if err := c.Validate(); err != nil {
		t.Fatal(err)
	}
	if !c.ServesAt(time.Now().UTC()) {
		t.Fatal("approved active campaign should serve inside window")
	}
	for _, pair := range [][2]domain.CampaignStatus{{domain.StatusDraft, domain.StatusValidating}, {domain.StatusValidating, domain.StatusReview}, {domain.StatusReview, domain.StatusScheduled}, {domain.StatusScheduled, domain.StatusActive}, {domain.StatusActive, domain.StatusPaused}, {domain.StatusPaused, domain.StatusEnded}} {
		if !domain.CanTransition(pair[0], pair[1]) {
			t.Fatalf("expected transition %s -> %s", pair[0], pair[1])
		}
	}
	if domain.CanTransition(domain.StatusDraft, domain.StatusActive) {
		t.Fatal("draft must not skip validation/review")
	}
}

func TestEligibilityRejectsClosedOrIrrelevantCampaign(t *testing.T) {
	c := testCampaign()
	checker := EligibilityService{}
	input := EligibilityInput{Now: time.Now().UTC(), MerchantActive: true, MerchantOpen: false, Serviceable: true, Relevant: true, CatalogAvailable: true, RiskApproved: true}
	if eligible, reason := checker.Check(c, input); eligible || reason != "merchant_closed" {
		t.Fatalf("closed merchant must be rejected: %v %s", eligible, reason)
	}
	input.MerchantOpen = true
	input.Relevant = false
	if eligible, reason := checker.Check(c, input); eligible || reason != "irrelevant_context" {
		t.Fatalf("irrelevant campaign must be rejected: %v %s", eligible, reason)
	}
}

func TestAuctionIsNotHighestPayerOnly(t *testing.T) {
	low := testCampaign()
	low.ID = "a"
	low.Bid.MaxMinor = 100
	high := testCampaign()
	high.ID = "b"
	high.Bid.MaxMinor = 1000
	result := (AuctionService{}).Select([]domain.AdCandidate{{Campaign: low, Eligible: true, Relevance: 1, Quality: 1}, {Campaign: high, Eligible: true, Relevance: .1, Quality: .1}}, 1)
	if result.Winner == nil || result.Winner.Campaign.ID != "a" {
		t.Fatalf("quality/relevance must beat payer-only ranking: %#v", result)
	}
}

type deliveryFakeRepo struct {
	campaigns []domain.Campaign
	saved     int
	events    map[string]bool
}

func (f *deliveryFakeRepo) EligibleCampaigns(context.Context, string, string) ([]domain.Campaign, error) {
	return f.campaigns, nil
}
func (f *deliveryFakeRepo) SaveDeliveryContext(context.Context, domain.DeliveryTokenClaims, string) error {
	f.saved++
	return nil
}
func (f *deliveryFakeRepo) RecordBillableEvent(_ context.Context, e domain.AdEvent) (bool, error) {
	if f.events[e.IdempotencyKey] {
		return false, nil
	}
	f.events[e.IdempotencyKey] = true
	return true, nil
}

func (f *deliveryFakeRepo) RecordServerConversion(context.Context, string, string, string) (bool, error) {
	return true, nil
}

func TestDeliveryTokenIsOpaqueAndReplaySafe(t *testing.T) {
	fake := &deliveryFakeRepo{campaigns: []domain.Campaign{testCampaign()}, events: map[string]bool{}}
	d := NewDeliveryService(fake, "01234567890123456789012345678901")
	items, err := d.Serve(context.Background(), domain.DeliveryContext{Placement: "food_discovery", Market: "id-jk", Session: "s1", Intent: "food_discovery"}, EligibilityInput{Now: time.Now().UTC(), MerchantActive: true, MerchantOpen: true, Serviceable: true, Relevant: true, CatalogAvailable: true, RiskApproved: true})
	if err != nil || len(items) != 1 || fake.saved != 1 {
		t.Fatalf("delivery failed: %#v %v", items, err)
	}
	if _, err := d.Record(context.Background(), domain.EventClick, items[0].AdDeliveryToken, "user", "session", "event-1"); err != nil {
		t.Fatal(err)
	}
	accepted, err := d.Record(context.Background(), domain.EventClick, items[0].AdDeliveryToken, "user", "session", "event-1")
	if err != nil || accepted {
		t.Fatalf("replay must be deduplicated: %v %v", accepted, err)
	}
	if _, err := d.Record(context.Background(), domain.EventClick, items[0].AdDeliveryToken+"x", "user", "session", "event-2"); err == nil {
		t.Fatal("tampered token must fail")
	}
}

func TestBudgetReservationIsConcurrencySafe(t *testing.T) {
	m := NewMemoryBudget(100)
	done := make(chan bool, 4)
	for i := 0; i < 4; i++ {
		go func(i int) {
			ok, _ := m.ReserveSpend(context.Background(), domain.AdEvent{IdempotencyKey: string(rune('a' + i)), CostMinor: 60})
			done <- ok
		}(i)
	}
	charged := 0
	for i := 0; i < 4; i++ {
		if <-done {
			charged++
		}
	}
	if charged != 1 || m.Spent != 60 {
		t.Fatalf("concurrent budget overspent: charged=%d spent=%d", charged, m.Spent)
	}
}

type exposureFakeRepo struct{ seen map[string]bool }

func (f *exposureFakeRepo) RecordExperimentExposure(_ context.Context, exposure domain.ExperimentExposure) (bool, error) {
	key := exposure.ExperimentKey + ":" + exposure.AssignmentKey + ":" + exposure.Placement
	if f.seen[key] {
		return false, nil
	}
	f.seen[key] = true
	return true, nil
}

func TestExperimentExposureIsSeparateAndReplaySafe(t *testing.T) {
	repo := &exposureFakeRepo{seen: map[string]bool{}}
	service := NewExperimentExposureService(repo)
	exposure := domain.ExperimentExposure{ExperimentKey: "density-v1", AssignmentKey: "1234567890123456789012345678901234567890123", VariantKey: "control", Placement: string(domain.PlacementFoodDiscovery)}
	accepted, err := service.Record(context.Background(), exposure)
	if err != nil || !accepted {
		t.Fatalf("first exposure was not accepted: %v %v", accepted, err)
	}
	accepted, err = service.Record(context.Background(), exposure)
	if err != nil || accepted {
		t.Fatalf("replayed exposure must deduplicate: %v %v", accepted, err)
	}
	protected := exposure
	protected.Placement = string(domain.PlacementAdFreeCheckout)
	if _, err := service.Record(context.Background(), protected); err == nil {
		t.Fatal("protected transaction zone must reject experiment exposure")
	}
}
