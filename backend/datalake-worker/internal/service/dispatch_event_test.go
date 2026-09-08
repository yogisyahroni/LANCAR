package service

import (
	"encoding/json"
	"testing"
)

func TestDispatchDecisionEventIsRegisteredAndValid(t *testing.T) {
	schema, ok := EventSchemaRegistry["dispatch.decision"]
	if !ok || schema.EventType != "dispatch.decision" {
		t.Fatal("dispatch.decision must be registered")
	}
	event := validEnvelope()
	event.EventType = "dispatch.decision"
	event.Data = json.RawMessage(`{"candidate_hash":"hash","score":0.8,"model_version":"v1","rule_version":"r1"}`)
	if err := NewEventValidator().Validate(event); err != nil {
		t.Fatalf("dispatch.decision should validate: %v", err)
	}
}
