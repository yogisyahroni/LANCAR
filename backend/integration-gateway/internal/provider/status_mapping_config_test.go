package provider

import "testing"

func TestRuntimeStatusMapperUsesProviderSpecificConfiguredMapping(t *testing.T) {
	mapper, err := LoadRuntimeStatusMapper(`{"jnt":{"PICKED":"PICKED_UP","CUSTOM_DELIVERED":"DELIVERED"}}`)
	if err != nil {
		t.Fatalf("load runtime mapping: %v", err)
	}
	if got := mapper.Normalize("jnt", "CUSTOM_DELIVERED", ""); got != "DELIVERED" {
		t.Fatalf("expected configured delivery mapping, got %q", got)
	}
	if got := mapper.Normalize("jne", "CUSTOM_DELIVERED", ""); got != "UNKNOWN" {
		t.Fatalf("provider mapping leaked across providers: %q", got)
	}
}

func TestRuntimeStatusMapperRejectsInvalidCanonicalState(t *testing.T) {
	if _, err := LoadRuntimeStatusMapper(`{"jne":{"X":"IN_TRANSIT_GUESS"}}`); err == nil {
		t.Fatal("invalid canonical state must be rejected")
	}
}
