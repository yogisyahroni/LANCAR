package repository

import "testing"

func TestValidateCoordinateRejectsInvalidValues(t *testing.T) {
	if err := validateCoordinate(-6.2, 106.8); err != nil {
		t.Fatalf("valid coordinate rejected: %v", err)
	}
	for _, tc := range [][2]float64{{91, 0}, {0, 181}, {-91, 0}, {0, -181}} {
		if err := validateCoordinate(tc[0], tc[1]); err == nil {
			t.Fatalf("expected invalid coordinate %v", tc)
		}
	}
}

func TestValidateRouteMetricsRejectsInvalidValues(t *testing.T) {
	if err := validateRouteMetrics(1.2, 4); err != nil {
		t.Fatalf("valid route metrics rejected: %v", err)
	}
	if err := validateRouteMetrics(-1, 4); err == nil {
		t.Fatal("expected negative distance rejection")
	}
	if err := validateRouteMetrics(1, -4); err == nil {
		t.Fatal("expected negative duration rejection")
	}
}
