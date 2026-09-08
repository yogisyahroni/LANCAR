package service

import (
	"encoding/json"
	"testing"

	"github.com/LANCAR/datalake-worker/internal/domain"
)

func validEnvelope() domain.EventEnvelope {
	return domain.EventEnvelope{
		EventID:                "7f65f5f8-49bb-4b57-9eb6-4e07b35be4b0",
		EventType:              "order.completed",
		SchemaVersion:          1,
		OccurredAt:             "2026-09-08T10:00:00Z",
		ProducedAt:             "2026-09-08T10:00:01Z",
		Market:                 "id-jk",
		Service:                "order-service",
		ActorPseudonymousID:    "actor_0123456789abcdef",
		EntityID:               "order-123",
		CorrelationID:          "corr-123",
		TraceID:                "trace-123",
		PIIClassification:      domain.PIIRestricted,
		FieldPIIClassification: map[string]string{"payload": "restricted", "order_total_minor": "confidential"},
		RetentionClass:         domain.RetentionFinancial,
		DedupeKey:              "order.completed:order-123:1",
		Data:                   json.RawMessage(`{"order_total_minor":1000,"currency":"IDR"}`),
	}
}

func TestValidateCanonicalEnvelope(t *testing.T) {
	if err := NewEventValidator().Validate(validEnvelope()); err != nil {
		t.Fatalf("expected valid envelope, got %v", err)
	}
}

func TestLegacyEnvelopeNormalizesWithoutLosingIdentity(t *testing.T) {
	envelope := validEnvelope()
	envelope.EventID = ""
	envelope.SchemaVersion = 0
	envelope.Data = nil
	envelope.LegacyID = "legacy-event-123"
	envelope.LegacySchemaVersion = 1
	envelope.LegacyPayload = json.RawMessage(`{"status":"delivered"}`)
	envelope.Normalize()

	// A legacy id is accepted as a stable event identity while the producer
	// migration is in progress; aliases are never used as the new wire shape.
	if err := NewEventValidator().Validate(envelope); err != nil {
		t.Fatalf("expected normalized legacy envelope, got %v", err)
	}
	if envelope.DedupeIdentity() == "" {
		t.Fatal("expected stable dedupe identity")
	}
}

func TestUnsupportedRegisteredSchemaVersionIsRejected(t *testing.T) {
	envelope := validEnvelope()
	envelope.SchemaVersion = 2
	if err := NewEventValidator().Validate(envelope); err == nil {
		t.Fatal("expected unsupported schema version to be rejected")
	}
}

func TestRawActorIdentityIsRejected(t *testing.T) {
	envelope := validEnvelope()
	envelope.ActorPseudonymousID = "customer-123"
	if err := NewEventValidator().Validate(envelope); err == nil {
		t.Fatal("expected raw actor identity to be rejected")
	}
}
