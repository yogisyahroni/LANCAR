package service_test

import (
	"context"
	"testing"
	"time"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/featureflags"
	"tembus/order-service/internal/service"
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

func (m *MockPricingRepo) GetDeliveryServiceByCode(ctx context.Context, code string) (*domain.DeliveryServiceProduct, error) {
	if m.Err != nil {
		return nil, m.Err
	}
	var baseFare, perKm int64
	if m.Config != nil {
		baseFare = m.Config.BaseFare
		perKm = m.Config.PricePerKM
	}
	return &domain.DeliveryServiceProduct{
		Code:           code,
		Name:           "Mocked Service",
		BaseFareIDR:    baseFare,
		PerKmIDR:       perKm,
		PlatformFeeIDR: 1500,
		PlatformFeePct: 0.015,
	}, nil
}

type MockMapsRepo struct {
	DistKM     float64
	DurMin     float64
	OriginAddr string
	DestAddr   string
	Err        error
}

func (m *MockMapsRepo) GetDistanceMatrix(ctx context.Context, originLat, originLng, destLat, destLng float64, useTraffic bool) (float64, float64, string, string, error) {
	return m.DistKM, m.DurMin, m.OriginAddr, m.DestAddr, m.Err
}
func (m *MockMapsRepo) OptimizeWaypoints(ctx context.Context, origin domain.Waypoint, waypoints []domain.Waypoint, dest domain.Waypoint, useTraffic bool) (*domain.OptimizedRouteResult, error) {
	return nil, nil
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

type MockConfigRepo struct {
	Configs map[string]interface{}
}

func (m *MockConfigRepo) GetConfig(ctx context.Context, key string) (*domain.SystemConfig, error) {
	return nil, nil
}
func (m *MockConfigRepo) GetFloatConfig(ctx context.Context, key string, fallback float64) float64 {
	if val, ok := m.Configs[key]; ok {
		if f, ok := val.(float64); ok {
			return f
		}
	}
	return fallback
}
func (m *MockConfigRepo) GetIntConfig(ctx context.Context, key string, fallback int) int {
	if val, ok := m.Configs[key]; ok {
		if i, ok := val.(int); ok {
			return i
		}
		if i64, ok := val.(int64); ok {
			return int(i64)
		}
	}
	return fallback
}
func (m *MockConfigRepo) GetStringConfig(ctx context.Context, key string, fallback string) string {
	if val, ok := m.Configs[key]; ok {
		if s, ok := val.(string); ok {
			return s
		}
	}
	return fallback
}


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

func (m *MockFlagReader) IsFeatureFlagEnabled(ctx context.Context, key string, defaultVal bool) (bool, error) {
	if m.Err != nil {
		return defaultVal, m.Err
	}
	if flag, ok := m.Flags[key]; ok {
		return flag.IsEnabled, nil
	}
	return defaultVal, nil
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
	}

	mockFlags := &MockFlagReader{Flags: flagsConfig}

	reqModels := []string{"model_p2p"}

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
			name:          "Jarak 20 km -> P2P",
			distanceKM:    20.0,
			expectedModel: "model_p2p",
			expectErr:     false,
		},
		{
			name:          "Jarak 30 km -> P2P",
			distanceKM:    30.0,
			expectedModel: "model_p2p",
			expectErr:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockMaps := &MockMapsRepo{DistKM: tt.distanceKM, DurMin: 30}
			mockConfig := &MockConfigRepo{Configs: map[string]interface{}{}}
			svc := service.NewPricingService(mockPricing, mockMaps, mockRedis, mockFlags, mockConfig)

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
	}

	mockFlags := &MockFlagReader{Flags: flagsConfig}

	reqModels := []string{"model_p2p"}

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
			name:          "Jarak 20 km -> P2P meski model lama nonaktif",
			distanceKM:    20.0,
			expectedModel: "model_p2p",
			expectErr:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockMaps := &MockMapsRepo{DistKM: tt.distanceKM, DurMin: 30}
			mockConfig := &MockConfigRepo{Configs: map[string]interface{}{}}
			svc := service.NewPricingService(mockPricing, mockMaps, mockRedis, mockFlags, mockConfig)

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

func TestPricingService_RoundingAndPromoAccounting(t *testing.T) {
	mockPricing := &MockPricingRepo{
		Config: &domain.PricingConfig{
			BaseFare:   10000,
			PricePerKM: 2000,
		},
	}
	mockMaps := &MockMapsRepo{DistKM: 5.0, DurMin: 15}
	mockRedis := &MockRedisRepo{Multiplier: 1.0}
	mockFlags := &MockFlagReader{Flags: map[string]*featureflags.FeatureFlag{}}
	mockConfig := &MockConfigRepo{
		Configs: map[string]interface{}{
			"pricing_rounding_mode":          "ceil",
			"pricing_rounding_precision_idr": 500,
			"promo_discount_pct_HEMAT20":     0.20,
			"max_discount_subsidy_idr":       5000,
			"promo_sponsor_HEMAT20":          "platform",
		},
	}

	svc := service.NewPricingService(mockPricing, mockMaps, mockRedis, mockFlags, mockConfig)

	req := &domain.PricingEstimateRequest{
		PickupLat: -6.2, PickupLng: 106.8,
		DropoffLat: -6.3, DropoffLng: 106.9,
		Length: 10, Width: 10, Height: 10, Weight: 1,
		PromoCode: "HEMAT20",
	}

	resp, err := svc.EstimatePrice(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify promo discount IDR is accounted
	if resp.DiscountIDR <= 0 {
		t.Errorf("expected DiscountIDR > 0, got %d", resp.DiscountIDR)
	}
	if resp.PromoSubsidyIDR != resp.DiscountIDR {
		t.Errorf("expected PromoSubsidyIDR == DiscountIDR for platform sponsor, got %d vs %d", resp.PromoSubsidyIDR, resp.DiscountIDR)
	}

	// Verify ceiling rounding precision 500
	if resp.TotalPriceIDR%500 != 0 {
		t.Errorf("expected TotalPriceIDR to be multiple of 500 (ceil mode), got %d", resp.TotalPriceIDR)
	}
}
