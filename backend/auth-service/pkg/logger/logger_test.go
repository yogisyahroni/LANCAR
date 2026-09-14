package logger

import (
	"errors"
	"log/slog"
	"strings"
	"testing"
)

func TestRedactAttrRemovesSecretsFromKeysValuesAndErrors(t *testing.T) {
	if got := redactAttr(nil, slog.String("api_key", "provider-secret")).Value.String(); got != redactedValue {
		t.Fatalf("sensitive key was not redacted: %q", got)
	}
	message := redactAttr(nil, slog.String("message", "Bearer abcdefghijklmnopqrstuvwxyz123456")).Value.String()
	if strings.Contains(message, "abcdefghijklmnopqrstuvwxyz123456") {
		t.Fatalf("bearer token leaked: %q", message)
	}
	errValue := redactAttr(nil, slog.Any("error", errors.New("provider failed with token eyJabc.def.ghi"))).Value.String()
	if strings.Contains(errValue, "eyJabc.def.ghi") {
		t.Fatalf("error token leaked: %q", errValue)
	}
}
