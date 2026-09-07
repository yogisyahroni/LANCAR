package middleware

import (
	"bytes"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTransactionTelemetryClassifiesCoreStages(t *testing.T) {
	tests := []struct {
		name, path, wantStage, wantOutcome, wantSegment string
		status                                          int
		header                                          bool
	}{
		{name: "quote success", path: "/api/v1/orders/estimate", status: http.StatusOK, wantStage: "quote", wantOutcome: "success", wantSegment: "quote"},
		{name: "quote requote", path: "/api/v1/orders/quote", status: http.StatusConflict, wantStage: "quote", wantOutcome: "requote_required", wantSegment: "quote"},
		{name: "duplicate create", path: "/api/v1/orders", status: http.StatusConflict, header: true, wantStage: "create", wantOutcome: "duplicate_prevented_or_conflict", wantSegment: "create"},
		{name: "matching no supply", path: "/api/v1/courier/no-supply", status: http.StatusOK, wantStage: "matching", wantOutcome: "success", wantSegment: "matching"},
		{name: "transition error", path: "/api/v1/orders/status", status: http.StatusConflict, wantStage: "transition", wantOutcome: "transition_error", wantSegment: "operational"},
		{name: "realtime mismatch", path: "/api/v1/ws/reconnect", status: http.StatusConflict, wantStage: "realtime", wantOutcome: "client_error", wantSegment: "operational"},
		{name: "financial exception", path: "/api/v1/payments/reconcile", status: http.StatusInternalServerError, wantStage: "financial", wantOutcome: "server_error", wantSegment: "financial"},
		{name: "proof failure", path: "/api/v1/orders/proof", status: http.StatusBadRequest, wantStage: "proof_handoff", wantOutcome: "client_error", wantSegment: "operational"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, tt.path, nil)
			if tt.header {
				r.Header.Set("X-Idempotency-Key", "telemetry-test-key")
			}
			fields := transactionTelemetryFields(r, tt.status)
			if fields["transaction_stage"] != tt.wantStage || fields["transaction_outcome"] != tt.wantOutcome || fields["flow_segment"] != tt.wantSegment {
				t.Fatalf("telemetry mismatch: %#v", fields)
			}
		})
	}
}

func TestRequestLoggerEmitsTransactionTelemetryWithoutIdentifiers(t *testing.T) {
	var logs bytes.Buffer
	previous := log.Writer()
	log.SetOutput(&logs)
	defer log.SetOutput(previous)

	handler := RequestLoggerMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusConflict)
	})
	r := httptest.NewRequest(http.MethodPost, "/api/v1/orders/quote", nil)
	r.Header.Set("X-Correlation-ID", "corr-test")
	handler(httptest.NewRecorder(), r)

	output := logs.String()
	for _, expected := range []string{`"event_name":"transaction_telemetry"`, `"transaction_stage":"quote"`, `"transaction_outcome":"requote_required"`, `"duration_ms"`} {
		if !strings.Contains(output, expected) {
			t.Fatalf("missing telemetry field %q in logs: %s", expected, output)
		}
	}
	if strings.Contains(output, `"order_id"`) || strings.Contains(output, `"customer_id"`) {
		t.Fatalf("telemetry must not include business identifiers: %s", output)
	}
}
