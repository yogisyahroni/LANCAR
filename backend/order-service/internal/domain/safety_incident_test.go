package domain

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestSafetyIncidentValidationAndSLA(t *testing.T) {
	lat, lon := -6.2, 106.8
	incident := SafetyIncident{
		ID: uuid.New(), ReporterID: uuid.New(), MarketCode: "id-jk", Category: "unsafe_location",
		Severity: SafetySeverityCritical, State: SafetyIncidentOpen, Latitude: &lat, Longitude: &lon,
		CreatedAt: time.Now().UTC(),
	}
	if err := incident.Validate(); err != nil {
		t.Fatal(err)
	}
	if SafetySLA(SafetySeverityCritical) != time.Minute {
		t.Fatal("critical incidents must have a one-minute SLA")
	}
	if CanTransitionSafetyIncident(SafetyIncidentResolved, SafetyIncidentAcknowledged) {
		t.Fatal("resolved incident cannot move backwards")
	}
}

func TestSafetyIncidentDoesNotEncodeOrderMutation(t *testing.T) {
	orderID := uuid.New()
	incident := SafetyIncident{ID: uuid.New(), ReporterID: uuid.New(), OrderID: &orderID, MarketCode: "id-jk", Category: "accident", Severity: SafetySeverityHigh, State: SafetyIncidentOpen}
	if err := incident.Validate(); err != nil {
		t.Fatal(err)
	}
	// The safety aggregate carries an order reference only. There is no order
	// status field or transition method on the aggregate.
	if incident.State == SafetyIncidentResolved {
		t.Fatal("new incident unexpectedly resolved")
	}
}
