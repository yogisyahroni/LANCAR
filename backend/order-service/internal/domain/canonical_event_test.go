package domain

import (
	"os"
	"strings"
	"testing"
)

func TestNewCanonicalEventDoesNotLeakRawActorIdentity(t *testing.T) {
	previous := os.Getenv("EVENT_ACTOR_PSEUDONYM_KEY")
	defer os.Setenv("EVENT_ACTOR_PSEUDONYM_KEY", previous)
	if err := os.Setenv("EVENT_ACTOR_PSEUDONYM_KEY", "test-only-key"); err != nil {
		t.Fatal(err)
	}

	event := NewCanonicalEvent("model.unavailable.shown", "same-model", "customer-raw-id", map[string]string{"model": "food"})
	if event.ActorPseudonymousID == "customer-raw-id" || !strings.HasPrefix(event.ActorPseudonymousID, "actor_") {
		t.Fatalf("expected pseudonymous actor, got %q", event.ActorPseudonymousID)
	}
	if event.EventID == "" || event.CorrelationID == "" || event.TraceID == "" || event.DedupeKey == "" {
		t.Fatal("expected canonical identity and replay fields")
	}
	if event.SchemaVersion != 1 || event.Market != "id-jk" || event.Service != "order-service" {
		t.Fatalf("unexpected canonical defaults: %+v", event)
	}
}

func TestNewCanonicalEventUsesSystemActorWhenPseudonymKeyIsUnavailable(t *testing.T) {
	previous := os.Getenv("EVENT_ACTOR_PSEUDONYM_KEY")
	defer os.Setenv("EVENT_ACTOR_PSEUDONYM_KEY", previous)
	if err := os.Unsetenv("EVENT_ACTOR_PSEUDONYM_KEY"); err != nil {
		t.Fatal(err)
	}
	event := NewCanonicalEvent("model.unavailable.shown", "same-model", "customer-raw-id", nil)
	if event.ActorPseudonymousID != "system" {
		t.Fatalf("expected safe system fallback, got %q", event.ActorPseudonymousID)
	}
}
