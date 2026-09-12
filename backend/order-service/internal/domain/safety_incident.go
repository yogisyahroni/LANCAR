package domain

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

type SafetySeverity string

const (
	SafetySeverityLow      SafetySeverity = "LOW"
	SafetySeverityMedium   SafetySeverity = "MEDIUM"
	SafetySeverityHigh     SafetySeverity = "HIGH"
	SafetySeverityCritical SafetySeverity = "CRITICAL"
)

type SafetyIncidentState string

const (
	SafetyIncidentOpen         SafetyIncidentState = "OPEN"
	SafetyIncidentAcknowledged SafetyIncidentState = "ACKNOWLEDGED"
	SafetyIncidentEscalated    SafetyIncidentState = "ESCALATED"
	SafetyIncidentResolved     SafetyIncidentState = "RESOLVED"
	SafetyIncidentReopened     SafetyIncidentState = "REOPENED"
	SafetyIncidentDismissed    SafetyIncidentState = "DISMISSED"
)

type SafetyEvidenceReference struct {
	ID             uuid.UUID `json:"id"`
	IncidentID     uuid.UUID `json:"incident_id"`
	ActorID        uuid.UUID `json:"actor_id"`
	ObjectKey      string    `json:"object_key"`
	SHA256         string    `json:"sha256"`
	ContentType    string    `json:"content_type"`
	SizeBytes      int64     `json:"size_bytes"`
	RetentionUntil time.Time `json:"retention_until"`
	LegalHold      bool      `json:"legal_hold"`
}

type SafetyIncident struct {
	ID              uuid.UUID                 `json:"id"`
	ReporterID      uuid.UUID                 `json:"reporter_id"`
	CounterpartyID  *uuid.UUID                `json:"counterparty_id,omitempty"`
	OrderID         *uuid.UUID                `json:"order_id,omitempty"`
	ServiceCode     string                    `json:"service_code"`
	MarketCode      string                    `json:"market_code"`
	Category        string                    `json:"category"`
	Severity        SafetySeverity            `json:"severity"`
	State           SafetyIncidentState       `json:"state"`
	EscalationState string                    `json:"escalation_state"`
	Latitude        *float64                  `json:"latitude,omitempty"`
	Longitude       *float64                  `json:"longitude,omitempty"`
	LocationAt      *time.Time                `json:"location_at,omitempty"`
	CreatedAt       time.Time                 `json:"created_at"`
	UpdatedAt       time.Time                 `json:"updated_at"`
	Evidence        []SafetyEvidenceReference `json:"evidence,omitempty"`
}

func (i SafetyIncident) Validate() error {
	if i.ID == uuid.Nil || i.ReporterID == uuid.Nil {
		return errors.New("safety incident identity is required")
	}
	if strings.TrimSpace(i.MarketCode) == "" || strings.TrimSpace(i.Category) == "" {
		return errors.New("safety incident market and category are required")
	}
	switch i.Severity {
	case SafetySeverityLow, SafetySeverityMedium, SafetySeverityHigh, SafetySeverityCritical:
	default:
		return fmt.Errorf("unsupported safety severity %q", i.Severity)
	}
	switch i.State {
	case SafetyIncidentOpen, SafetyIncidentAcknowledged, SafetyIncidentEscalated, SafetyIncidentResolved, SafetyIncidentReopened, SafetyIncidentDismissed:
	default:
		return fmt.Errorf("unsupported safety incident state %q", i.State)
	}
	if (i.Latitude == nil) != (i.Longitude == nil) {
		return errors.New("latitude and longitude must be provided together")
	}
	if i.Latitude != nil && (*i.Latitude < -90 || *i.Latitude > 90 || *i.Longitude < -180 || *i.Longitude > 180) {
		return errors.New("safety incident location is invalid")
	}
	return nil
}

func SafetySLA(severity SafetySeverity) time.Duration {
	switch severity {
	case SafetySeverityCritical:
		return 1 * time.Minute
	case SafetySeverityHigh:
		return 5 * time.Minute
	case SafetySeverityMedium:
		return 30 * time.Minute
	default:
		return 4 * time.Hour
	}
}

func CanTransitionSafetyIncident(from, to SafetyIncidentState) bool {
	if from == to {
		return true
	}
	switch from {
	case SafetyIncidentOpen:
		return to == SafetyIncidentAcknowledged || to == SafetyIncidentEscalated || to == SafetyIncidentResolved || to == SafetyIncidentDismissed
	case SafetyIncidentAcknowledged:
		return to == SafetyIncidentEscalated || to == SafetyIncidentResolved || to == SafetyIncidentReopened
	case SafetyIncidentEscalated:
		return to == SafetyIncidentResolved || to == SafetyIncidentReopened
	case SafetyIncidentResolved, SafetyIncidentDismissed:
		return to == SafetyIncidentReopened
	case SafetyIncidentReopened:
		return to == SafetyIncidentAcknowledged || to == SafetyIncidentEscalated || to == SafetyIncidentResolved
	default:
		return false
	}
}
