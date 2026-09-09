package featureflags

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// FeatureFlag represents the DB model for feature_flags
type FeatureFlag struct {
	ID               string                 `json:"id"`
	Key              string                 `json:"key"`
	IsEnabled        bool                   `json:"is_enabled"`
	Config           map[string]interface{} `json:"config"`
	RequireChecklist bool                   `json:"require_checklist"`
}

// FlagReader is the interface defined in PRD for fetching flags
type FlagReader interface {
	GetFlag(ctx context.Context, key string) (*FeatureFlag, error)
	GetFlags(ctx context.Context, keys []string) (map[string]*FeatureFlag, error)
	IsFeatureFlagEnabled(ctx context.Context, key string, defaultVal bool) (bool, error)
	IsKillSwitchActive(ctx context.Context, switchType, serviceCode, marketCode, cityCode, zoneCode string) (bool, error)
	InvalidateCache(ctx context.Context, key string) error
	Close() error
}

type flagReaderImpl struct {
	db         *sql.DB
	readDB     *sql.DB
	redis      *redis.Client
	localCache sync.Map
	cancel     context.CancelFunc
	wg         sync.WaitGroup
}

const flagCacheTTL = 60 * time.Second

// NewFlagReader creates a new instance of FlagReader
func NewFlagReader(db *sql.DB, readDB *sql.DB, rdb *redis.Client) FlagReader {
	ctx, cancel := context.WithCancel(context.Background())
	reader := &flagReaderImpl{
		db:     db,
		readDB: readDB,
		redis:  rdb,
		cancel: cancel,
	}
	if rdb != nil {
		reader.wg.Add(1)
		go reader.subscribeToInvalidations(ctx)
	}
	return reader
}

func (f *flagReaderImpl) subscribeToInvalidations(ctx context.Context) {
	defer f.wg.Done()
	pubsub := f.redis.Subscribe(ctx, "flag:changed")
	defer pubsub.Close()

	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			var payload struct {
				Key string `json:"key"`
			}
			if err := json.Unmarshal([]byte(msg.Payload), &payload); err == nil {
				f.localCache.Delete(payload.Key)
			}
		}
	}
}

func (f *flagReaderImpl) Close() error {
	if f.cancel != nil {
		f.cancel()
	}
	f.wg.Wait()
	return nil
}

func (f *flagReaderImpl) GetFlag(ctx context.Context, key string) (*FeatureFlag, error) {
	// 0. Try local in-memory cache (L1 - Fastest)
	if val, ok := f.localCache.Load(key); ok {
		return val.(*FeatureFlag), nil
	}

	cacheKey := fmt.Sprintf("flag:%s", key)

	// 1. Try Redis cache (L2)
	if f.redis != nil {
		cached, err := f.redis.Get(ctx, cacheKey).Result()
		if err == nil && cached != "" {
			var flag FeatureFlag
			if err := json.Unmarshal([]byte(cached), &flag); err == nil {
				f.localCache.Store(key, &flag)
				return &flag, nil
			}
		}
		// If Redis is down (not just a cache miss), log and proceed to DB
		if err != nil && err != redis.Nil {
			log.Printf("[FlagReader] Redis error for key %s: %v. Falling back to DB.", key, err)
		}
	}

	// 2. Cache miss or Redis error -> query DB (L3)
	var flag FeatureFlag
	var configData []byte
	err := f.readDB.QueryRowContext(ctx,
		`SELECT id, key, is_enabled, config, require_checklist FROM feature_flags WHERE key = $1`,
		key,
	).Scan(&flag.ID, &flag.Key, &flag.IsEnabled, &configData, &flag.RequireChecklist)

	if err != nil {
		// 3. DB Unavailable: Return specific error for graceful degradation if needed.
		// If it was in local cache, it would've returned at step 0.
		log.Printf("[FlagReader] CRITICAL: DB error for key %s: %v. No cached value available.", key, err)
		return nil, fmt.Errorf("failed to get flag %s from DB: %w", key, err)
	}

	if len(configData) > 0 {
		_ = json.Unmarshal(configData, &flag.Config)
	} else {
		flag.Config = make(map[string]interface{})
	}

	// 4. Update caches
	if f.redis != nil {
		if data, err := json.Marshal(flag); err == nil {
			f.redis.Set(ctx, cacheKey, data, flagCacheTTL)
		}
	}
	f.localCache.Store(key, &flag)

	return &flag, nil
}

