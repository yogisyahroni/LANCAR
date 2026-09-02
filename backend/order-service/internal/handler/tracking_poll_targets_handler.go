package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"

	"tembus/order-service/internal/domain"
)

// TrackingPollTargetsHandler exposes only persisted active shipments to the
// integration gateway. It is an internal, API-key protected queue boundary.
type TrackingPollTargetsHandler struct {
	repo           domain.TrackingPollTargetRepository
	internalAPIKey string
}

func NewTrackingPollTargetsHandler(repo domain.TrackingPollTargetRepository) *TrackingPollTargetsHandler {
	return &TrackingPollTargetsHandler{repo: repo, internalAPIKey: os.Getenv("INTERNAL_API_KEY")}
}

func (h *TrackingPollTargetsHandler) Handle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.internalAPIKey != "" && r.Header.Get("X-Internal-Api-Key") != h.internalAPIKey {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	targets, err := h.repo.ListTrackingPollTargets(r.Context())
	if err != nil {
		slog.ErrorContext(r.Context(), "tracking_poll_targets: query failed", "error", err)
		http.Error(w, "Unable to load tracking poll targets", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"targets": targets})
}
