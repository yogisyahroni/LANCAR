package featureflags

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestFlagReader_GetFlag_CacheHit(t *testing.T) {
	s, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer s.Close()

	rdb := redis.NewClient(&redis.Options{Addr: s.Addr()})

	db, _, err := sqlmock.New()
	if err != nil {
		t.Fatalf("an error '%s' was not expected when opening a stub database connection", err)
	}
	defer db.Close()

	reader := NewFlagReader(db, db, rdb)
	defer reader.Close()

	ctx := context.Background()
	key := "test_flag_1"

	// Setup Redis directly
	flagData := FeatureFlag{
		ID:               "1",
		Key:              key,
		IsEnabled:        true,
		Config:           map[string]interface{}{"setting": "value"},
		RequireChecklist: false,
	}
	flagBytes, _ := json.Marshal(flagData)
	err = rdb.Set(ctx, "flag:"+key, flagBytes, time.Minute).Err()
	if err != nil {
		t.Fatalf("failed to set redis key: %v", err)
	}

	// This should hit Redis and NOT the DB. If it hits the DB, sqlmock will throw an error since no expectations are set.
	result, err := reader.GetFlag(ctx, key)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if result.Key != key {
		t.Errorf("expected key %s, got %s", key, result.Key)
	}
	if !result.IsEnabled {
		t.Errorf("expected IsEnabled true, got false")
	}
}

func TestFlagReader_GetFlag_CacheMiss_Then_Hit(t *testing.T) {
	s, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer s.Close()

	rdb := redis.NewClient(&redis.Options{Addr: s.Addr()})

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("an error '%s' was not expected when opening a stub database connection", err)
	}
	defer db.Close()

	reader := NewFlagReader(db, db, rdb)
	defer reader.Close()

	ctx := context.Background()
	key := "test_flag_2"

	configJSON := `{"max_distance_km": 25}`
	mock.ExpectQuery(`SELECT id, key, is_enabled, config, require_checklist FROM feature_flags WHERE key = \$1`).
		WithArgs(key).
		WillReturnRows(sqlmock.NewRows([]string{"id", "key", "is_enabled", "config", "require_checklist"}).
			AddRow("2", key, true, []byte(configJSON), true))

	// First call should hit the DB and save to Redis
	result1, err := reader.GetFlag(ctx, key)
	if err != nil {
		t.Fatalf("expected no error on first call, got %v", err)
	}
	if result1.Key != key || !result1.IsEnabled {
		t.Errorf("unexpected result1: %+v", result1)
	}

	// Wait a moment for async local cache updates/operations (though GetFlag returns immediately, it writes to local cache)
	// Second call should hit the local cache or Redis, DB is NOT expected to be called again.
	result2, err := reader.GetFlag(ctx, key)
	if err != nil {
		t.Fatalf("expected no error on second call, got %v", err)
	}
	if result2.Key != key {
		t.Errorf("unexpected result2: %+v", result2)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("there were unfulfilled expectations: %s", err)
	}
}

func TestFlagReader_GetFlag_RedisDown_DBFallback(t *testing.T) {
	// Don't start redis to simulate it being down, or start then close it.
	s, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	
	rdb := redis.NewClient(&redis.Options{Addr: s.Addr()})
	s.Close() // close it immediately to simulate Redis down

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("an error '%s' was not expected when opening a stub database connection", err)
	}
	defer db.Close()

	reader := NewFlagReader(db, db, rdb)
	defer reader.Close()

	ctx := context.Background()
	key := "test_flag_3"

	mock.ExpectQuery(`SELECT id, key, is_enabled, config, require_checklist FROM feature_flags WHERE key = \$1`).
		WithArgs(key).
		WillReturnRows(sqlmock.NewRows([]string{"id", "key", "is_enabled", "config", "require_checklist"}).
			AddRow("3", key, false, nil, false))

	// Call should fallback to DB gracefully despite Redis connection failure
	result, err := reader.GetFlag(ctx, key)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result.Key != key || result.IsEnabled {
		t.Errorf("unexpected result: %+v", result)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("there were unfulfilled expectations: %s", err)
	}
}

func TestFlagReader_InvalidateCache_And_PubSub(t *testing.T) {
	s, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer s.Close()

	rdb := redis.NewClient(&redis.Options{Addr: s.Addr()})

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("an error '%s' was not expected when opening a stub database connection", err)
	}
	defer db.Close()

	reader := NewFlagReader(db, db, rdb)
	defer reader.Close()

	ctx := context.Background()
	key := "test_flag_4"

	// Mock DB response
	mock.ExpectQuery(`SELECT id, key, is_enabled, config, require_checklist FROM feature_flags WHERE key = \$1`).
		WithArgs(key).
		WillReturnRows(sqlmock.NewRows([]string{"id", "key", "is_enabled", "config", "require_checklist"}).
			AddRow("4", key, true, nil, false))

	// First call to populate cache
	_, err = reader.GetFlag(ctx, key)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	// Verify it's in Redis
	val, err := rdb.Get(ctx, "flag:"+key).Result()
	if err != nil || val == "" {
		t.Fatalf("expected flag in redis, got err: %v", err)
	}

	// Wait for pubsub goroutine to start
	time.Sleep(100 * time.Millisecond)

	// Simulate external system sending invalidation pubsub event
	payload := `{"key":"test_flag_4"}`
	err = rdb.Publish(ctx, "flag:changed", payload).Err()
	if err != nil {
		t.Fatalf("failed to publish: %v", err)
	}

	// Wait for pubsub message to be processed and local cache cleared
	time.Sleep(200 * time.Millisecond)

	// Invalidate cache explicitly to clear Redis
	err = reader.InvalidateCache(ctx, key)
	if err != nil {
		t.Fatalf("expected no error on invalidate, got %v", err)
	}

	// Check that redis key is gone
	_, err = rdb.Get(ctx, "flag:"+key).Result()
	if err == nil {
		t.Fatalf("expected redis key to be deleted")
	}

	// Because local cache and Redis are cleared, the next GetFlag should hit DB again.
	mock.ExpectQuery(`SELECT id, key, is_enabled, config, require_checklist FROM feature_flags WHERE key = \$1`).
		WithArgs(key).
		WillReturnRows(sqlmock.NewRows([]string{"id", "key", "is_enabled", "config", "require_checklist"}).
			AddRow("4", key, false, nil, false))

	result, err := reader.GetFlag(ctx, key)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result.IsEnabled { // DB now says false
		t.Errorf("expected IsEnabled false, got %v", result.IsEnabled)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("there were unfulfilled expectations: %s", err)
	}
}
