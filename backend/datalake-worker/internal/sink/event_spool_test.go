package sink

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/LANCAR/datalake-worker/internal/domain"
)

func TestEventSpoolPersistsAndSuppressesRedelivery(t *testing.T) {
	dir := t.TempDir()
	eventSink, err := NewEventSpool(dir)
	if err != nil {
		t.Fatalf("create event spool: %v", err)
	}
	event := domain.EventEnvelope{
		EventID:                "event-123456",
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
		FieldPIIClassification: map[string]string{"payload": "restricted"},
		RetentionClass:         domain.RetentionFinancial,
		DedupeKey:              "dedupe-123",
		Data:                   json.RawMessage(`{"order_total_minor":1000}`),
	}
	duplicate, err := eventSink.Write(context.Background(), event)
	if err != nil || duplicate {
		t.Fatalf("first write should persist, duplicate=%v err=%v", duplicate, err)
	}
	duplicate, err = eventSink.Write(context.Background(), event)
	if err != nil || !duplicate {
		t.Fatalf("second write should be suppressed, duplicate=%v err=%v", duplicate, err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read spool: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one spool file, got %d", len(entries))
	}
	content, err := os.ReadFile(filepath.Join(dir, entries[0].Name()))
	if err != nil {
		t.Fatalf("read spool file: %v", err)
	}
	if strings.Count(string(content), "event-123456") != 1 {
		t.Fatalf("expected exactly one persisted event, got %q", string(content))
	}
}
