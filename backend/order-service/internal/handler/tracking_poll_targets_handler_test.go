package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"tembus/order-service/internal/domain"
)

type trackingPollTargetRepoStub struct{}

func (trackingPollTargetRepoStub) ListTrackingPollTargets(context.Context) ([]domain.TrackingPollTarget, error) {
	return []domain.TrackingPollTarget{{Provider: "jne", AWB: "AWB-1"}}, nil
}

func TestTrackingPollTargetsHandlerRequiresInternalKeyAndReturnsPersistedTargets(t *testing.T) {
	t.Setenv("INTERNAL_API_KEY", "poll-key")
	handler := NewTrackingPollTargetsHandler(trackingPollTargetRepoStub{})

	unauthorized := httptest.NewRecorder()
	handler.Handle(unauthorized, httptest.NewRequest(http.MethodGet, "/api/v1/internal/delivery/tracking-poll-targets", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("expected unauthorized response, got %d", unauthorized.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/v1/internal/delivery/tracking-poll-targets", nil)
	request.Header.Set("X-Internal-Api-Key", "poll-key")
	response := httptest.NewRecorder()
	handler.Handle(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected success response, got %d", response.Code)
	}
	var payload struct {
		Targets []domain.TrackingPollTarget `json:"targets"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload.Targets) != 1 || payload.Targets[0].AWB != "AWB-1" {
		t.Fatalf("expected durable target payload, got %#v", payload.Targets)
	}
}
