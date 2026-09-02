package provider

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"testing"
)

func TestJNTWebhookAdapterPreservesNativeFieldsAndNormalizesStatus(t *testing.T) {
	adapter := jntWebhookAdapter{}
	event, err := adapter.Normalize([]byte(`{"billcode":"JNT-1","scantype":"DELIVERED","scanCode":"D01","scanNetwork":"Surabaya","scantime":"2026-09-01T10:00:00Z","signpic":"https://carrier.test/pod.jpg"}`))
	if err != nil {
		t.Fatalf("normalize J&T webhook: %v", err)
	}
	if event.Provider != "JNT" || event.AWBNumber != "JNT-1" || event.Status != "DELIVERED" {
		t.Fatalf("unexpected canonical event: %+v", event)
	}
	if event.RawCode != "D01" || event.RawLocation != "Surabaya" || event.PodURL == "" {
		t.Fatalf("native fields were lost: %+v", event)
	}
}

func TestWebhookAdapterVerifiesSignatureAtProviderBoundary(t *testing.T) {
	body := []byte(`{"billcode":"JNT-2","scantype":"IN_TRANSIT"}`)
	secret := "test-webhook-secret"
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)

	headers := make(http.Header)
	headers.Set("X-Webhook-Signature", hex.EncodeToString(mac.Sum(nil)))
	if err := (jntWebhookAdapter{}).VerifySignature(headers, body, secret); err != nil {
		t.Fatalf("valid signature rejected: %v", err)
	}
	headers.Set("X-Webhook-Signature", "invalid")
	if err := (jntWebhookAdapter{}).VerifySignature(headers, body, secret); err == nil {
		t.Fatal("invalid signature accepted")
	}
}

func TestWebhookRegistryRoutesOnlyRegisteredProviderAdapters(t *testing.T) {
	registry := NewWebhookAdapterRegistry()
	if adapter, ok := registry.Get("JNE"); !ok || adapter.ProviderCode() != "jne" {
		t.Fatal("JNE adapter was not registered")
	}
	if _, ok := registry.Get("unknown"); ok {
		t.Fatal("unknown provider must not be treated as registered")
	}
}
