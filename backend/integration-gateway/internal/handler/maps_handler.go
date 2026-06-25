package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"tembus/integration-gateway/internal/domain"
)

type MapsHandler struct {
	provider domain.MapsProvider
}

func NewMapsHandler(provider domain.MapsProvider) *MapsHandler {
	return &MapsHandler{
		provider: provider,
	}
}

type DistanceMatrixRequest struct {
	OriginLat  float64 `json:"origin_lat"`
	OriginLng  float64 `json:"origin_lng"`
	DestLat    float64 `json:"dest_lat"`
	DestLng    float64 `json:"dest_lng"`
	UseTraffic bool    `json:"use_traffic"`
}

type DistanceMatrixResponse struct {
	DistanceKM  float64 `json:"distance_km"`
	DurationMin float64 `json:"duration_min"`
	OriginAddr  string  `json:"origin_addr"`
	DestAddr    string  `json:"dest_addr"`
}

func (h *MapsHandler) GetDistanceMatrix(w http.ResponseWriter, r *http.Request) {
	var req DistanceMatrixRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	distanceKM, durationMin, originAddr, destAddr, err := h.provider.GetDistanceMatrix(
		r.Context(),
		req.OriginLat, req.OriginLng,
		req.DestLat, req.DestLng,
		req.UseTraffic,
	)

	if err != nil {
		log.Printf("[integration-gateway] GetDistanceMatrix Error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	resp := DistanceMatrixResponse{
		DistanceKM:  distanceKM,
		DurationMin: durationMin,
		OriginAddr:  originAddr,
		DestAddr:    destAddr,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

type OptimizeWaypointsRequest struct {
	Origin     domain.Waypoint   `json:"origin"`
	Waypoints  []domain.Waypoint `json:"waypoints"`
	Dest       domain.Waypoint   `json:"dest"`
	UseTraffic bool              `json:"use_traffic"`
}

func (h *MapsHandler) OptimizeWaypoints(w http.ResponseWriter, r *http.Request) {
	var req OptimizeWaypointsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	resp, err := h.provider.OptimizeWaypoints(r.Context(), req.Origin, req.Waypoints, req.Dest, req.UseTraffic)
	if err != nil {
		log.Printf("[integration-gateway] OptimizeWaypoints Error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
