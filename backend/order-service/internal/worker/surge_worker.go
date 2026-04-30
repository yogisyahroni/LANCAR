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

	// 2. Weather-based (Mock for now, should call BMKG API)
	// Example: multiplier += 0.3 if raining
	
	// 3. Demand-Supply (Mock for now)
	
	log.Printf("Updating surge multiplier to: %.2f", multiplier)
	err := w.redisClient.Set(ctx, "surge_multiplier", multiplier, 10*time.Minute).Err()
	if err != nil {
		log.Printf("Failed to update surge multiplier: %v", err)
	}
}
