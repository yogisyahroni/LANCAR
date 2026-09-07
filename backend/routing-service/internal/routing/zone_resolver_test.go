package routing

import (
	"strings"
	"testing"
)

func TestZoneLookupUsesInclusiveMarketScopedBoundaryPredicate(t *testing.T) {
	if !strings.Contains(zoneLookupQuery, "market_code = $3") {
		t.Fatal("zone lookup must scope availability to the configured market")
	}
	if !strings.Contains(zoneLookupQuery, "ST_Covers(") {
		t.Fatal("zone lookup must include polygon boundaries via ST_Covers")
	}
	if strings.Contains(zoneLookupQuery, "ST_Contains(") {
		t.Fatal("zone lookup must not exclude coordinates on the polygon boundary")
	}
}

func TestNewPostgresZoneResolverForMarketDefaultsBlankMarket(t *testing.T) {
	resolver := NewPostgresZoneResolverForMarket(nil, " ")
	if resolver.marketCode != DefaultMarketCode {
		t.Fatalf("market code = %q, want %q", resolver.marketCode, DefaultMarketCode)
	}
}
