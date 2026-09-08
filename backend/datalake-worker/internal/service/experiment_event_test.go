package service

import (
	"github.com/LANCAR/datalake-worker/internal/domain"
	"testing"
	"time"
)

func TestExperimentExposureEventIsGoverned(t *testing.T) {
	schema, ok := EventSchemaRegistry["experiment.exposure"]
	if !ok || schema.EventType != "experiment.exposure" {
		t.Fatal("experiment exposure event must be registered")
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	envelope := domain.EventEnvelope{
		EventID: "experiment-exposure-0001", EventType: "experiment.exposure", SchemaVersion: 1,
		OccurredAt: now, ProducedAt: now, Market: "id-jk", Service: "order-service",
		ActorPseudonymousID: "system", EntityID: "exposure-1", CorrelationID: "correlation-1", TraceID: "trace-1",
		PIIClassification: domain.PIIRestricted, FieldPIIClassification: map[string]string{"payload": "restricted"},
		RetentionClass: domain.RetentionStandard, DedupeKey: "dedupe-1", Data: []byte(`{"variant":"treatment"}`),
	}
	if err := NewEventValidator().Validate(envelope); err != nil {
		t.Fatalf("experiment exposure event should validate: %v", err)
	}
}
