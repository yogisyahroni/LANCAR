package domain

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
)

const CanonicalEventSchemaVersion = 1

type PIIClassification string

const (
	PIIPublic       PIIClassification = "public"
	PIIInternal     PIIClassification = "internal"
	PIIConfidential PIIClassification = "confidential"
	PIIRestricted   PIIClassification = "restricted"
)

type RetentionClass string

const (
	RetentionShort     RetentionClass = "short"
	RetentionStandard  RetentionClass = "standard"
	RetentionFinancial RetentionClass = "financial"
	RetentionLegalHold RetentionClass = "legal_hold"
)

// EventEnvelope is the wire contract consumed by analytics/ML. Data is kept as
// JSON so governed consumers can evolve independently from transactional APIs.
// LegacyID/LegacySchemaVersion/LegacyPayload allow a controlled read of old
// outbox messages while producers roll forward to the canonical names.
type EventEnvelope struct {
	EventID                string            `json:"event_id"`
	EventType              string            `json:"event_type"`
	SchemaVersion          int               `json:"schema_version"`
	OccurredAt             string            `json:"occurred_at"`
	ProducedAt             string            `json:"produced_at"`
	Market                 string            `json:"market"`
	Service                string            `json:"service"`
	ActorPseudonymousID    string            `json:"actor_pseudonymous_id"`
	EntityID               string            `json:"entity_id"`
	CorrelationID          string            `json:"correlation_id"`
	TraceID                string            `json:"trace_id"`
	PIIClassification      PIIClassification `json:"pii_classification"`
	FieldPIIClassification map[string]string `json:"field_pii_classification"`
	RetentionClass         RetentionClass    `json:"retention_class"`
	DedupeKey              string            `json:"dedupe_key"`
	Data                   json.RawMessage   `json:"data"`

	LegacyID            string          `json:"id"`
	LegacySchemaVersion int             `json:"event_version"`
	LegacyPayload       json.RawMessage `json:"payload"`
}

func (e *EventEnvelope) Normalize() {
	if e.EventID == "" {
		e.EventID = e.LegacyID
	}
	if e.SchemaVersion == 0 {
		e.SchemaVersion = e.LegacySchemaVersion
	}
	if len(e.Data) == 0 {
		e.Data = e.LegacyPayload
	}
	if len(e.Data) == 0 {
		e.Data = json.RawMessage(`{}`)
	}
	if e.DedupeKey == "" {
		e.DedupeKey = e.EventID
	}
}

func (e EventEnvelope) DedupeIdentity() string {
	key := strings.TrimSpace(e.DedupeKey)
	if key == "" {
		key = strings.TrimSpace(e.EventID)
	}
	if key == "" {
		return ""
	}
	digest := sha256.Sum256([]byte(key))
	return "event:" + hex.EncodeToString(digest[:])
}
