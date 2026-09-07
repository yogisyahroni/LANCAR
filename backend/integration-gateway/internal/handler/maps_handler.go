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
	Provider    string  `json:"provider"`
}

func (h *MapsHandler) GetDistanceMatrix(w http.ResponseWriter, r *http.Request) {
	var req DistanceMatrixRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var result domain.DistanceMatrixResult
	var err error
	if metadataProvider, ok := h.provider.(domain.MapsProviderWithMetadata); ok {
		result, err = metadataProvider.GetDistanceMatrixWithMetadata(r.Context(), req.OriginLat, req.OriginLng, req.DestLat, req.DestLng, req.UseTraffic)
	} else {
		result.DistanceKM, result.DurationMin, result.OriginAddr, result.DestAddr, err = h.provider.GetDistanceMatrix(
			r.Context(), req.OriginLat, req.OriginLng, req.DestLat, req.DestLng, req.UseTraffic,
		)
	}

	if err != nil {
		log.Printf("[integration-gateway] GetDistanceMatrix Error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	resp := DistanceMatrixResponse{
		DistanceKM:  result.DistanceKM,
		DurationMin: result.DurationMin,
		OriginAddr:  result.OriginAddr,
		DestAddr:    result.DestAddr,
		Provider:    result.Provider,
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

func (h *MapsHandler) ProviderDiagnostics(w http.ResponseWriter, r *http.Request) {
	provider, ok := h.provider.(interface {
		Diagnostics() []domain.MapsProviderHealth
	})
	if !ok {
		http.Error(w, "maps provider diagnostics unavailable", http.StatusNotImplemented)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"providers": provider.Diagnostics()})
}
