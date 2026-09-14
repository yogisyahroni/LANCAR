package middleware

import (
	"net/http"
	"strings"
)

// InternalAPIKeyFailureReason returns a low-cardinality reason suitable for
// metrics/log aggregation. It intentionally never returns either credential.
func InternalAPIKeyFailureReason(expected, provided string) string {
	expected = strings.TrimSpace(expected)
	provided = strings.TrimSpace(provided)
	if expected == "" {
		return "missing_configured_key"
	}
	if provided == "" {
		return "missing_provided_key"
	}
	if len(expected) != len(provided) {
		return "length_mismatch"
	}
	return "mismatch"
}

// RequireInternalAPIKey records a redacted, structured security event for an
// invalid service credential and leaves the response contract to the caller.
// No credential, signature or request body is included in the event.
func RequireInternalAPIKey(r *http.Request, expected, provided, boundary string) bool {
	expected = strings.TrimSpace(expected)
	provided = strings.TrimSpace(provided)
	if expected != "" && provided != "" && len(expected) == len(provided) && constantTimeEqual(expected, provided) {
		return true
	}

	LogJSON("warn", "internal_auth_failure", map[string]interface{}{
		"security_event":         "internal_auth_failure",
		"auth_boundary":          boundary,
		"failure_reason":         InternalAPIKeyFailureReason(expected, provided),
		"configured_key_present": expected != "",
		"provided_key_present":   provided != "",
		"method":                 r.Method,
		"path":                   r.URL.Path,
		"remote_addr":            r.RemoteAddr,
		"correlation_id":         GetCorrelationID(r.Context()),
	})
	return false
}

func constantTimeEqual(left, right string) bool {
	if len(left) != len(right) {
		return false
	}
	var difference byte
	for index := range left {
		difference |= left[index] ^ right[index]
	}
	return difference == 0
}
