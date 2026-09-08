package platform

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestClientCredentialFormatAndParsing(t *testing.T) {
	clientID, err := newClientID()
	if err != nil {
		t.Fatalf("newClientID() error = %v", err)
	}
	if !clientIDPattern.MatchString(clientID) {
		t.Fatalf("client ID %q does not match the public credential format", clientID)
	}
	key, err := GenerateAPIKey("sandbox", clientID)
	if err != nil {
		t.Fatalf("GenerateAPIKey() error = %v", err)
	}
	environment, parsedID, secret, err := parseAPIKey("Bearer " + key)
	if err != nil {
		t.Fatalf("parseAPIKey() error = %v", err)
	}
	if environment != "sandbox" || parsedID != clientID || secret == "" {
		t.Fatalf("parsed credential = (%q, %q, secret-present=%t)", environment, parsedID, secret != "")
	}
	if _, _, _, err := parseAPIKey("lcr_sandbox_" + strings.TrimPrefix(clientID, "cli_") + "_secret"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("malformed client ID should be rejected, got %v", err)
	}
}

func TestSecretBoxAndWebhookSignature(t *testing.T) {
	key, err := NewEncryptionKey("developer-platform-local-key-32b")
	if err != nil {
		t.Fatalf("NewEncryptionKey() error = %v", err)
	}
	box, err := NewSecretBox(key)
	if err != nil {
		t.Fatalf("NewSecretBox() error = %v", err)
	}
	ciphertext, err := box.Seal("webhook-secret")
	if err != nil {
		t.Fatalf("Seal() error = %v", err)
	}
	if string(ciphertext) == "webhook-secret" {
		t.Fatal("webhook secret was not encrypted")
	}
	plain, err := box.Open(ciphertext)
	if err != nil || plain != "webhook-secret" {
		t.Fatalf("Open() = %q, %v", plain, err)
	}

	timestamp := time.Unix(1_757_401_234, 0).UTC()
	body := []byte(`{"id":"evt-1","data":{"email":"hidden@example.test","status":"ok"}}`)
	first := SignWebhook("signing-secret", timestamp, body)
	if !strings.HasPrefix(first, "sha256=") || len(first) != len("sha256=")+64 {
		t.Fatalf("unexpected webhook signature %q", first)
	}
	if first == SignWebhook("other-secret", timestamp, body) || first == SignWebhook("signing-secret", timestamp.Add(time.Second), body) {
		t.Fatal("webhook signature did not bind secret and timestamp")
	}
}

func TestWebhookURLAndRetryPolicy(t *testing.T) {
	valid := []struct {
		url       string
		local     bool
		wantError bool
	}{
		{"https://hooks.example.test/lancar", false, false},
		{"http://localhost:9090/hook", true, false},
		{"http://localhost:9090/hook", false, true},
		{"https://10.0.0.5/hook", false, true},
		{"https://user:pass@example.test/hook", false, true},
		{"https://example.test/hook?token=secret", false, true},
	}
	for _, test := range valid {
		t.Run(test.url, func(t *testing.T) {
			if got := validateWebhookURL(test.url, test.local); (got != nil) != test.wantError {
				t.Fatalf("validateWebhookURL() error = %v, wantError=%t", got, test.wantError)
			}
		})
	}
	for _, status := range []int{0, 408, 425, 429, 500, 503} {
		if !retryableWebhookResponse(status) {
			t.Errorf("status %d should be retryable", status)
		}
	}
	for _, status := range []int{200, 400, 401, 404} {
		if retryableWebhookResponse(status) {
			t.Errorf("status %d should not be retryable", status)
		}
	}
	now := time.Unix(100, 0)
	if got := nextRetry(1, now); !got.Equal(now.Add(30 * time.Second)) {
		t.Fatalf("first retry = %v", got)
	}
	if got := nextRetry(8, now); !got.Equal(now.Add(30 * time.Minute)) {
		t.Fatalf("maximum retry = %v", got)
	}
}

func TestSanitizedPayloadRedactsSensitiveFields(t *testing.T) {
	raw := []byte(`{"email":"a@example.test","phone":"08123456789","address":"secret","payment_status":"paid","nested":{"token":"abc","status":"ok"}}`)
	sanitized := sanitizedPayload(raw)
	var value map[string]any
	if err := json.Unmarshal(sanitized, &value); err != nil {
		t.Fatalf("sanitized payload is invalid JSON: %v", err)
	}
	for _, field := range []string{"email", "phone", "address", "payment_status"} {
		if value[field] != "[REDACTED]" {
			t.Errorf("field %s = %v, want redacted", field, value[field])
		}
	}
	nested, ok := value["nested"].(map[string]any)
	if !ok || nested["token"] != "[REDACTED]" || nested["status"] != "ok" {
		t.Fatalf("nested sensitive data was not sanitized: %#v", value["nested"])
	}
}

func TestScopeAndRequestValidation(t *testing.T) {
	client := Client{Scopes: []string{"orders:read"}}
	if err := RequireScope(client, "orders:read"); err != nil {
		t.Fatalf("granted scope rejected: %v", err)
	}
	if err := RequireScope(client, "orders:write"); !errors.Is(err, ErrInsufficientScope) {
		t.Fatalf("missing scope error = %v", err)
	}
	if err := validateCreateBody([]byte(`{"estimate_id":"est-1","item_description":"A package"}`)); err != nil {
		t.Fatalf("valid order body rejected: %v", err)
	}
	if err := validateCreateBody([]byte(`{"estimate_id":"est-1","item_description":"bad"}`)); err == nil {
		t.Fatal("short item description accepted")
	}
	if !validIdempotencyKey("developer-request-001") || validIdempotencyKey("short") || validIdempotencyKey("bad key here") {
		t.Fatal("idempotency key policy is incorrect")
	}
}
