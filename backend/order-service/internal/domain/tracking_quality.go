package domain

import (
	"fmt"
	"math"
	"time"
)

const (
	GPSStaleAfter       = 90 * time.Second
	GPSLowAccuracyAfter = 100.0
	GPSMaxReasonableKPH = 160.0
)

type GPSQualityState string

const (
	GPSQualityFresh       GPSQualityState = "fresh"
	GPSQualityLowAccuracy GPSQualityState = "low_accuracy"
	GPSQualityStale       GPSQualityState = "stale"
	GPSQualityInvalid     GPSQualityState = "invalid"
)

type GPSQuality struct {
	State       GPSQualityState `json:"state"`
	AgeSeconds  int64           `json:"age_seconds,omitempty"`
	AccuracyM   float64         `json:"accuracy_m,omitempty"`
	CanDisplay  bool            `json:"can_display"`
	CanNavigate bool            `json:"can_navigate"`
	Reason      string          `json:"reason,omitempty"`
}

type RoutePoint struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// DerivedGPSLocation keeps raw telemetry immutable while exposing a separate
// display/navigation point that may be smoothed or snapped to a route.
type DerivedGPSLocation struct {
	Raw        GPSLocation `json:"raw"`
	Display    GPSLocation `json:"display"`
	Quality    GPSQuality  `json:"quality"`
	MapMatched bool        `json:"map_matched"`
	Smoothed   bool        `json:"smoothed"`
}

func ClassifyGPSLocation(location GPSLocation, now time.Time) GPSQuality {
	if now.IsZero() {
		now = time.Now()
	}
	if !finiteCoordinate(location.Latitude, location.Longitude) || (location.Latitude == 0 && location.Longitude == 0) {
		return GPSQuality{State: GPSQualityInvalid, CanDisplay: false, CanNavigate: false, Reason: "invalid_coordinates"}
	}
	if location.Timestamp.IsZero() {
		return GPSQuality{State: GPSQualityInvalid, CanDisplay: false, CanNavigate: false, Reason: "timestamp_missing"}
	}
	age := now.Sub(location.Timestamp)
	if age < -5*time.Minute {
		return GPSQuality{State: GPSQualityInvalid, CanDisplay: false, CanNavigate: false, Reason: "timestamp_in_future"}
	}
	if age > GPSStaleAfter {
		return GPSQuality{State: GPSQualityStale, AgeSeconds: int64(age / time.Second), AccuracyM: location.Accuracy, CanDisplay: false, CanNavigate: false, Reason: "location_expired"}
	}
	if location.Accuracy > GPSLowAccuracyAfter {
		return GPSQuality{State: GPSQualityLowAccuracy, AgeSeconds: int64(maxDuration(age, 0) / time.Second), AccuracyM: location.Accuracy, CanDisplay: false, CanNavigate: false, Reason: "poor_accuracy"}
	}
	return GPSQuality{State: GPSQualityFresh, AgeSeconds: int64(maxDuration(age, 0) / time.Second), AccuracyM: location.Accuracy, CanDisplay: true, CanNavigate: true}
}

func DeriveGPSLocation(raw GPSLocation, previous *GPSLocation, route []RoutePoint, now time.Time) (DerivedGPSLocation, error) {
	quality := ClassifyGPSLocation(raw, now)
	if quality.State == GPSQualityInvalid {
		return DerivedGPSLocation{}, fmt.Errorf("cannot derive invalid GPS location: %s", quality.Reason)
	}
	derived := DerivedGPSLocation{Raw: raw, Display: raw, Quality: quality}
	if !quality.CanNavigate {
		return derived, nil
	}

	if previous != nil && ClassifyGPSLocation(*previous, now).State == GPSQualityFresh {
		seconds := raw.Timestamp.Sub(previous.Timestamp).Seconds()
		if seconds > 0 && (haversineKM(previous.Latitude, previous.Longitude, raw.Latitude, raw.Longitude)/seconds)*3600 <= GPSMaxReasonableKPH {
			const alpha = 0.6
			derived.Display.Latitude = previous.Latitude + alpha*(raw.Latitude-previous.Latitude)
			derived.Display.Longitude = previous.Longitude + alpha*(raw.Longitude-previous.Longitude)
			derived.Smoothed = true
		}
	}

	if matched, distanceM := nearestRoutePoint(raw, route); matched != nil && distanceM <= math.Max(100, raw.Accuracy*2) {
		derived.Display.Latitude = matched.Latitude
		derived.Display.Longitude = matched.Longitude
		derived.MapMatched = true
	}
	return derived, nil
}

func nearestRoutePoint(raw GPSLocation, route []RoutePoint) (*RoutePoint, float64) {
	var closest *RoutePoint
	closestDistance := math.MaxFloat64
	for i := range route {
		point := route[i]
		if !finiteCoordinate(point.Latitude, point.Longitude) {
			continue
		}
		distance := haversineKM(raw.Latitude, raw.Longitude, point.Latitude, point.Longitude) * 1000
		if distance < closestDistance {
			candidate := point
			closest = &candidate
			closestDistance = distance
		}
	}
	return closest, closestDistance
}

func finiteCoordinate(latitude, longitude float64) bool {
	return !math.IsNaN(latitude) && !math.IsInf(latitude, 0) && latitude >= -90 && latitude <= 90 &&
		!math.IsNaN(longitude) && !math.IsInf(longitude, 0) && longitude >= -180 && longitude <= 180
}

func haversineKM(lat1, lng1, lat2, lng2 float64) float64 {
	const earthRadiusKM = 6371.0
	const degreeToRadians = math.Pi / 180
	dLat := (lat2 - lat1) * degreeToRadians
	dLng := (lng2 - lng1) * degreeToRadians
	lat1 *= degreeToRadians
	lat2 *= degreeToRadians
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(lat1)*math.Cos(lat2)*math.Sin(dLng/2)*math.Sin(dLng/2)
	return earthRadiusKM * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func maxDuration(value, floor time.Duration) time.Duration {
	if value < floor {
		return floor
	}
	return value
}
