package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/LANCAR/datalake-worker/internal/domain"
)

type EventSchema struct {
	EventType          string
	SupportedVersions  []int
	BackwardCompatible bool
}

// EventSchemaRegistry is deliberately small and explicit for analytics events.
// Unknown event types still require the canonical envelope and schema version;
// producers add a registry entry before using them as a governed ML feature.
var EventSchemaRegistry = map[string]EventSchema{
	"order.created":                    {EventType: "order.created", SupportedVersions: []int{1}, BackwardCompatible: true},
	"order.completed":                  {EventType: "order.completed", SupportedVersions: []int{1}, BackwardCompatible: true},
	"order.cancelled":                  {EventType: "order.cancelled", SupportedVersions: []int{1}, BackwardCompatible: true},
	"payment.paid":                     {EventType: "payment.paid", SupportedVersions: []int{1}, BackwardCompatible: true},
	"payment.refunded":                 {EventType: "payment.refunded", SupportedVersions: []int{1}, BackwardCompatible: true},
	"refund.created":                   {EventType: "refund.created", SupportedVersions: []int{1}, BackwardCompatible: true},
	"courier.active":                   {EventType: "courier.active", SupportedVersions: []int{1}, BackwardCompatible: true},
	"courier.inactive":                 {EventType: "courier.inactive", SupportedVersions: []int{1}, BackwardCompatible: true},
	"merchant.active":                  {EventType: "merchant.active", SupportedVersions: []int{1}, BackwardCompatible: true},
	"merchant.inactive":                {EventType: "merchant.inactive", SupportedVersions: []int{1}, BackwardCompatible: true},
	"sla.measured":                     {EventType: "sla.measured", SupportedVersions: []int{1}, BackwardCompatible: true},
	"merchant.catalog.changed":         {EventType: "merchant.catalog.changed", SupportedVersions: []int{1}, BackwardCompatible: true},
	"merchant.operating_state.changed": {EventType: "merchant.operating_state.changed", SupportedVersions: []int{1}, BackwardCompatible: true},
	"model.unavailable.shown":          {EventType: "model.unavailable.shown", SupportedVersions: []int{1}, BackwardCompatible: true},
	"dispatch.decision":                {EventType: "dispatch.decision", SupportedVersions: []int{1}, BackwardCompatible: true},
	"risk.decision":                    {EventType: "risk.decision", SupportedVersions: []int{1}, BackwardCompatible: true},
}

var (
	eventIDPattern     = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$`)
	eventTypePattern   = regexp.MustCompile(`^[a-z0-9]+(?:[._-][a-z0-9]+)+$`)
	marketCodePattern  = regexp.MustCompile(`^[a-z]{2}-[a-z0-9-]+$`)
	serviceNamePattern = regexp.MustCompile(`^[a-z0-9]+(?:[._-][a-z0-9]+)*$`)
	actorPattern       = regexp.MustCompile(`^(?:system|actor_[A-Za-z0-9_-]{16,128}|anon_[A-Za-z0-9_-]{16,128})$`)
)

type EventValidator struct {
	Registry map[string]EventSchema
}

func NewEventValidator() EventValidator {
	return EventValidator{Registry: EventSchemaRegistry}
}

func (v EventValidator) Validate(envelope domain.EventEnvelope) error {
	envelope.Normalize()
	if !eventIDPattern.MatchString(strings.TrimSpace(envelope.EventID)) {
		return fmt.Errorf("event_id is missing or invalid")
	}
	if !eventTypePattern.MatchString(strings.TrimSpace(envelope.EventType)) {
		return fmt.Errorf("event_type is missing or invalid")
	}
	if envelope.SchemaVersion < 1 {
		return fmt.Errorf("schema_version must be positive")
	}
	if schema, ok := v.Registry[envelope.EventType]; ok && !contains(schema.SupportedVersions, envelope.SchemaVersion) {
		return fmt.Errorf("event_type %q does not support schema_version %d", envelope.EventType, envelope.SchemaVersion)
	}
	if strings.TrimSpace(envelope.OccurredAt) == "" || strings.TrimSpace(envelope.ProducedAt) == "" {
		return fmt.Errorf("occurred_at and produced_at are required")
	}
	occurredAt, err := time.Parse(time.RFC3339Nano, envelope.OccurredAt)
	if err != nil {
		return fmt.Errorf("occurred_at is invalid: %w", err)
	}
	producedAt, err := time.Parse(time.RFC3339Nano, envelope.ProducedAt)
	if err != nil {
		return fmt.Errorf("produced_at is invalid: %w", err)
	}
	if producedAt.Before(occurredAt.Add(-5 * time.Minute)) {
		return fmt.Errorf("produced_at is implausibly earlier than occurred_at")
	}
	if !marketCodePattern.MatchString(strings.ToLower(strings.TrimSpace(envelope.Market))) {
		return fmt.Errorf("market is missing or invalid")
	}
	if !serviceNamePattern.MatchString(strings.TrimSpace(envelope.Service)) {
		return fmt.Errorf("service is missing or invalid")
	}
	if !actorPattern.MatchString(strings.TrimSpace(envelope.ActorPseudonymousID)) {
		return fmt.Errorf("actor_pseudonymous_id is missing or not pseudonymous")
	}
	if strings.TrimSpace(envelope.EntityID) == "" || strings.TrimSpace(envelope.CorrelationID) == "" || strings.TrimSpace(envelope.TraceID) == "" {
		return fmt.Errorf("entity_id, correlation_id and trace_id are required")
	}
	if !validPIIClassification(envelope.PIIClassification) {
		return fmt.Errorf("pii_classification is missing or invalid")
	}
	if !validRetentionClass(envelope.RetentionClass) {
		return fmt.Errorf("retention_class is missing or invalid")
	}
	if strings.TrimSpace(envelope.DedupeKey) == "" {
		return fmt.Errorf("dedupe_key is required")
	}
	if len(envelope.FieldPIIClassification) == 0 {
		return fmt.Errorf("field_pii_classification is required")
	}
	for field, classification := range envelope.FieldPIIClassification {
		if strings.TrimSpace(field) == "" || !validPIIClassification(domain.PIIClassification(classification)) {
			return fmt.Errorf("field_pii_classification contains invalid field or class")
		}
	}
	if !json.Valid(envelope.Data) || bytes.Equal(bytes.TrimSpace(envelope.Data), []byte("null")) {
		return fmt.Errorf("data must be a JSON object or array")
	}
	var dataValue interface{}
	if err := json.Unmarshal(envelope.Data, &dataValue); err != nil {
		return fmt.Errorf("data cannot be decoded: %w", err)
	}
	switch dataValue.(type) {
	case map[string]interface{}, []interface{}:
		return nil
	default:
		return fmt.Errorf("data must be a JSON object or array")
	}
}

func contains(values []int, candidate int) bool {
	for _, value := range values {
		if value == candidate {
			return true
		}
	}
	return false
}

func validPIIClassification(value domain.PIIClassification) bool {
	switch value {
	case domain.PIIPublic, domain.PIIInternal, domain.PIIConfidential, domain.PIIRestricted:
		return true
	default:
		return false
	}
}

func validRetentionClass(value domain.RetentionClass) bool {
	switch value {
	case domain.RetentionShort, domain.RetentionStandard, domain.RetentionFinancial, domain.RetentionLegalHold:
		return true
	default:
		return false
	}
}
