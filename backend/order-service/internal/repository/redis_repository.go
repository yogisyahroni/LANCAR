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
