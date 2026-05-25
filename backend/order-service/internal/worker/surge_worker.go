package worker

import (
	"context"
	"log"
	"math"
	"time"

	"github.com/redis/go-redis/v9"
)

type SurgeWorker struct {
	redisClient *redis.Client
	dataStore   SurgeDataStore
}

func NewSurgeWorker(client *redis.Client, dataStore SurgeDataStore) *SurgeWorker {
	return &SurgeWorker{
		redisClient: client,
		dataStore:   dataStore,
	}
}

func (w *SurgeWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	log.Println("Surge worker started")

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.calculateAndSetSurge(ctx)
		}
	}
}

func (w *SurgeWorker) calculateAndSetSurge(ctx context.Context) {
	if w.redisClient == nil {
		log.Println("[SurgeWorker] Redis client is not configured; skipping surge update")
		return
	}
	if w.dataStore == nil {
		log.Println("[SurgeWorker] Surge datastore is not configured; skipping surge update")
		return
	}

	inputs, err := w.dataStore.ListZoneSurgeInputs(ctx)
	if err != nil {
		log.Printf("[SurgeWorker] Failed to load surge inputs from database: %v", err)
		return
	}
	if len(inputs) == 0 {
		log.Println("[SurgeWorker] No active zones found; clearing global surge multiplier")
		if err := w.redisClient.Del(ctx, "surge_multiplier:global").Err(); err != nil {
			log.Printf("[SurgeWorker] Failed to clear global surge multiplier: %v", err)
		}
		return
	}

	globalMultiplier := 1.0
	for _, input := range inputs {
		multiplier := calculateSurgeMultiplier(input)
		if multiplier > globalMultiplier {
			globalMultiplier = multiplier
		}

		ttl := 10 * time.Minute
		zoneIDKey := "surge_multiplier:" + input.ZoneID
		if err := w.redisClient.Set(ctx, zoneIDKey, multiplier, ttl).Err(); err != nil {
			log.Printf("[SurgeWorker] Failed to update %s: %v", zoneIDKey, err)
			continue
		}
		if input.ZoneCode != "" {
			zoneCodeKey := "surge_multiplier:" + input.ZoneCode
			if err := w.redisClient.Set(ctx, zoneCodeKey, multiplier, ttl).Err(); err != nil {
				log.Printf("[SurgeWorker] Failed to update %s: %v", zoneCodeKey, err)
			}
		}

		log.Printf(
			"[SurgeWorker] Zone %s multiplier %.2f from weather %.2f, pricing %.2f, demand %d, couriers %d",
			input.ZoneCode,
			multiplier,
			input.WeatherMultiplier,
			input.PricingMultiplier,
			input.ActiveOrders,
			input.AvailableCouriers,
		)
	}

	if err := w.redisClient.Set(ctx, "surge_multiplier:global", globalMultiplier, 10*time.Minute).Err(); err != nil {
		log.Printf("[SurgeWorker] Failed to update global surge multiplier: %v", err)
	}
}

func calculateSurgeMultiplier(input ZoneSurgeInput) float64 {
	multiplier := math.Max(input.WeatherMultiplier, input.PricingMultiplier)
	if multiplier < 1 {
		multiplier = 1
	}

	if input.AvailableCouriers == 0 {
		if input.ActiveOrders > 0 {
			multiplier += 0.25
		}
	} else if float64(input.ActiveOrders)/float64(input.AvailableCouriers) > 1.5 {
		multiplier += 0.25
	}

	if multiplier > 2.5 {
		return 2.5
	}
	return multiplier
}
