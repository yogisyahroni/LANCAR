package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"tembus/order-service/pkg/logger"
)

// IsInternalAPIKeyValid authenticates service-to-service requests. An absent
// configured key is a deployment error, never permission to continue. Length
// is checked before ConstantTimeCompare because the latter requires equal-size
// inputs.
func IsInternalAPIKeyValid(expected, provided string) bool {
	expected = strings.TrimSpace(expected)
	provided = strings.TrimSpace(provided)
	if expected == "" || provided == "" || len(expected) != len(provided) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(expected), []byte(provided)) == 1
}

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
	if IsInternalAPIKeyValid(expected, provided) {
		return true
	}

	logger.Warn("internal_auth_failure",
		"security_event", "internal_auth_failure",
		"auth_boundary", boundary,
		"failure_reason", InternalAPIKeyFailureReason(expected, provided),
		"configured_key_present", strings.TrimSpace(expected) != "",
		"provided_key_present", strings.TrimSpace(provided) != "",
		"method", r.Method,
		"path", r.URL.Path,
		"remote_addr", r.RemoteAddr,
		"correlation_id", GetCorrelationID(r.Context()),
	)
	return false
}
