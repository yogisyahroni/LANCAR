package worker

import (
	"context"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

type SurgeWorker struct {
	redisClient *redis.Client
}

func NewSurgeWorker(client *redis.Client) *SurgeWorker {
	return &SurgeWorker{redisClient: client}
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
	now := time.Now()
	multiplier := 1.0

	// 1. Time-based surge (Rush Hour: 08:00-10:00 and 16:00-19:00)
	hour := now.Hour()
	if (hour >= 8 && hour <= 10) || (hour >= 16 && hour <= 19) {
		multiplier += 0.2
	}

	// 2. Weather-based (Simulated BMKG API call)
	// In a real system, we'd fetch JSON from BMKG and parse the weather code.
	isRaining := w.checkSimulatedWeather()
	if isRaining {
		multiplier += 0.3
		log.Println("[SurgeWorker] High demand expected due to rain.")
	}
	
	// 3. Demand-Supply Ratio (Calculated from Redis)
	// active_orders / available_couriers
	demandSupplyRatio := w.calculateDemandSupplyRatio(ctx)
	if demandSupplyRatio > 1.5 {
		multiplier += 0.25
		log.Printf("[SurgeWorker] Supply crunch detected! Ratio: %.2f", demandSupplyRatio)
	}
	
	log.Printf("Updating surge multiplier to: %.2f", multiplier)
	err := w.redisClient.Set(ctx, "surge_multiplier", multiplier, 10*time.Minute).Err()
	if err != nil {
		log.Printf("Failed to update surge multiplier: %v", err)
	}
}

func (w *SurgeWorker) checkSimulatedWeather() bool {
	// Simulate rain every hour at the 15-minute mark for testing purposes
	return time.Now().Minute() >= 15 && time.Now().Minute() <= 20
}

func (w *SurgeWorker) calculateDemandSupplyRatio(ctx context.Context) float64 {
	// In a real system, we'd use SCARD on Redis sets for active orders and online couriers
	// For this simulation, we'll return a random ratio between 0.5 and 2.0
	return 0.5 + (time.Now().Sub(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)).Hours() / 1000.0) // Just a mock stable-ish increase
}
