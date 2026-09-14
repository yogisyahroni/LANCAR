package middleware

import "testing"

func TestIsInternalAPIKeyValidFailsClosedAndComparesConstantTime(t *testing.T) {
	if IsInternalAPIKeyValid("", "") {
		t.Fatal("missing configured key must fail closed")
	}
	if IsInternalAPIKeyValid("service-key", "") || IsInternalAPIKeyValid("", "service-key") {
		t.Fatal("missing key on either side must fail closed")
	}
	if !IsInternalAPIKeyValid("service-key", " service-key ") {
		t.Fatal("matching trimmed key must be accepted")
	}
	if IsInternalAPIKeyValid("service-key", "service-key-x") {
		t.Fatal("different key must be rejected")
	}
}
