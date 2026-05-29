package routing

import (
	"context"
	"fmt"
	"hash/fnv"
	"math"

	"tembus-backend/internal/featureflags"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

type ModelType string

const (
	ModelP2P ModelType = "P2P"
)

var routingTracer = otel.Tracer("tembus/routing-service")

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
// TEMBUS now accepts P2P as the only production delivery model; courier
// assignment mode is handled separately as on-demand or regular.
func (e *RoutingEngine) SelectModel(ctx context.Context, req OrderRequest) (ModelType, error) {
	ctx, span := routingTracer.Start(ctx, "routing.route.calculate")
	defer span.End()
	span.SetAttributes(
		attribute.String("route.provider", "internal_p2p"),
		attribute.String("route.distance_bucket", distanceBucket(req.Pickup, req.Dropoff)),
		attribute.Bool("route.cache_hit", false),
	)

	if err := validateCoordinate(req.Pickup); err != nil {
		setRoutingSpanError(span, "routing coordinate validation failed")
		return "", fmt.Errorf("pickup coordinate invalid: %w", err)
	}
	if err := validateCoordinate(req.Dropoff); err != nil {
		setRoutingSpanError(span, "routing coordinate validation failed")
		return "", fmt.Errorf("dropoff coordinate invalid: %w", err)
	}
	if e.zoneResolver == nil {
		setRoutingSpanError(span, "routing dependency missing")
		return "", fmt.Errorf("routing zone resolver is not configured")
	}

	keys := []string{"model_p2p"}
	flags, err := e.flagReader.GetFlags(ctx, keys)
	if err != nil {
		setRoutingSpanError(span, "routing feature flag lookup failed")
		return "", fmt.Errorf("gagal baca feature flags: %w", err)
	}

	p2pFlag := flags["model_p2p"]

	pickupZone, err := e.zoneResolver.ResolveZoneCode(ctx, req.Pickup)
	if err != nil {
		span.SetAttributes(attribute.Bool("zone.resolved", false))
		setRoutingSpanError(span, "pickup zone unavailable")
		return "", fmt.Errorf("pickup zone unavailable: %w", err)
	}
	dropoffZone, err := e.zoneResolver.ResolveZoneCode(ctx, req.Dropoff)
	if err != nil {
		span.SetAttributes(attribute.Bool("zone.resolved", false))
		setRoutingSpanError(span, "dropoff zone unavailable")
		return "", fmt.Errorf("dropoff zone unavailable: %w", err)
	}
	span.SetAttributes(attribute.Bool("zone.resolved", true))

	if p2pFlag != nil && p2pFlag.IsEnabled && inRollout(p2pFlag, req.UserID) && zonesActive(p2pFlag, pickupZone, dropoffZone) {
		span.SetAttributes(attribute.String("route.model", string(ModelP2P)))
		span.SetStatus(codes.Ok, "")
		return ModelP2P, nil
	}
	setRoutingSpanError(span, "p2p unavailable")
	return "", ErrModelUnavailable("P2P", "MSG_P2P_UNAVAILABLE")
}

func setRoutingSpanError(span trace.Span, description string) {
	span.SetStatus(codes.Error, description)
}

func distanceBucket(pickup Coordinate, dropoff Coordinate) string {
	latKm := (dropoff.Lat - pickup.Lat) * 111
	lngKm := (dropoff.Lng - pickup.Lng) * 111 * math.Cos((pickup.Lat+dropoff.Lat)*math.Pi/360)
	distanceKm := math.Sqrt(latKm*latKm + lngKm*lngKm)
	switch {
	case distanceKm < 1:
		return "lt_1km"
	case distanceKm < 5:
		return "1_5km"
	case distanceKm < 15:
		return "5_15km"
	case distanceKm < 30:
		return "15_30km"
	default:
		return "gte_30km"
	}
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
