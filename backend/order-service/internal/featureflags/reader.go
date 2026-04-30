package featureflags

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
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
	if val, ok := f.localCache.Load(key); ok {
		return val.(*FeatureFlag), nil
	}

	cacheKey := fmt.Sprintf("flag:%s", key)

	if f.redis != nil {
		cached, err := f.redis.Get(ctx, cacheKey).Result()
		if err == nil && cached != "" {
			var flag FeatureFlag
			if err := json.Unmarshal([]byte(cached), &flag); err == nil {
				f.localCache.Store(key, &flag)
				return &flag, nil
			}
		}
	}

	var flag FeatureFlag
	var configData []byte
	err := f.readDB.QueryRowContext(ctx,
		`SELECT id, key, is_enabled, config, require_checklist FROM feature_flags WHERE key = $1`,
		key,
	).Scan(&flag.ID, &flag.Key, &flag.IsEnabled, &configData, &flag.RequireChecklist)

	if err != nil {
		return nil, fmt.Errorf("failed to get flag %s from DB: %w", key, err)
	}

	if len(configData) > 0 {
		json.Unmarshal(configData, &flag.Config)
	} else {
		flag.Config = make(map[string]interface{})
	}

	if f.redis != nil {
		if data, err := json.Marshal(flag); err == nil {
			f.redis.Set(ctx, cacheKey, data, flagCacheTTL)
		}
	}
	f.localCache.Store(key, &flag)

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

func (f *flagReaderImpl) InvalidateCache(ctx context.Context, key string) error {
	if f.redis == nil {
		return nil
	}
	cacheKey := fmt.Sprintf("flag:%s", key)
	return f.redis.Del(ctx, cacheKey).Err()
}
