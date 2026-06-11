package domain

import (
	"context"
	"encoding/json"
)

type SystemConfig struct {
	Key         string          `db:"key"`
	Value       json.RawMessage `db:"value"`
	Description *string         `db:"description"`
	Category    *string         `db:"category"`
}

type ConfigRepository interface {
	GetConfig(ctx context.Context, key string) (*SystemConfig, error)
	GetFloatConfig(ctx context.Context, key string, fallback float64) float64
	GetIntConfig(ctx context.Context, key string, fallback int) int
}
