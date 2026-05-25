package routing

import (
	"context"
	"fmt"
	"hash/fnv"
	"math"

	"lancar-backend/internal/featureflags"
)

type ModelType string

const (
	ModelP2P       ModelType = "P2P"
	ModelTwoLegs   ModelType = "TWO_LEGS"
	ModelThreeLegs ModelType = "THREE_LEGS"
)

type Coordinate struct {
	Lat float64
	Lng float64
}

type OrderRequest struct {
	Pickup  Coordinate
	Dropoff Coordinate
	UserID  string
}

// ModelUnavailableError represents a structured error when a model is not available.
type ModelUnavailableError struct {
	Model     string
	MessageID string
	UserMsg   string
}

func (e *ModelUnavailableError) Error() string {
	return fmt.Sprintf("Model %s is unavailable: %s", e.Model, e.UserMsg)
}

func ErrModelUnavailable(model string, msgID string) *ModelUnavailableError {
	return &ModelUnavailableError{
		Model:     model,
		MessageID: msgID,
		UserMsg:   "Layanan belum tersedia untuk rute ini", // This would ideally be translated via i18n
	}
}

// RoutingEngine handles model selection
type RoutingEngine struct {
	flagReader   featureflags.FlagReader
	zoneResolver ZoneResolver
}

func NewRoutingEngine(reader featureflags.FlagReader) *RoutingEngine {
	return NewRoutingEngineWithZoneResolver(reader, nil)
}

func NewRoutingEngineWithZoneResolver(reader featureflags.FlagReader, resolver ZoneResolver) *RoutingEngine {
	return &RoutingEngine{
		flagReader:   reader,
		zoneResolver: resolver,
	}
}

// SelectModel chooses the best delivery model based on distance and feature flags
func (e *RoutingEngine) SelectModel(ctx context.Context, req OrderRequest) (ModelType, error) {
	if err := validateCoordinate(req.Pickup); err != nil {
		return "", fmt.Errorf("pickup coordinate invalid: %w", err)
	}
	if err := validateCoordinate(req.Dropoff); err != nil {
		return "", fmt.Errorf("dropoff coordinate invalid: %w", err)
	}
	if e.zoneResolver == nil {
		return "", fmt.Errorf("routing zone resolver is not configured")
	}

	// Read 3 model flags in parallel using the FlagReader
	keys := []string{"model_p2p", "model_two_legs", "model_three_legs"}
	flags, err := e.flagReader.GetFlags(ctx, keys)
	if err != nil {
		return "", fmt.Errorf("gagal baca feature flags: %w", err)
	}

	p2pFlag := flags["model_p2p"]
	twoFlag := flags["model_two_legs"]
	threeFlag := flags["model_three_legs"]

	distKm := calculateDistance(req.Pickup, req.Dropoff)
	pickupZone, err := e.zoneResolver.ResolveZoneCode(ctx, req.Pickup)
	if err != nil {
		return "", fmt.Errorf("pickup zone unavailable: %w", err)
	}
	dropoffZone, err := e.zoneResolver.ResolveZoneCode(ctx, req.Dropoff)
	if err != nil {
		return "", fmt.Errorf("dropoff zone unavailable: %w", err)
	}

	switch {
	case distKm <= 15:
		if p2pFlag != nil && p2pFlag.IsEnabled && inRollout(p2pFlag, req.UserID) && zoneActive(p2pFlag, pickupZone) {
			return ModelP2P, nil
		}
		return "", ErrModelUnavailable("P2P", "MSG_P2P_UNAVAILABLE")

	case distKm <= 25:
		if twoFlag != nil && twoFlag.IsEnabled && inRollout(twoFlag, req.UserID) && zonesActive(twoFlag, pickupZone, dropoffZone) {
			return ModelTwoLegs, nil
		}
		// Fallback to 3-Legs if 2-Legs is disabled but 3-Legs is active (rare fallback case)
		if threeFlag != nil && threeFlag.IsEnabled && inRollout(threeFlag, req.UserID) && zonesActive(threeFlag, pickupZone, dropoffZone) {
			return ModelThreeLegs, nil
		}
		return "", ErrModelUnavailable("2-Kaki", "MSG_TWO_LEGS_UNAVAILABLE")

	default: // distKm > 25
		if threeFlag != nil && threeFlag.IsEnabled && inRollout(threeFlag, req.UserID) && zonesActive(threeFlag, pickupZone, dropoffZone) {
			return ModelThreeLegs, nil
		}

		msgID := "MSG_THREE_LEGS_UNAVAILABLE"
		if threeFlag != nil && threeFlag.Config != nil {
			if v, ok := threeFlag.Config["rejection_message_id"].(string); ok {
				msgID = v
			}
		}
		return "", ErrModelUnavailable("3-Kaki", msgID)
	}
}

func calculateDistance(pickup, dropoff Coordinate) float64 {
	const earthRadiusKM = 6371.0
	lat1 := degreesToRadians(pickup.Lat)
	lat2 := degreesToRadians(dropoff.Lat)
	deltaLat := degreesToRadians(dropoff.Lat - pickup.Lat)
	deltaLng := degreesToRadians(dropoff.Lng - pickup.Lng)

	a := math.Sin(deltaLat/2)*math.Sin(deltaLat/2) +
		math.Cos(lat1)*math.Cos(lat2)*math.Sin(deltaLng/2)*math.Sin(deltaLng/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadiusKM * c
}

func degreesToRadians(value float64) float64 {
	return value * math.Pi / 180
}

func validateCoordinate(coord Coordinate) error {
	if coord.Lat < -90 || coord.Lat > 90 {
		return fmt.Errorf("latitude %.6f outside range -90..90", coord.Lat)
	}
	if coord.Lng < -180 || coord.Lng > 180 {
		return fmt.Errorf("longitude %.6f outside range -180..180", coord.Lng)
	}
	return nil
}

func zoneActive(flag *featureflags.FeatureFlag, zone string) bool {
	if flag == nil || flag.Config == nil {
		return false
	}
	zones, ok := flag.Config["active_zones"].([]interface{})
	if !ok {
		return false
	}
	for _, z := range zones {
		if strZ, ok := z.(string); ok && strZ == zone {
			return true
		}
	}
	return false
}

func zonesActive(flag *featureflags.FeatureFlag, zone1, zone2 string) bool {
	return zoneActive(flag, zone1) && zoneActive(flag, zone2)
}

func inRollout(flag *featureflags.FeatureFlag, userID string) bool {
	if flag == nil {
		return false
	}
	if flag.Config == nil {
		// Default to 100% rollout if config doesn't exist
		return true
	}

	pctFloat, ok := flag.Config["rollout_pct"].(float64)
	if !ok {
		// Default to 100% rollout if rollout_pct is not specified
		return true
	}

	pct := int(pctFloat)
	if pct <= 0 {
		return false
	}
	if pct >= 100 {
		return true
	}

	h := fnv.New32a()
	h.Write([]byte(userID))
	hashValue := h.Sum32()

	// Map hash to 0-99
	return (hashValue % 100) < uint32(pct)
}
