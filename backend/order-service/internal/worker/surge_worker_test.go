package worker

import (
	"context"
	"tembus/order-service/internal/domain"
	"testing"
)

type surgeGuardrailConfigStub struct{ domain.ConfigRepository }

func (surgeGuardrailConfigStub) GetFloatConfig(_ context.Context, key string, fallback float64) float64 {
	if key == "surge_max_multiplier" {
		return 1.4
	}
	return fallback
}

func TestCalculateSurgeMultiplierRequiresFreshMarketplaceDemand(t *testing.T) {
	worker := &SurgeWorker{}
	stale := ZoneSurgeInput{
		WeatherMultiplier: 1,
		PricingMultiplier: 1,
		ActiveOrders:      20,
		AvailableCouriers: 0,
		DataFresh:         false,
	}
	if got := worker.calculateSurgeMultiplier(context.Background(), stale); got != 1 {
		t.Fatalf("stale demand raised multiplier to %.2f", got)
	}
}

func TestCalculateSurgeMultiplierUsesFreshSupplyDemandRatio(t *testing.T) {
	worker := &SurgeWorker{}
	fresh := ZoneSurgeInput{
		WeatherMultiplier: 1,
		PricingMultiplier: 1,
		ActiveOrders:      4,
		AvailableCouriers: 2,
		DataFresh:         true,
	}
	if got := worker.calculateSurgeMultiplier(context.Background(), fresh); got != 1.25 {
		t.Fatalf("fresh demand/supply ratio multiplier = %.2f, want 1.25", got)
	}
}

func TestCalculateSurgeMultiplierEnforcesConfiguredCapUnderPeakLoad(t *testing.T) {
	worker := &SurgeWorker{configRepo: surgeGuardrailConfigStub{}}
	peak := ZoneSurgeInput{
		WeatherMultiplier: 1.4,
		PricingMultiplier: 1.35,
		ActiveOrders:      10000,
		AvailableCouriers: 0,
		DataFresh:         true,
	}
	if got := worker.calculateSurgeMultiplier(context.Background(), peak); got != 1.4 {
		t.Fatalf("peak surge exceeded configured protected cap: got %.2f, want 1.40", got)
	}
}

func TestZoneSurgeInputExposesRequiredMarketplaceDimensions(t *testing.T) {
	input := ZoneSurgeInput{
		ServiceCode:            "food_delivery",
		DemandOrders:           3,
		AvailableCouriers:      2,
		IdleCouriers:           2,
		AcceptanceRatePct:      66.7,
		AverageMatchTimeSecs:   90,
		NoSupplyOrders:         1,
		AverageIdleTimeMinutes: 12,
		AverageETAMinutes:      4,
		DataFresh:              true,
	}
	if input.ServiceCode == "" || input.DemandOrders == 0 || input.AvailableCouriers == 0 || input.IdleCouriers == 0 || input.AcceptanceRatePct == 0 || input.AverageMatchTimeSecs == 0 || input.NoSupplyOrders == 0 || input.AverageIdleTimeMinutes == 0 || input.AverageETAMinutes == 0 || !input.DataFresh {
		t.Fatal("marketplace metrics snapshot lost one of the required dimensions")
	}
}
