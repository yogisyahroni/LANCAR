package middleware

import (
	"net/http"
	"strings"
)

// transactionTelemetryFields turns the central request log into a low-cardinality
// transaction signal. It intentionally records stage/outcome, not customer,
// courier, order, provider, or payment identifiers.
func transactionTelemetryFields(r *http.Request, status int) StructuredFields {
	stage := transactionStage(r.URL.Path)
	outcome := transactionOutcome(status)
	if status >= http.StatusOK && status < http.StatusMultipleChoices {
		outcome = "success"
	}
	if status == http.StatusConflict {
		switch stage {
		case "quote":
			outcome = "requote_required"
		case "create", "payment":
			if r.Header.Get("X-Idempotency-Key") != "" || r.Header.Get("Idempotency-Key") != "" {
				outcome = "duplicate_prevented_or_conflict"
			}
		case "transition":
			outcome = "transition_error"
		case "proof_handoff":
			outcome = "proof_or_handoff_failure"
		}
	}
	return StructuredFields{
		"event_name":          "transaction_telemetry",
		"transaction_stage":   stage,
		"transaction_outcome": outcome,
		"flow_segment":        transactionFlowSegment(stage),
	}
}

func transactionStage(path string) string {
	p := strings.ToLower(path)
	switch {
	case strings.Contains(p, "quote"), strings.Contains(p, "estimate"), strings.Contains(p, "pricing"), strings.Contains(p, "tariff"):
		return "quote"
	case strings.Contains(p, "payment"), strings.Contains(p, "checkout"), strings.Contains(p, "refund"), strings.Contains(p, "payout"), strings.Contains(p, "settlement"), strings.Contains(p, "reconcil"):
		return "financial"
	case strings.Contains(p, "dispatch"), strings.Contains(p, "matching"), strings.Contains(p, "courier"), strings.Contains(p, "technician"), strings.Contains(p, "operator"), strings.Contains(p, "no-supply"), strings.Contains(p, "reassign"):
		return "matching"
	case strings.Contains(p, "proof"), strings.Contains(p, "handoff"), strings.Contains(p, "scan"), strings.Contains(p, "pod"):
		return "proof_handoff"
	case strings.Contains(p, "transition"), strings.Contains(p, "status"):
		return "transition"
	case strings.Contains(p, "ws"), strings.Contains(p, "socket"), strings.Contains(p, "reconnect"), strings.Contains(p, "stream"):
		return "realtime"
	case strings.Contains(p, "order"), strings.Contains(p, "food"), strings.Contains(p, "parcel"), strings.Contains(p, "booking"):
		return "create"
	default:
		return "other"
	}
}

func transactionFlowSegment(stage string) string {
	switch stage {
	case "quote", "create", "financial", "matching":
		return stage
	default:
		return "operational"
	}
}

func transactionOutcome(status int) string {
	switch {
	case status >= http.StatusInternalServerError:
		return "server_error"
	case status >= http.StatusBadRequest:
		return "client_error"
	default:
		return "completed"
	}
}
