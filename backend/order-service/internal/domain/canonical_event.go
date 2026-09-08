package domain

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
)

// CanonicalEventEnvelope is the producer-side wire shape shared with the
// governed datalake stream. Raw account identity is never put in the event.
type CanonicalEventEnvelope struct {
	EventID                string            `json:"event_id"`
	EventType              string            `json:"event_type"`
	SchemaVersion          int               `json:"schema_version"`
	OccurredAt             time.Time         `json:"occurred_at"`
	ProducedAt             time.Time         `json:"produced_at"`
	Market                 string            `json:"market"`
	Service                string            `json:"service"`
	ActorPseudonymousID    string            `json:"actor_pseudonymous_id"`
	EntityID               string            `json:"entity_id"`
	CorrelationID          string            `json:"correlation_id"`
	TraceID                string            `json:"trace_id"`
	PIIClassification      string            `json:"pii_classification"`
	FieldPIIClassification map[string]string `json:"field_pii_classification"`
	RetentionClass         string            `json:"retention_class"`
	DedupeKey              string            `json:"dedupe_key"`
	Data                   interface{}       `json:"data"`
}

func NewCanonicalEvent(eventType, entityID, actorID string, data interface{}) CanonicalEventEnvelope {
	now := time.Now().UTC()
	eventID := uuid.NewString()
	correlationID := uuid.NewString()
	if data == nil {
		data = map[string]interface{}{}
	}
	return CanonicalEventEnvelope{
		EventID:                eventID,
		EventType:              eventType,
		SchemaVersion:          1,
		OccurredAt:             now,
		ProducedAt:             now,
		Market:                 strings.ToLower(envOrDefault("LANCAR_MARKET_CODE", "id-jk")),
		Service:                envOrDefault("LANCAR_SERVICE_NAME", "order-service"),
		ActorPseudonymousID:    pseudonymizeActor(actorID),
		EntityID:               entityID,
		CorrelationID:          correlationID,
		TraceID:                correlationID,
		PIIClassification:      "restricted",
		FieldPIIClassification: map[string]string{"payload": "restricted"},
		RetentionClass:         "standard",
		DedupeKey:              digest(eventType + "|" + entityID + "|" + eventID),
		Data:                   data,
	}
}

func envOrDefault(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func pseudonymizeActor(rawActorID string) string {
	if strings.TrimSpace(rawActorID) == "" {
		return "system"
	}
	key := strings.TrimSpace(os.Getenv("EVENT_ACTOR_PSEUDONYM_KEY"))
	if key == "" {
		return "system"
	}
	mac := hmac.New(sha256.New, []byte(key))
	_, _ = mac.Write([]byte(rawActorID))
	return "actor_" + hex.EncodeToString(mac.Sum(nil))
}

func digest(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

type CanonicalEventPublisher interface {
	PublishCanonical(ctx context.Context, event CanonicalEventEnvelope) error
}
