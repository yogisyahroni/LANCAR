package service_test

import (
	"context"
	"testing"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/service"
)

type settlementConfigRepoStub struct {
	configs map[string]*domain.SettlementConfig
}

func (s *settlementConfigRepoStub) GetSettlementConfig(ctx context.Context, serviceCode string) (*domain.SettlementConfig, error) {
	return s.configs[serviceCode], nil
}

func (s *settlementConfigRepoStub) GetAllSettlementConfigs(ctx context.Context) ([]*domain.SettlementConfig, error) {
	configs := make([]*domain.SettlementConfig, 0, len(s.configs))
	for _, config := range s.configs {
		configs = append(configs, config)
	}
	return configs, nil
}

func TestCalculateSettlementPerKMCommissionIgnoresServiceFee(t *testing.T) {
	repo := &settlementConfigRepoStub{configs: map[string]*domain.SettlementConfig{}}
	for _, serviceCode := range []string{"tambal_ban_motor", "towing_mobil"} {
		repo.configs[serviceCode] = &domain.SettlementConfig{
			ServiceCode:           serviceCode,
			ServiceCategory:       "maintenance",
			CommissionBasis:       domain.SettlementBasisPerKM,
			PlatformCommissionPct: 20,
			MDRPct:                0,
			TaxPct:                0,
			CourierKeepsBaseFee:   false,
			CourierKeepsToll:      true,
		}
	}

	svc := service.NewSettlementService(repo)

	tests := []struct {
		name                string
		serviceCode         string
		grossTotal          int64
		distanceKM          float64
		baseFare            int64
		perKMRate           int64
		courierServicePrice int64
		wantCommission      int64
		wantNet             int64
		wantBaseEarning     int64
		wantPerKMEarning    int64
	}{
		{
			name:                "tambal ban service fee is not commissioned",
			serviceCode:         "tambal_ban_motor",
			grossTotal:          180_000,
			distanceKM:          4,
			baseFare:            5_000,
			perKMRate:           2_000,
			courierServicePrice: 150_000,
			wantCommission:      2_600,
			wantNet:             177_400,
			wantBaseEarning:     4_000,
			wantPerKMEarning:    6_400,
		},
		{
			name:                "towing service fee is not commissioned",
			serviceCode:         "towing_mobil",
			grossTotal:          390_000,
			distanceKM:          10,
			baseFare:            8_000,
			perKMRate:           4_000,
			courierServicePrice: 320_000,
			wantCommission:      9_600,
			wantNet:             380_400,
			wantBaseEarning:     6_400,
			wantPerKMEarning:    32_000,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := svc.CalculateSettlement(
				context.Background(),
				"order-test",
				tt.serviceCode,
				tt.grossTotal,
				tt.distanceKM,
				tt.baseFare,
				tt.perKMRate,
				tt.courierServicePrice,
				0,
				0,
			)
			if err != nil {
				t.Fatalf("CalculateSettlement returned error: %v", err)
			}

			if got.PlatformCommissionAmt != tt.wantCommission {
				t.Fatalf("PlatformCommissionAmt = %d, want %d", got.PlatformCommissionAmt, tt.wantCommission)
			}
			if got.EstimatedNetEarnings != tt.wantNet {
				t.Fatalf("EstimatedNetEarnings = %d, want %d", got.EstimatedNetEarnings, tt.wantNet)
			}
			if got.CourierServiceFee != tt.courierServicePrice {
				t.Fatalf("CourierServiceFee = %d, want %d", got.CourierServiceFee, tt.courierServicePrice)
			}
			if got.CourierBaseFee != tt.wantBaseEarning {
				t.Fatalf("CourierBaseFee = %d, want %d", got.CourierBaseFee, tt.wantBaseEarning)
			}
			if got.CourierPerKMEarning != tt.wantPerKMEarning {
				t.Fatalf("CourierPerKMEarning = %d, want %d", got.CourierPerKMEarning, tt.wantPerKMEarning)
			}
		})
	}
}
