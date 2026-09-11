package service

import (
	"context"
	"errors"
	"sync"

	"tembus/ads-service/internal/domain"
)

var ErrBudgetExhausted = errors.New("campaign budget exhausted")

type SpendRepository interface {
	ReserveSpend(ctx context.Context, event domain.AdEvent) (charged bool, err error)
	ReleaseSpend(ctx context.Context, eventID, reason string) error
}

type BudgetService struct{ repo SpendRepository }

func NewBudgetService(repo SpendRepository) *BudgetService { return &BudgetService{repo: repo} }

func (s *BudgetService) Charge(ctx context.Context, event domain.AdEvent) (bool, error) {
	if event.CostMinor < 0 {
		return false, errors.New("negative ad cost")
	}
	return s.repo.ReserveSpend(ctx, event)
}

type MemoryBudget struct {
	mu    sync.Mutex
	Limit int64
	Spent int64
	seen  map[string]int64
}

func NewMemoryBudget(limit int64) *MemoryBudget {
	return &MemoryBudget{Limit: limit, seen: map[string]int64{}}
}

func (m *MemoryBudget) ReserveSpend(_ context.Context, event domain.AdEvent) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.seen[event.IdempotencyKey]; ok {
		return false, nil
	}
	if m.Spent+event.CostMinor > m.Limit {
		return false, ErrBudgetExhausted
	}
	m.Spent += event.CostMinor
	m.seen[event.IdempotencyKey] = event.CostMinor
	return true, nil
}

func (m *MemoryBudget) ReleaseSpend(_ context.Context, eventID, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if cost, ok := m.seen[eventID]; ok {
		m.Spent -= cost
		if m.Spent < 0 {
			m.Spent = 0
		}
	}
	delete(m.seen, eventID)
	return nil
}
