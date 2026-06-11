package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
	"tembus/order-service/internal/domain"
)

type PostgresConfigRepo struct {
	primaryDB *sqlx.DB
	replicaDB *sqlx.DB

	// Simple in-memory cache to avoid hammering the DB for frequently read configs
	cache      map[string]*configCacheEntry
	cacheMutex sync.RWMutex
	cacheTTL   time.Duration
}

type configCacheEntry struct {
	Value     *domain.SystemConfig
	ExpiresAt time.Time
}

func NewPostgresConfigRepo(primaryDB *sqlx.DB, replicaDB *sqlx.DB) *PostgresConfigRepo {
	return &PostgresConfigRepo{
		primaryDB: primaryDB,
		replicaDB: replicaDB,
		cache:     make(map[string]*configCacheEntry),
		cacheTTL:  5 * time.Minute, // 5 minutes TTL
	}
}

func (r *PostgresConfigRepo) GetConfig(ctx context.Context, key string) (*domain.SystemConfig, error) {
	// Check cache
	r.cacheMutex.RLock()
	entry, exists := r.cache[key]
	r.cacheMutex.RUnlock()

	if exists && time.Now().Before(entry.ExpiresAt) {
		return entry.Value, nil
	}

	query := `SELECT key, value, description, category FROM system_configs WHERE key = $1`
	var config domain.SystemConfig
	err := r.replicaDB.GetContext(ctx, &config, query, key)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil // not found
		}
		return nil, err
	}

	// Save to cache
	r.cacheMutex.Lock()
	r.cache[key] = &configCacheEntry{
		Value:     &config,
		ExpiresAt: time.Now().Add(r.cacheTTL),
	}
	r.cacheMutex.Unlock()

	return &config, nil
}

func (r *PostgresConfigRepo) GetFloatConfig(ctx context.Context, key string, fallback float64) float64 {
	config, err := r.GetConfig(ctx, key)
	if err != nil || config == nil {
		return fallback
	}

	var floatVal float64
	if err := json.Unmarshal(config.Value, &floatVal); err != nil {
		return fallback
	}
	return floatVal
}

func (r *PostgresConfigRepo) GetIntConfig(ctx context.Context, key string, fallback int) int {
	config, err := r.GetConfig(ctx, key)
	if err != nil || config == nil {
		return fallback
	}

	var intVal int
	if err := json.Unmarshal(config.Value, &intVal); err != nil {
		return fallback
	}
	return intVal
}