func (r *flagReaderImpl) IsFeatureFlagEnabled(ctx context.Context, key string, defaultVal bool) (bool, error) {
	flag, err := r.GetFlag(ctx, key)
	if err != nil || flag == nil {
		return defaultVal, err
	}
	return flag.IsEnabled, nil
}

// IsKillSwitchActive reads the typed operational controls stored in the
// canonical feature_flags table. Presentation hiding is intentionally not
// consulted here; only transactional gates can prevent a new order. A
// database error is returned so callers can fail closed instead of allowing a
// request when the control plane cannot be verified.
func (f *flagReaderImpl) IsKillSwitchActive(ctx context.Context, switchType, serviceCode, marketCode, cityCode, zoneCode string) (bool, error) {
	rows, err := f.readDB.QueryContext(ctx, `
		SELECT is_enabled, config
		  FROM feature_flags
		 WHERE category = 'experience_kill_switch'
		   AND config->>'control_plane' = 'experience'
		   AND config->>'kill_switch_type' = $1`, switchType)
	if err != nil {
		return false, fmt.Errorf("read experience kill switch: %w", err)
	}
	defer rows.Close()

	now := time.Now()
	for rows.Next() {
		var enabled bool
		var raw []byte
		if scanErr := rows.Scan(&enabled, &raw); scanErr != nil {
			return false, fmt.Errorf("scan experience kill switch: %w", scanErr)
		}
		if !enabled {
			continue
		}
		var config map[string]interface{}
		if len(raw) == 0 || json.Unmarshal(raw, &config) != nil {
			continue
		}
		if !matchesScopedValue(config, "service_code", "service_codes", serviceCode) ||
			!matchesScopedValue(config, "market_code", "market_codes", marketCode) ||
			!matchesScopedValue(config, "city_code", "city_codes", cityCode) ||
			!matchesScopedValue(config, "zone_code", "zone_codes", zoneCode) {
			continue
		}
		if value, ok := config["starts_at"].(string); ok {
			startsAt, parseErr := time.Parse(time.RFC3339, value)
			if parseErr == nil && now.Before(startsAt) {
				continue
			}
		}
		if value, ok := config["expires_at"].(string); ok {
			expiresAt, parseErr := time.Parse(time.RFC3339, value)
			if parseErr == nil && !now.Before(expiresAt) {
				continue
			}
		}
		return true, nil
	}
	if err := rows.Err(); err != nil {
		return false, fmt.Errorf("iterate experience kill switches: %w", err)
	}
	return false, nil
}

func matchesScopedValue(config map[string]interface{}, singularKey, pluralKey, actual string) bool {
	actual = strings.ToLower(strings.TrimSpace(actual))
	raw, exists := config[pluralKey]
	if !exists {
		raw, exists = config[singularKey]
	}
	if !exists || raw == nil {
		return true
	}
	values := make([]string, 0)
	switch typed := raw.(type) {
	case []interface{}:
		for _, value := range typed {
			if text, ok := value.(string); ok {
				values = append(values, strings.ToLower(strings.TrimSpace(text)))
			}
		}
	case string:
		values = append(values, strings.ToLower(strings.TrimSpace(typed)))
	}
	if len(values) == 0 {
		return true
	}
	if actual == "" {
		return false
	}
	for _, value := range values {
		if value == "*" || value == actual {
			return true
		}
	}
	return false
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

func (f *flagReaderImpl) InvalidateCache(ctx context.Context, key string) error {
	if f.redis == nil {
		return nil
	}
	cacheKey := fmt.Sprintf("flag:%s", key)
	return f.redis.Del(ctx, cacheKey).Err()
}
