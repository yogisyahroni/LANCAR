package service

import (
	"math"
	"testing"
)

func TestValidOrderCoordinateRejectsMissingOrImpossiblePoints(t *testing.T) {
	tests := []struct {
		name       string
		lat, lng   float64
		wantValid  bool
	}{
		{name: "valid Jakarta", lat: -6.2, lng: 106.8, wantValid: true},
		{name: "zero point", lat: 0, lng: 0, wantValid: false},
		{name: "nan latitude", lat: math.NaN(), lng: 106.8, wantValid: false},
		{name: "infinite longitude", lat: -6.2, lng: math.Inf(1), wantValid: false},
		{name: "latitude out of range", lat: 91, lng: 106.8, wantValid: false},
		{name: "longitude out of range", lat: -6.2, lng: 181, wantValid: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := validOrderCoordinate(test.lat, test.lng); got != test.wantValid {
				t.Fatalf("validOrderCoordinate(%v, %v) = %v, want %v", test.lat, test.lng, got, test.wantValid)
			}
		})
	}
}
