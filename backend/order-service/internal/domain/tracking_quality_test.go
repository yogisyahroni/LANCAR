package domain

import (
	"testing"
	"time"
)

func TestClassifyGPSLocationMakesStaleAndLowAccuracyExplicit(t *testing.T) {
	now := time.Date(2026, 9, 7, 12, 0, 0, 0, time.UTC)
	base := GPSLocation{Latitude: -6.2, Longitude: 106.8, Accuracy: 10, Timestamp: now.Add(-30 * time.Second)}
	if quality := ClassifyGPSLocation(base, now); quality.State != GPSQualityFresh || !quality.CanNavigate {
		t.Fatalf("fresh GPS quality = %+v", quality)
	}

	stale := base
	stale.Timestamp = now.Add(-GPSStaleAfter - time.Second)
	if quality := ClassifyGPSLocation(stale, now); quality.State != GPSQualityStale || quality.CanDisplay {
		t.Fatalf("stale GPS quality = %+v", quality)
	}

	lowAccuracy := base
	lowAccuracy.Accuracy = 150
	if quality := ClassifyGPSLocation(lowAccuracy, now); quality.State != GPSQualityLowAccuracy || quality.CanNavigate {
		t.Fatalf("low-accuracy GPS quality = %+v", quality)
	}
}

func TestDeriveGPSLocationPreservesRawTelemetryWhileSmoothingAndMatching(t *testing.T) {
	now := time.Date(2026, 9, 7, 12, 0, 0, 0, time.UTC)
	previous := &GPSLocation{Latitude: -6.2, Longitude: 106.8, Accuracy: 10, Timestamp: now.Add(-10 * time.Second)}
	raw := GPSLocation{Latitude: -6.2005, Longitude: 106.8005, Accuracy: 10, Timestamp: now}
	route := []RoutePoint{{Latitude: -6.2004, Longitude: 106.8004}}

	derived, err := DeriveGPSLocation(raw, previous, route, now)
	if err != nil {
		t.Fatal(err)
	}
	if !derived.Smoothed || !derived.MapMatched {
		t.Fatalf("expected smoothing and map matching: %+v", derived)
	}
	if derived.Raw != raw {
		t.Fatalf("raw telemetry was rewritten: got %+v want %+v", derived.Raw, raw)
	}
	if derived.Display.Latitude == raw.Latitude && derived.Display.Longitude == raw.Longitude {
		t.Fatal("derived display location did not change")
	}
}

func TestDeriveGPSLocationRejectsInvalidCoordinates(t *testing.T) {
	_, err := DeriveGPSLocation(GPSLocation{Latitude: 0, Longitude: 0, Timestamp: time.Now()}, nil, nil, time.Now())
	if err == nil {
		t.Fatal("expected invalid 0,0 location to be rejected")
	}
}
