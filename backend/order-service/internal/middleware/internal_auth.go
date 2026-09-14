package middleware

import (
	"crypto/subtle"
	"strings"
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
