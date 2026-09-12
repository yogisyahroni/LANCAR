package provider

import (
	"fmt"
	"sync"
)

type Registry struct {
	mu       sync.RWMutex
	adapters map[string]Adapter
}

func NewRegistry(adapters ...Adapter) *Registry {
	r := &Registry{adapters: make(map[string]Adapter)}
	for _, adapter := range adapters {
		if adapter != nil {
			_ = r.Register(adapter)
		}
	}
	return r
}

func (r *Registry) Register(adapter Adapter) error {
	if adapter == nil || adapter.Name() == "" {
		return fmt.Errorf("provider adapter and name are required")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.adapters[adapter.Name()]; exists {
		return fmt.Errorf("provider adapter %q already registered", adapter.Name())
	}
	r.adapters[adapter.Name()] = adapter
	return nil
}

func (r *Registry) Get(name string) (Adapter, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	adapter, ok := r.adapters[name]
	return adapter, ok
}

func Supports(adapter Adapter, capability Capability) bool {
	return adapter != nil && adapter.Capabilities()[capability]
}
