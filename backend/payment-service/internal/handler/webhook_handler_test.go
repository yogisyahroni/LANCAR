package handler

import (
	"net/http/httptest"
	"testing"
)

func TestVerifyXenditCallbackFailsClosedAndUsesConstantTimeComparison(t *testing.T) {
	t.Setenv("XENDIT_CALLBACK_TOKEN", "staging-callback-token")

	request := httptest.NewRequest("POST", "/webhooks/xendit", nil)
	if verifyXenditCallback(request) {
		t.Fatal("missing callback token must fail closed")
	}

	request.Header.Set("x-callback-token", "wrong-token")
	if verifyXenditCallback(request) {
		t.Fatal("incorrect callback token must be rejected")
	}

	request.Header.Set("x-callback-token", "staging-callback-token")
	if !verifyXenditCallback(request) {
		t.Fatal("configured callback token must be accepted")
	}
}

func TestVerifyXenditCallbackRejectsMissingDeploymentSecret(t *testing.T) {
	t.Setenv("XENDIT_CALLBACK_TOKEN", "")
	request := httptest.NewRequest("POST", "/webhooks/xendit", nil)
	request.Header.Set("x-callback-token", "anything")
	if verifyXenditCallback(request) {
		t.Fatal("missing deployment secret must fail closed")
	}
}
