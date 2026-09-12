package service

import (
	"fmt"
	"sync"
	"time"

	"tembus/payment-service/internal/domain"
	"tembus/payment-service/internal/provider"
)

type ProviderHealthState string

const (
	ProviderHealthy  ProviderHealthState = "healthy"
	ProviderDegraded ProviderHealthState = "degraded"
	ProviderDisabled ProviderHealthState = "disabled"
)

type ProviderHealth struct {
	Provider  string
	State     ProviderHealthState
	Reason    string
	UpdatedAt time.Time
	AllowNew  bool
}

type ProviderCandidate struct {
	Provider string
	Priority int
}

type RoutingContext struct {
	MarketCode    string
	Currency      string
	PaymentMethod string
	Capability    provider.Capability
	RuleVersion   string
}

type RoutingOverride struct {
	Provider   string
	MarketCode string
	Method     string
	Reason     string
	ExpiresAt  time.Time
	ActorID    string
}

type ProviderRouter struct {
	registry  *provider.Registry
	mu        sync.RWMutex
	health    map[string]ProviderHealth
	overrides []RoutingOverride
	audit     func(RoutingOverride)
}

func NewProviderRouter(registry *provider.Registry, audit func(RoutingOverride)) *ProviderRouter {
	return &ProviderRouter{registry: registry, health: make(map[string]ProviderHealth), audit: audit}
}

func (r *ProviderRouter) SetHealth(name string, state ProviderHealthState, reason string, allowNew bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.health[name] = ProviderHealth{Provider: name, State: state, Reason: reason, UpdatedAt: time.Now().UTC(), AllowNew: allowNew}
}

func (r *ProviderRouter) Health() []ProviderHealth {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]ProviderHealth, 0, len(r.health))
	for _, health := range r.health {
		result = append(result, health)
	}
	return result
}

func (r *ProviderRouter) SetOverride(override RoutingOverride) error {
	if override.Provider == "" || override.MarketCode == "" || override.Reason == "" || override.ActorID == "" || override.ExpiresAt.Before(time.Now().UTC()) {
		return fmt.Errorf("provider routing override requires provider, market, reason, actor and future expiry")
	}
	if _, ok := r.registry.Get(override.Provider); !ok {
		return fmt.Errorf("provider %q is not registered", override.Provider)
	}
	r.mu.Lock()
	r.overrides = append(r.overrides, override)
	r.mu.Unlock()
	if r.audit != nil {
		r.audit(override)
	}
	return nil
}

func (r *ProviderRouter) Route(ctx RoutingContext, candidates []ProviderCandidate) (provider.Adapter, string, error) {
	if ctx.RuleVersion == "" {
		return nil, "", fmt.Errorf("routing rule version is required")
	}
	now := time.Now().UTC()
	r.mu.RLock()
	var override *RoutingOverride
	for i := range r.overrides {
		candidate := r.overrides[i]
		if candidate.MarketCode == ctx.MarketCode && (candidate.Method == "" || candidate.Method == ctx.PaymentMethod) && candidate.ExpiresAt.After(now) {
			copy := candidate
			override = &copy
		}
	}
	r.mu.RUnlock()
	ordered := candidates
	if override != nil {
		ordered = append([]ProviderCandidate{{Provider: override.Provider, Priority: -1}}, candidates...)
	}
	for _, candidate := range ordered {
		adapter, ok := r.registry.Get(candidate.Provider)
		if !ok || !provider.Supports(adapter, ctx.Capability) {
			continue
		}
		r.mu.RLock()
		health, seen := r.health[candidate.Provider]
		r.mu.RUnlock()
		if seen && (!health.AllowNew || health.State == ProviderDisabled) {
			continue
		}
		return adapter, ctx.RuleVersion, nil
	}
	return nil, ctx.RuleVersion, fmt.Errorf("no healthy provider supports %s/%s", ctx.Currency, ctx.PaymentMethod)
}

// CanFailover enforces the financial safety boundary: after an irreversible
// provider mutation, another provider may be selected only after an intent
// lookup proves the first attempt did not succeed.
func CanFailover(intent *domain.PaymentIntent, irreversibleMutation bool, lookupProvesNoCharge bool) bool {
	if intent == nil {
		return false
	}
	return !irreversibleMutation || lookupProvesNoCharge
}
