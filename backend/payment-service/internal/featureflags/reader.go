package featureflags

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
)

// FeatureFlag represents the DB model for feature_flags
type FeatureFlag struct {
	ID               string                 `json:"id"`
	Key              string                 `json:"key"`
	IsEnabled        bool                   `json:"is_enabled"`
	Config           map[string]interface{} `json:"config"`
	RequireChecklist bool                   `json:"require_checklist"`
}

// FlagReader is the interface for fetching flags
type FlagReader interface {
	GetFlag(ctx context.Context, key string) (*FeatureFlag, error)
	GetFlags(ctx context.Context, keys []string) (map[string]*FeatureFlag, error)
	Close() error
}

type flagReaderImpl struct {
	readDB *sql.DB
}

// NewFlagReader creates a new instance of FlagReader
func NewFlagReader(readDB *sql.DB) FlagReader {
	return &flagReaderImpl{
		readDB: readDB,
	}
}

func (f *flagReaderImpl) Close() error {
	return nil
}

func (f *flagReaderImpl) GetFlag(ctx context.Context, key string) (*FeatureFlag, error) {
	// We query DB directly to ensure freshness since we don't have Redis pub/sub.
	var flag FeatureFlag
	var configData []byte
	err := f.readDB.QueryRowContext(ctx,
		`SELECT id, key, is_enabled, config, require_checklist FROM feature_flags WHERE key = $1`,
		key,
	).Scan(&flag.ID, &flag.Key, &flag.IsEnabled, &configData, &flag.RequireChecklist)

	if err != nil {
		log.Printf("[FlagReader] DB error for key %s: %v.", key, err)
		return nil, fmt.Errorf("failed to get flag %s from DB: %w", key, err)
	}

	if len(configData) > 0 {
		_ = json.Unmarshal(configData, &flag.Config)
	} else {
		flag.Config = make(map[string]interface{})
	}

	return &flag, nil
}

func (f *flagReaderImpl) GetFlags(ctx context.Context, keys []string) (map[string]*FeatureFlag, error) {
	result := make(map[string]*FeatureFlag)
	if len(keys) == 1 {
		flag, err := f.GetFlag(ctx, keys[0])
		if err != nil {
			return nil, err
		}
		result[keys[0]] = flag
		return result, nil
	}

	type flagResult struct {
		key  string
		flag *FeatureFlag
		err  error
	}

	resCh := make(chan flagResult, len(keys))

	for _, k := range keys {
		go func(key string) {
			flag, err := f.GetFlag(ctx, key)
			resCh <- flagResult{key: key, flag: flag, err: err}
		}(k)
	}

	for i := 0; i < len(keys); i++ {
		res := <-resCh
		if res.err != nil {
			return nil, res.err
		}
		result[res.key] = res.flag
	}

	return result, nil
}
