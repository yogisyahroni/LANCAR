package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/redis/go-redis/v9"
	"log"
	"math"
	"tembus/order-service/internal/domain"
	"time"
)

type SurgeWorker struct {
	redisClient *redis.Client
	dataStore   SurgeDataStore
	configRepo  domain.ConfigRepository
}

func NewSurgeWorker(client *redis.Client, dataStore SurgeDataStore, configRepo domain.ConfigRepository) *SurgeWorker {
	return &SurgeWorker{
		redisClient: client,
		dataStore:   dataStore,
		configRepo:  configRepo,
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
	zoneMultipliers := make(map[string]float64, len(inputs))
	zoneCodes := make(map[string]string, len(inputs))
	for _, input := range inputs {
		multiplier := w.calculateSurgeMultiplier(ctx, input)
		if multiplier > globalMultiplier {
			globalMultiplier = multiplier
		}
		if multiplier > zoneMultipliers[input.ZoneID] {
			zoneMultipliers[input.ZoneID] = multiplier
			zoneCodes[input.ZoneID] = input.ZoneCode
		}

		if err := w.persistMetricsSnapshot(ctx, input, multiplier); err != nil {
			log.Printf("[SurgeWorker] Failed to persist marketplace metrics for zone %s/service %s: %v", input.ZoneCode, input.ServiceCode, err)
		}

		log.Printf(
			"[SurgeWorker] Zone %s service %s multiplier %.2f weather %.2f pricing %.2f demand_window %d active %d available %d acceptance %.1f%% match %.0fs no_supply %d idle %.1fmin eta %.1fmin fresh=%t age=%ds",
			input.ZoneCode,
			input.ServiceCode,
			multiplier,
			input.WeatherMultiplier,
			input.PricingMultiplier,
			input.DemandOrders,
			input.ActiveOrders,
			input.AvailableCouriers,
			input.AcceptanceRatePct,
			input.AverageMatchTimeSecs,
			input.NoSupplyOrders,
			input.AverageIdleTimeMinutes,
			input.AverageETAMinutes,
			input.DataFresh,
			input.EventAgeSeconds,
		)
	}
	for zoneID, multiplier := range zoneMultipliers {
		ttl := 10 * time.Minute
		zoneIDKey := "surge_multiplier:" + zoneID
		if err := w.redisClient.Set(ctx, zoneIDKey, multiplier, ttl).Err(); err != nil {
			log.Printf("[SurgeWorker] Failed to update %s: %v", zoneIDKey, err)
			continue
		}
		if zoneCodes[zoneID] != "" {
			zoneCodeKey := "surge_multiplier:" + zoneCodes[zoneID]
			if err := w.redisClient.Set(ctx, zoneCodeKey, multiplier, ttl).Err(); err != nil {
				log.Printf("[SurgeWorker] Failed to update %s: %v", zoneCodeKey, err)
			}
		}
	}

	if err := w.redisClient.Set(ctx, "surge_multiplier:global", globalMultiplier, 10*time.Minute).Err(); err != nil {
		log.Printf("[SurgeWorker] Failed to update global surge multiplier: %v", err)
	}
}

func (w *SurgeWorker) persistMetricsSnapshot(ctx context.Context, input ZoneSurgeInput, multiplier float64) error {
	// Keep provider/config pricing separate from the derived surge value so
	// dashboards can explain which source contributed to the final multiplier.
	input.SurgeMultiplier = multiplier
	data, err := json.Marshal(input)
	if err != nil {
		return err
	}
	serviceCode := input.ServiceCode
	if serviceCode == "" {
		serviceCode = "unknown"
	}
	key := fmt.Sprintf("marketplace_metrics:%s:%s", input.ZoneID, serviceCode)
	return w.redisClient.Set(ctx, key, data, 10*time.Minute).Err()
}

func (w *SurgeWorker) calculateSurgeMultiplier(ctx context.Context, input ZoneSurgeInput) float64 {
	step := 0.25
	ratioThreshold := 1.5
	maxMultiplier := 2.5

	if w.configRepo != nil {
		step = w.configRepo.GetFloatConfig(ctx, "surge_demand_multiplier_step", 0.25)
		ratioThreshold = w.configRepo.GetFloatConfig(ctx, "surge_demand_ratio_threshold", 1.5)
		maxMultiplier = w.configRepo.GetFloatConfig(ctx, "surge_max_multiplier", 2.5)
	}

	multiplier := math.Max(input.WeatherMultiplier, input.PricingMultiplier)
	if multiplier < 1 {
		multiplier = 1
	}

	// Stale event data is visible in the metrics snapshot but can never add a
	// demand-based price step. Existing weather/provider multipliers remain
	// bounded by the configured ceiling and are not silently attributed to
	// stale marketplace demand.
	if !input.DataFresh {
		return boundedMultiplier(multiplier, maxMultiplier)
	}

	if input.AvailableCouriers == 0 {
		if input.ActiveOrders > 0 {
			multiplier += step
		}
	} else if float64(input.ActiveOrders)/float64(input.AvailableCouriers) > ratioThreshold {
		multiplier += step
	}

	return boundedMultiplier(multiplier, maxMultiplier)
}

func boundedMultiplier(multiplier, maxMultiplier float64) float64 {
	if maxMultiplier < 1 {
		maxMultiplier = 1
	}
	if multiplier > maxMultiplier {
		return maxMultiplier
	}
	return multiplier
}
