package domain

import "testing"

func TestUnderstandTypoAndIntent(t *testing.T) {
	got := Understand("ayam geprk", "id-ID")
	if got.CanonicalQuery != "ayam geprek" || got.Service != "food_delivery" {
		t.Fatalf("unexpected intent: %+v", got)
	}
}

func TestSuggestionsNeverExposeOtherUserData(t *testing.T) {
	got := Suggestions("ayam", []string{"ayam geprek"}, []string{"ayam bakar", "rahasia pengguna lain"})
	if len(got) != 2 || got[0] != "ayam geprek" || got[1] != "ayam bakar" {
		t.Fatalf("unexpected suggestions: %#v", got)
	}
}

func TestSponsoredSlotsDoNotRewriteOrganicOrder(t *testing.T) {
	organic := []Document{{EntityID: "organic-1"}, {EntityID: "organic-2"}}
	got := ApplySponsoredSlots(organic, []Document{{EntityID: "paid-1"}}, 1)
	if got[0].EntityID != "organic-1" || !got[1].Sponsored || got[2].EntityID != "organic-2" {
		t.Fatalf("unexpected slots: %#v", got)
	}
}
