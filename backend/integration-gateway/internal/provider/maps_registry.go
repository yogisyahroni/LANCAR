package provider

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"tembus/integration-gateway/internal/domain"
)

var ErrMapsUnavailable = errors.New("no healthy maps provider supports the requested capability")

type mapsProviderState struct {
	provider            domain.MapsProviderAdapter
	consecutiveFailures int
	lastLatency         time.Duration
	lastError           string
	openedAt            time.Time
}

// MapsProviderRegistry provides capability-safe failover. It returns an error
// when all providers fail; it never manufactures distance or ETA values.
type MapsProviderRegistry struct {
	mu               sync.RWMutex
	providers        []*mapsProviderState
	failureThreshold int
	circuitCooldown  time.Duration
	now              func() time.Time
}

func NewMapsProviderRegistry() *MapsProviderRegistry {
	return &MapsProviderRegistry{failureThreshold: 3, circuitCooldown: 30 * time.Second, now: time.Now}
}

func (r *MapsProviderRegistry) Register(provider domain.MapsProviderAdapter) error {
	if provider == nil || strings.TrimSpace(provider.Name()) == "" {
		return fmt.Errorf("maps provider name is required")
	}
	if len(provider.Capabilities()) == 0 {
		return fmt.Errorf("maps provider %q has no declared capabilities", provider.Name())
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, existing := range r.providers {
		if existing.provider.Name() == provider.Name() {
			return fmt.Errorf("maps provider %q is already registered", provider.Name())
		}
	}
	r.providers = append(r.providers, &mapsProviderState{provider: provider})
	return nil
}

func (r *MapsProviderRegistry) GetDistanceMatrix(ctx context.Context, originLat, originLng, destLat, destLng float64, useTraffic bool) (float64, float64, string, string, error) {
	result, err := r.GetDistanceMatrixWithMetadata(ctx, originLat, originLng, destLat, destLng, useTraffic)
	if err != nil {
		return 0, 0, "", "", err
	}
	return result.DistanceKM, result.DurationMin, result.OriginAddr, result.DestAddr, nil
}

func (r *MapsProviderRegistry) GetDistanceMatrixWithMetadata(ctx context.Context, originLat, originLng, destLat, destLng float64, useTraffic bool) (domain.DistanceMatrixResult, error) {
	capability := domain.MapsCapabilityRouting
	if useTraffic {
		capability = domain.MapsCapabilityTraffic
	}
	var lastErr error
	for _, state := range r.candidates(capability) {
		started := time.Now()
		distance, duration, origin, dest, err := state.provider.GetDistanceMatrix(ctx, originLat, originLng, destLat, destLng, useTraffic)
		if err == nil {
			r.recordSuccess(state, time.Since(started))
			return domain.DistanceMatrixResult{DistanceKM: distance, DurationMin: duration, OriginAddr: origin, DestAddr: dest, Provider: state.provider.Name()}, nil
		}
		r.recordFailure(state, time.Since(started), err)
		lastErr = err
	}
	if lastErr == nil {
		lastErr = ErrMapsUnavailable
	}
	return domain.DistanceMatrixResult{}, fmt.Errorf("maps distance matrix unavailable: %w", lastErr)
}

func (r *MapsProviderRegistry) OptimizeWaypoints(ctx context.Context, origin domain.Waypoint, waypoints []domain.Waypoint, dest domain.Waypoint, useTraffic bool) (*domain.OptimizedRouteResult, error) {
	return r.OptimizeWaypointsWithMetadata(ctx, origin, waypoints, dest, useTraffic)
}

func (r *MapsProviderRegistry) OptimizeWaypointsWithMetadata(ctx context.Context, origin domain.Waypoint, waypoints []domain.Waypoint, dest domain.Waypoint, useTraffic bool) (*domain.OptimizedRouteResult, error) {
	capability := domain.MapsCapabilityRouting
	if useTraffic {
		capability = domain.MapsCapabilityTraffic
	}
	var lastErr error
	for _, state := range r.candidates(capability) {
		started := time.Now()
		result, err := state.provider.OptimizeWaypoints(ctx, origin, waypoints, dest, useTraffic)
		if err == nil && result != nil {
			r.recordSuccess(state, time.Since(started))
			result.Provider = state.provider.Name()
			return result, nil
		}
		if err == nil {
			err = errors.New("maps provider returned empty route")
		}
		r.recordFailure(state, time.Since(started), err)
		lastErr = err
	}
	if lastErr == nil {
		lastErr = ErrMapsUnavailable
	}
	return nil, fmt.Errorf("maps optimized route unavailable: %w", lastErr)
}

func (r *MapsProviderRegistry) candidates(capability domain.MapsCapability) []*mapsProviderState {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]*mapsProviderState, 0, len(r.providers))
	now := r.now()
	for _, state := range r.providers {
		if hasCapability(state.provider, capability) && (state.openedAt.IsZero() || now.Sub(state.openedAt) >= r.circuitCooldown) {
			result = append(result, state)
		}
	}
	return result
}

func hasCapability(provider domain.MapsProviderAdapter, capability domain.MapsCapability) bool {
	for _, declared := range provider.Capabilities() {
		if declared == capability {
			return true
		}
	}
	return false
}

func (r *MapsProviderRegistry) recordSuccess(state *mapsProviderState, latency time.Duration) {
	r.mu.Lock()
	defer r.mu.Unlock()
	state.consecutiveFailures = 0
	state.lastLatency = latency
	state.lastError = ""
	state.openedAt = time.Time{}
}

func (r *MapsProviderRegistry) recordFailure(state *mapsProviderState, latency time.Duration, err error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	state.consecutiveFailures++
	state.lastLatency = latency
	state.lastError = strings.TrimSpace(err.Error())
	if state.consecutiveFailures >= r.failureThreshold {
		state.openedAt = r.now()
	}
}

func (r *MapsProviderRegistry) Diagnostics() []domain.MapsProviderHealth {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]domain.MapsProviderHealth, 0, len(r.providers))
	for _, state := range r.providers {
		health := "healthy"
		if !state.openedAt.IsZero() {
			health = "circuit_open"
		} else if state.consecutiveFailures > 0 {
			health = "degraded"
		}
		result = append(result, domain.MapsProviderHealth{
			Provider: state.provider.Name(), State: health, Capabilities: state.provider.Capabilities(),
			ConsecutiveFailures: state.consecutiveFailures, LastLatencyMS: state.lastLatency.Milliseconds(),
			LastError: state.lastError, QuotaStatus: "unknown",
		})
	}
	return result
}
