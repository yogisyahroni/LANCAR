package domain

import (
	"encoding/json"
	"testing"
)

func TestQueryUnderstandingAndSponsoredFallback(t *testing.T) {
	intent := Understand("ayam geprk", "id-ID")
	if intent.CanonicalQuery != "ayam geprek" || intent.Service != "food_delivery" {
		t.Fatalf("unexpected typo intent: %+v", intent)
	}
	organic := []Document{{EntityID: "organic-1", Title: "Organic one"}, {EntityID: "organic-2", Title: "Organic two"}}
	withAds := ApplySponsoredSlots(organic, nil, 1)
	if len(withAds) != len(organic) || withAds[0].EntityID != "organic-1" {
		t.Fatalf("ads outage must preserve organic results: %+v", withAds)
	}
}

func TestQueryUnderstandingKeepsOpenNowAsAFilter(t *testing.T) {
	intent := Understand("ayam geprek buka", "id-ID")
	if intent.Service != "food_delivery" || intent.Filters["open_now"] != "true" {
		t.Fatalf("open-now intent was not preserved as a filter: %+v", intent)
	}
}

func TestSponsoredSlotsAreCappedAndDoNotRewriteOrganicOrder(t *testing.T) {
	organic := []Document{{EntityID: "organic-1"}, {EntityID: "organic-2"}, {EntityID: "organic-3"}}
	sponsored := []Document{{EntityID: "ad-1"}, {EntityID: "ad-2"}, {EntityID: "ad-3"}}
	got := ApplySponsoredSlots(organic, sponsored, 1)
	if len(got) != 4 || got[0].EntityID != "organic-1" || got[1].EntityID != "ad-1" || got[2].EntityID != "organic-2" || got[3].EntityID != "organic-3" || !got[1].Sponsored {
		t.Fatalf("sponsored cap/order was not preserved: %+v", got)
	}
}

func TestSearchEnvelopeIsBackwardCompatible(t *testing.T) {
	type legacyEnvelope struct {
		SchemaVersion string     `json:"schema_version"`
		Query         string     `json:"query"`
		Results       []Document `json:"results"`
	}
	payload, err := json.Marshal(Response{
		SchemaVersion:  "search.v1",
		Query:          "ayam geprk",
		Intent:         Intent{CanonicalQuery: "ayam geprek", Service: "food_delivery"},
		Results:        []Document{{EntityID: "merchant-1", EntityType: "merchant", Status: "active", Title: "Ayam Geprek", CanonicalRoute: "tembus://merchant/merchant-1"}},
		RankingVersion: "organic-v1",
		OrganicOnly:    true,
	})
	if err != nil {
		t.Fatal(err)
	}
	var legacy legacyEnvelope
	if err := json.Unmarshal(payload, &legacy); err != nil {
		t.Fatalf("legacy consumer could not decode additive envelope: %v", err)
	}
	if legacy.SchemaVersion != "search.v1" || len(legacy.Results) != 1 {
		t.Fatalf("legacy fields were not preserved: %+v", legacy)
	}
}
