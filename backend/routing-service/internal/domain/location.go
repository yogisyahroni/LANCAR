package domain

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"strings"
)

// Coordinate is the transactional map position. Lat/Lng are kept as the
// internal names used by the routing engine while the JSON contract exposes
// the conventional latitude/longitude names.
type Coordinate struct {
	Lat float64 `json:"latitude"`
	Lng float64 `json:"longitude"`
}

func (c Coordinate) ValidateTransactional() error {
	if math.IsNaN(c.Lat) || math.IsInf(c.Lat, 0) || c.Lat < -90 || c.Lat > 90 {
		return fmt.Errorf("latitude %.6f outside range -90..90", c.Lat)
	}
	if math.IsNaN(c.Lng) || math.IsInf(c.Lng, 0) || c.Lng < -180 || c.Lng > 180 {
		return fmt.Errorf("longitude %.6f outside range -180..180", c.Lng)
	}
	if c.Lat == 0 && c.Lng == 0 {
		return fmt.Errorf("transactional coordinate 0,0 is invalid")
	}
	return nil
}

func (c Coordinate) Equal(other Coordinate) bool {
	return c.Lat == other.Lat && c.Lng == other.Lng
}

// NormalizedAddress contains independently usable address components. The
// display value remains presentation text and is never used as a business
// identity or provider location code.
type NormalizedAddress struct {
	AddressLine string `json:"address_line,omitempty"`
	City        string `json:"city,omitempty"`
	District    string `json:"district,omitempty"`
	PostalCode  string `json:"postal_code,omitempty"`
	CountryCode string `json:"country_code,omitempty"`
}

// Location is the provider-neutral transactional location contract. Provider
// identifiers are metadata only; callers must use Revision as the snapshot
// identity for quote/route dependencies.
type Location struct {
	DisplayAddress        string            `json:"display_address"`
	NormalizedAddress     NormalizedAddress `json:"normalized_address"`
	Coordinate            Coordinate        `json:"coordinate"`
	AccuracyMeters        *float64          `json:"accuracy_meters,omitempty"`
	AccuracySource        string            `json:"accuracy_source,omitempty"`
	Source                string            `json:"source"`
	ProviderPlaceID       string            `json:"provider_place_id,omitempty"`
	ProviderLocationCodes map[string]string `json:"provider_location_codes,omitempty"`
	Timezone              string            `json:"timezone"`
	Market                string            `json:"market"`
	AddressVersion        string            `json:"address_version"`
	CoordinateVersion     string            `json:"coordinate_version"`
}

func (l Location) ValidateTransactional() error {
	if err := l.Coordinate.ValidateTransactional(); err != nil {
		return err
	}
	if strings.TrimSpace(l.DisplayAddress) == "" {
		return fmt.Errorf("display address is required")
	}
	if strings.TrimSpace(l.Source) == "" {
		return fmt.Errorf("location source is required")
	}
	if strings.TrimSpace(l.Timezone) == "" {
		return fmt.Errorf("location timezone is required")
	}
	if strings.TrimSpace(l.Market) == "" {
		return fmt.Errorf("location market is required")
	}
	if strings.TrimSpace(l.AddressVersion) == "" || strings.TrimSpace(l.CoordinateVersion) == "" {
		return fmt.Errorf("address and coordinate versions are required")
	}
	if l.AddressVersion != l.CoordinateVersion {
		return fmt.Errorf("address and coordinate versions must match")
	}
	if l.AccuracyMeters != nil && (*l.AccuracyMeters < 0 || math.IsNaN(*l.AccuracyMeters) || math.IsInf(*l.AccuracyMeters, 0)) {
		return fmt.Errorf("accuracy meters must be a finite non-negative value")
	}
	return nil
}

// Revision is stable for a location snapshot and changes when either the
// address text/components or coordinates change. It is safe to persist in a
// quote/route snapshot and compare before reusing that snapshot.
func (l Location) Revision() (string, error) {
	if err := l.ValidateTransactional(); err != nil {
		return "", err
	}
	payload := struct {
		DisplayAddress    string            `json:"display_address"`
		NormalizedAddress NormalizedAddress `json:"normalized_address"`
		Coordinate        Coordinate        `json:"coordinate"`
		AddressVersion    string            `json:"address_version"`
		CoordinateVersion string            `json:"coordinate_version"`
	}{
		DisplayAddress: l.DisplayAddress, NormalizedAddress: l.NormalizedAddress,
		Coordinate: l.Coordinate, AddressVersion: l.AddressVersion,
		CoordinateVersion: l.CoordinateVersion,
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("encode location revision: %w", err)
	}
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:]), nil
}

func (l Location) SameRevision(other Location) bool {
	left, leftErr := l.Revision()
	right, rightErr := other.Revision()
	return leftErr == nil && rightErr == nil && left == right
}
