package service_test

import (
	"context"
	"testing"
	"time"

	"lancar/order-service/internal/domain"
	"lancar/order-service/internal/featureflags"
	"lancar/order-service/internal/service"
)

type MockPricingRepo struct {
	Config *domain.PricingConfig
	Err    error
}

func (m *MockPricingRepo) GetActiveConfig(ctx context.Context, model string) (*domain.PricingConfig, error) {
	return m.Config, m.Err
}
func (m *MockPricingRepo) UpdateConfig(ctx context.Context, config *domain.PricingConfig) error {
	return m.Err
}
func (m *MockPricingRepo) CheckCoverage(ctx context.Context, lat, lng float64) (bool, error) {
	return true, m.Err
}

type MockMapsRepo struct {
	DistKM     float64
	DurMin     float64
	OriginAddr string
	DestAddr   string
	Err        error
}

func (m *MockMapsRepo) GetDistanceMatrix(ctx context.Context, originLat, originLng, destLat, destLng float64) (float64, float64, string, string, error) {
	return m.DistKM, m.DurMin, m.OriginAddr, m.DestAddr, m.Err
}

type MockRedisRepo struct {
	Multiplier float64
	Err        error
}

func (m *MockRedisRepo) SaveEstimate(ctx context.Context, estimate *domain.PricingEstimateResponse) error {
	return nil
}
func (m *MockRedisRepo) GetEstimate(ctx context.Context, estimateID string) (*domain.PricingEstimateResponse, error) {
	return nil, nil
}
func (m *MockRedisRepo) GetConfig(ctx context.Context) (*domain.PricingConfig, error) {
	return nil, nil
}
func (m *MockRedisRepo) UpdateConfig(ctx context.Context, config *domain.PricingConfig) error {
	return nil
}
func (m *MockRedisRepo) GetMultiplier(ctx context.Context, zoneID string) (float64, error) {
	return m.Multiplier, m.Err
}
func (m *MockRedisRepo) UpdateCourierLocation(ctx context.Context, courierID string, lat, lng float64) error {
	return nil
}
func (m *MockRedisRepo) FindNearbyCouriers(ctx context.Context, lat, lng float64, radiusKM float64) ([]string, error) {
	return nil, nil
}
func (m *MockRedisRepo) AcquireLock(ctx context.Context, key string, expiration time.Duration) (bool, error) {
	return true, nil
}
func (m *MockRedisRepo) ReleaseLock(ctx context.Context, key string) error { return nil }

type MockFlagReader struct {
	Flags map[string]*featureflags.FeatureFlag
	Err   error
}

func (m *MockFlagReader) GetFlag(ctx context.Context, key string) (*featureflags.FeatureFlag, error) {
	return m.Flags[key], m.Err
}

func (m *MockFlagReader) GetFlags(ctx context.Context, keys []string) (map[string]*featureflags.FeatureFlag, error) {
	if m.Err != nil {
		return nil, m.Err
	}
	res := make(map[string]*featureflags.FeatureFlag)
	for _, k := range keys {
		if flag, ok := m.Flags[k]; ok {
			res[k] = flag
		}
	}
	return res, nil
}

func (m *MockFlagReader) InvalidateCache(ctx context.Context, key string) error {
	return nil
}

func (m *MockFlagReader) Close() error {
	return nil
}

