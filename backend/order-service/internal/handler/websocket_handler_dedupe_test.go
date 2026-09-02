package handler

import (
	"encoding/json"
	"sync"
	"testing"
)

// CORE-2026-007: dedupe test — older/duplicate event versions are dropped.
func TestWSHandlerDedupeOlderEvents(t *testing.T) {
	h := &WSHandler{
		clients:       make(map[*client]bool),
		rooms:         make(map[string]map[*client]bool),
		register:      make(chan *client),
		unregister:    make(chan *client),
		lastVersion:   make(map[string]uint64),
	}

	// First event: version 1 → should broadcast (seen 0 < 1).
	ev1 := versionedEvent{OrderID: "order-a", UserID: "user-1", Version: 1}
	b1 := broadcastPayload(ev1, t)
	h.broadcastToRoomFromEvent("order.updates", b1)
	if v := h.lastVersion[h.versionKey("", "order-a")]; v != 1 {
		t.Fatalf("after ev1 lastVersion = %d, want 1", v)
	}

	// Same version (duplicate delivery) → must NOT bump or re-broadcast.
	evDup := versionedEvent{OrderID: "order-a", UserID: "user-1", Version: 1}
	h.broadcastToRoomFromEvent("order.updates", broadcastPayload(evDup, t))
	if v := h.lastVersion[h.versionKey("", "order-a")]; v != 1 {
		t.Fatalf("duplicate v1 lastVersion = %d, want 1 (no bump)", v)
	}

	// Older version → dropped.
	evOld := versionedEvent{OrderID: "order-a", UserID: "user-1", Version: 0}
	h.broadcastToRoomFromEvent("order.updates", broadcastPayload(evOld, t))
	if v := h.lastVersion[h.versionKey("", "order-a")]; v != 1 {
		t.Fatalf("older v0 lastVersion = %d, want 1", v)
	}

	// Newer version → bumped.
	ev2 := versionedEvent{OrderID: "order-a", UserID: "user-1", Version: 2}
	h.broadcastToRoomFromEvent("order.updates", broadcastPayload(ev2, t))
	if v := h.lastVersion[h.versionKey("", "order-a")]; v != 2 {
		t.Fatalf("after ev2 lastVersion = %d, want 2", v)
	}
}

// CORE-2026-007: version key separates user-scoped vs order-scoped entries.
func TestWSHandlerVersionKey(t *testing.T) {
	h := &WSHandler{lastVersion: make(map[string]uint64)}
	got := h.versionKey("u1", "o1")
	if got != "u1:o1" {
		t.Fatalf("user+order key = %q, want u1:o1", got)
	}
	got = h.versionKey("", "o2")
	if got != "o:o2" {
		t.Fatalf("order-only key = %q, want o:o2", got)
	}
}

func broadcastPayload(ev versionedEvent, t *testing.T) string {
	t.Helper()
	b, err := json.Marshal(ev)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return string(b)
}

// suppress unused-import warnings
var _ = sync.Mutex{}
