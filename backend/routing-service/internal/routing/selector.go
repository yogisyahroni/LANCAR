package routing

import (
	"context"
	"fmt"
	"hash/fnv"

	"lancar-backend/internal/featureflags"
)

type ModelType string

const (
	ModelP2P ModelType = "P2P"
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

// SelectModel chooses the active delivery model for new orders.
// LANCAR now accepts P2P as the only production delivery model; courier
// assignment mode is handled separately as on-demand or regular.
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

	keys := []string{"model_p2p"}
	flags, err := e.flagReader.GetFlags(ctx, keys)
	if err != nil {
		return "", fmt.Errorf("gagal baca feature flags: %w", err)
	}

	p2pFlag := flags["model_p2p"]

	pickupZone, err := e.zoneResolver.ResolveZoneCode(ctx, req.Pickup)
	if err != nil {
		return "", fmt.Errorf("pickup zone unavailable: %w", err)
	}
	dropoffZone, err := e.zoneResolver.ResolveZoneCode(ctx, req.Dropoff)
	if err != nil {
		return "", fmt.Errorf("dropoff zone unavailable: %w", err)
	}

	if p2pFlag != nil && p2pFlag.IsEnabled && inRollout(p2pFlag, req.UserID) && zonesActive(p2pFlag, pickupZone, dropoffZone) {
		return ModelP2P, nil
	}
	return "", ErrModelUnavailable("P2P", "MSG_P2P_UNAVAILABLE")
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