func TestPricingService_Estimate_FlagAware(t *testing.T) {
	mockPricing := &MockPricingRepo{
		Config: &domain.PricingConfig{
			BaseFare:      10000,
			PricePerKM:    2000,
			PricePerMin:   100,
			VolumetricDiv: 6000,
		},
	}
	mockRedis := &MockRedisRepo{Multiplier: 1.0}

	flagsConfig := map[string]*featureflags.FeatureFlag{
		"model_p2p": {
			Key:       "model_p2p",
			IsEnabled: true,
			Config:    map[string]interface{}{"max_distance_km": float64(15)},
		},
		"model_two_legs": {
			Key:       "model_two_legs",
			IsEnabled: true,
			Config:    map[string]interface{}{"max_distance_km": float64(25)},
		},
		"model_three_legs": {
			Key:       "model_three_legs",
			IsEnabled: false, // 3-Kaki is OFF
			Config:    map[string]interface{}{},
		},
	}

	mockFlags := &MockFlagReader{Flags: flagsConfig}

	reqModels := []string{"model_p2p", "model_two_legs", "model_three_legs"}

	tests := []struct {
		name          string
		distanceKM    float64
		expectedModel string
		expectErr     bool
	}{
		{
			name:          "Jarak 10 km -> P2P",
			distanceKM:    10.0,
			expectedModel: "model_p2p",
			expectErr:     false,
		},
		{
			name:          "Jarak 20 km -> 2-Kaki (P2P exceeds max_distance)",
			distanceKM:    20.0,
			expectedModel: "model_two_legs",
			expectErr:     false,
		},
		{
			name:          "Jarak 30 km -> Error (3-Kaki OFF)",
			distanceKM:    30.0,
			expectedModel: "",
			expectErr:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockMaps := &MockMapsRepo{DistKM: tt.distanceKM, DurMin: 30}
			svc := service.NewPricingService(mockPricing, mockMaps, mockRedis, mockFlags)

			req := &domain.PricingEstimateRequest{
				PickupLat: -6.2, PickupLng: 106.8,
				DropoffLat: -6.3, DropoffLng: 106.9,
				Length: 10, Width: 10, Height: 10, Weight: 1,
				Models: reqModels,
			}

			resp, err := svc.EstimatePrice(context.Background(), req)

			if (err != nil) != tt.expectErr {
				t.Errorf("expected error %v, got %v", tt.expectErr, err)
			}

			if resp != nil && resp.Model != tt.expectedModel {
				t.Errorf("expected model %v, got %v", tt.expectedModel, resp.Model)
			}
		})
	}
}

func TestPricingService_Estimate_TwoLegsOff(t *testing.T) {
	mockPricing := &MockPricingRepo{
		Config: &domain.PricingConfig{
			BaseFare:      10000,
			PricePerKM:    2000,
			PricePerMin:   100,
			VolumetricDiv: 6000,
		},
	}
	mockRedis := &MockRedisRepo{Multiplier: 1.0}

	flagsConfig := map[string]*featureflags.FeatureFlag{
		"model_p2p": {
			Key:       "model_p2p",
			IsEnabled: true,
			Config:    map[string]interface{}{"max_distance_km": float64(15)},
		},
		"model_two_legs": {
			Key:       "model_two_legs",
			IsEnabled: false, // 2-Kaki OFF
			Config:    map[string]interface{}{"max_distance_km": float64(25)},
		},
		"model_three_legs": {
			Key:       "model_three_legs",
			IsEnabled: false, // 3-Kaki OFF
			Config:    map[string]interface{}{},
		},
	}

	mockFlags := &MockFlagReader{Flags: flagsConfig}

	reqModels := []string{"model_p2p", "model_two_legs", "model_three_legs"}

	tests := []struct {
		name          string
		distanceKM    float64
		expectedModel string
		expectErr     bool
	}{
		{
			name:          "Jarak 10 km -> P2P",
			distanceKM:    10.0,
			expectedModel: "model_p2p",
			expectErr:     false,
		},
		{
			name:          "Jarak 20 km -> Error (2-Kaki OFF)",
			distanceKM:    20.0,
			expectedModel: "",
			expectErr:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockMaps := &MockMapsRepo{DistKM: tt.distanceKM, DurMin: 30}
			svc := service.NewPricingService(mockPricing, mockMaps, mockRedis, mockFlags)

			req := &domain.PricingEstimateRequest{
				PickupLat: -6.2, PickupLng: 106.8,
				DropoffLat: -6.3, DropoffLng: 106.9,
				Length: 10, Width: 10, Height: 10, Weight: 1,
				Models: reqModels,
			}

			resp, err := svc.EstimatePrice(context.Background(), req)

			if (err != nil) != tt.expectErr {
				t.Errorf("expected error %v, got %v", tt.expectErr, err)
			}

			if resp != nil && resp.Model != tt.expectedModel {
				t.Errorf("expected model %v, got %v", tt.expectedModel, resp.Model)
			}
		})
	}
}
