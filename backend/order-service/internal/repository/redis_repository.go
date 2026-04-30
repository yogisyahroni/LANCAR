package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"lancar/order-service/internal/domain"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

type redisRepo struct {
	client *redis.Client
}

func NewRedisRepository(client *redis.Client) domain.RedisRepository {
	return &redisRepo{client: client}
}

func (r *redisRepo) SaveEstimate(ctx context.Context, estimate *domain.PricingEstimateResponse) error {
	data, err := json.Marshal(estimate)
	if err != nil {
		return err
	}

	key := fmt.Sprintf("estimate:%s", estimate.EstimateID)
	return r.client.Set(ctx, key, data, 10*time.Minute).Err()
}

func (r *redisRepo) GetEstimate(ctx context.Context, estimateID string) (*domain.PricingEstimateResponse, error) {
	key := fmt.Sprintf("estimate:%s", estimateID)
	data, err := r.client.Get(ctx, key).Result()
	if err != nil {
		return nil, err
	}

	estimate := &domain.PricingEstimateResponse{}
	if err := json.Unmarshal([]byte(data), estimate); err != nil {
		return nil, err
	}

	return estimate, nil
}

func (r *redisRepo) GetMultiplier(ctx context.Context) (float64, error) {
	val, err := r.client.Get(ctx, "surge_multiplier").Result()
	if err == redis.Nil {
		return 1.0, nil
	}
	if err != nil {
		return 1.0, err
	}

	multiplier, err := strconv.ParseFloat(val, 64)
	if err != nil {
		return 1.0, nil
	}

	return multiplier, nil
}

func (r *redisRepo) UpdateCourierLocation(ctx context.Context, courierID string, lat, lng float64) error {
	return r.client.GeoAdd(ctx, "courier_locations", &redis.GeoLocation{
		Name:      courierID,
		Latitude:  lat,
		Longitude: lng,
	}).Err()
}

func (r *redisRepo) FindNearbyCouriers(ctx context.Context, lat, lng float64, radiusKM float64) ([]string, error) {
	return r.client.GeoSearch(ctx, "courier_locations", &redis.GeoSearchQuery{
		Longitude:  lng,
		Latitude:   lat,
		Radius:     radiusKM,
		RadiusUnit: "km",
	}).Result()
}

func (r *redisRepo) AcquireLock(ctx context.Context, key string, expiration time.Duration) (bool, error) {
	return r.client.SetNX(ctx, "lock:"+key, "locked", expiration).Result()
}

func (r *redisRepo) ReleaseLock(ctx context.Context, key string) error {
	return r.client.Del(ctx, "lock:"+key).Err()
}
