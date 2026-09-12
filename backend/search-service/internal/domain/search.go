package domain

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"
)

const CurrentIndexVersion = "v1"

type Document struct {
	EntityID       string         `json:"entity_id"`
	EntityType     string         `json:"entity_type"`
	MarketCode     string         `json:"market_code"`
	Locale         string         `json:"locale"`
	Status         string         `json:"status"`
	ServiceCode    string         `json:"service_code,omitempty"`
	Title          string         `json:"title"`
	CanonicalRoute string         `json:"canonical_route"`
	Latitude       *float64       `json:"latitude,omitempty"`
	Longitude      *float64       `json:"longitude,omitempty"`
	Serviceability map[string]any `json:"serviceability,omitempty"`
	OpenNow        *bool          `json:"open_now,omitempty"`
	Available      bool           `json:"available"`
	UnavailableWhy string         `json:"unavailable_reason,omitempty"`
	SourceVersion  int64          `json:"source_version"`
	UpdatedAt      time.Time      `json:"updated_at"`
	RankScore      float64        `json:"rank_score"`
	Sponsored      bool           `json:"sponsored"`
}

type Query struct {
	Text       string  `json:"q"`
	MarketCode string  `json:"market_code"`
	Locale     string  `json:"locale"`
	Service    string  `json:"service,omitempty"`
	OpenNow    bool    `json:"open_now,omitempty"`
	Latitude   float64 `json:"lat,omitempty"`
	Longitude  float64 `json:"lng,omitempty"`
	RadiusM    int     `json:"radius_m,omitempty"`
	Limit      int     `json:"limit,omitempty"`
	Offset     int     `json:"offset,omitempty"`
}

type Intent struct {
	CanonicalQuery string            `json:"canonical_query"`
	Service        string            `json:"service,omitempty"`
	Filters        map[string]string `json:"filters,omitempty"`
	Confidence     string            `json:"confidence"`
}

type Response struct {
	SchemaVersion  string     `json:"schema_version"`
	Query          string     `json:"query"`
	Intent         Intent     `json:"intent"`
	Results        []Document `json:"results"`
	Total          int        `json:"total"`
	RankingVersion string     `json:"ranking_version"`
	OrganicOnly    bool       `json:"organic_only"`
	Stale          bool       `json:"stale"`
}

type Synonym struct {
	ID            string `json:"id,omitempty"`
	MarketCode    string `json:"market_code"`
	Locale        string `json:"locale"`
	Term          string `json:"term"`
	CanonicalTerm string `json:"canonical_term"`
	Kind          string `json:"kind"`
	Reviewed      bool   `json:"reviewed"`
	Active        bool   `json:"active"`
}

type MerchandisingRule struct {
	ID         string            `json:"id,omitempty"`
	MarketCode string            `json:"market_code"`
	Locale     string            `json:"locale"`
	QueryTerm  string            `json:"query_term"`
	EntityID   string            `json:"entity_id"`
	Action     string            `json:"action"`
	Reason     string            `json:"reason"`
	Scope      map[string]string `json:"scope,omitempty"`
	ExpiresAt  *time.Time        `json:"expires_at,omitempty"`
	Reviewed   bool              `json:"reviewed"`
	Active     bool              `json:"active"`
}

func Normalize(s string) string {
	return strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(s))), " ")
}

func HashQuery(s string) string {
	sum := sha256.Sum256([]byte(Normalize(s)))
	return hex.EncodeToString(sum[:])
}

// Understand is deliberately conservative: it only routes discovery intent;
// it never starts a transaction and always leaves the original query visible.
func Understand(raw, locale string) Intent {
	q := Normalize(raw)
	canonical := q
	synonyms := map[string]string{
		"ayam geprk": "ayam geprek", "geprk": "geprek", "ban bocor": "tambal ban",
		"towing mobil": "towing", "kirim paket": "paket", "antar paket": "paket",
	}
	for from, to := range synonyms {
		if strings.Contains(canonical, from) {
			canonical = strings.ReplaceAll(canonical, from, to)
		}
	}
	service := ""
	switch {
	case strings.Contains(canonical, "tambal ban"):
		service = "tambal_ban"
	case strings.Contains(canonical, "towing"):
		service = "towing"
	case strings.Contains(canonical, "paket"):
		service = "aggregator"
	case strings.Contains(canonical, "food") || strings.Contains(canonical, "makan") || strings.Contains(canonical, "ayam") || strings.Contains(canonical, "geprek"):
		service = "food_delivery"
	}
	confidence := "low"
	if service != "" {
		confidence = "high"
	}
	filters := map[string]string{}
	if strings.Contains(canonical, " buka") || strings.HasSuffix(canonical, " buka") {
		filters["open_now"] = "true"
	}
	return Intent{CanonicalQuery: canonical, Service: service, Filters: filters, Confidence: confidence}
}

func Suggestions(raw string, ownHistory, popular []string) []string {
	q := Normalize(raw)
	seen := map[string]bool{}
	out := make([]string, 0, 8)
	add := func(item string) {
		item = strings.TrimSpace(item)
		if item == "" || seen[item] || (q != "" && !strings.Contains(Normalize(item), q)) {
			return
		}
		seen[item] = true
		out = append(out, item)
	}
	for _, item := range ownHistory {
		add(item)
	}
	for _, item := range popular {
		add(item)
	}
	if q != "" {
		canonical := Understand(q, "").CanonicalQuery
		if canonical != q {
			add(canonical)
		}
	}
	if len(out) > 8 {
		out = out[:8]
	}
	return out
}

// ApplySponsoredSlots never changes organic score/order. Ads failure is
// represented by an empty sponsored slice and therefore returns organic-only.
func ApplySponsoredSlots(organic, sponsored []Document, cap int) []Document {
	if cap < 0 {
		cap = 0
	}
	result := make([]Document, 0, len(organic)+cap)
	for i, item := range organic {
		result = append(result, item)
		if i < cap && i < len(sponsored) {
			s := sponsored[i]
			s.Sponsored = true
			result = append(result, s)
		}
	}
	return result
}
