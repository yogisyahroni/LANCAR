package routing

import (
	"context"
	"testing"

	"lancar-backend/internal/featureflags"
)

type mockFlagReader struct {
	flags map[string]*featureflags.FeatureFlag
}

type fakeZoneResolver struct {
	zones map[Coordinate]string
}

func (r *fakeZoneResolver) ResolveZoneCode(ctx context.Context, coord Coordinate) (string, error) {
	zone, ok := r.zones[coord]
	if !ok {
		return "", ErrZoneNotFound
	}
	return zone, nil
}

func (m *mockFlagReader) GetFlag(ctx context.Context, key string) (*featureflags.FeatureFlag, error) {
	return m.flags[key], nil
}

func (m *mockFlagReader) GetFlags(ctx context.Context, keys []string) (map[string]*featureflags.FeatureFlag, error) {
	res := make(map[string]*featureflags.FeatureFlag)
	for _, k := range keys {
		res[k] = m.flags[k]
	}
	return res, nil
}

func (m *mockFlagReader) InvalidateCache(ctx context.Context, key string) error {
	return nil
}

func (m *mockFlagReader) Close() error {
	return nil
}

func TestSelectModel(t *testing.T) {
	// Setup flags
	flags := map[string]*featureflags.FeatureFlag{
		"model_p2p": {
			IsEnabled: true,
			Config: map[string]interface{}{
				"active_zones": []interface{}{"JAK-TIM", "JAK-SEL"},
			},
		},
		"model_two_legs": {
			IsEnabled: true,
			Config: map[string]interface{}{
				"active_zones": []interface{}{"JAK-TIM", "JAK-SEL"},
			},
		},
		"model_three_legs": {
			IsEnabled: true,
			Config: map[string]interface{}{
				"active_zones":         []interface{}{"JAK-TIM", "JAK-SEL"},
				"rejection_message_id": "MSG_THREE_LEGS_UNAVAILABLE",
			},
		},
	}

	reader := &mockFlagReader{flags: flags}
	zoneResolver := &fakeZoneResolver{zones: map[Coordinate]string{
		{Lat: -6.10, Lng: 106.80}: "JAK-SEL",
		{Lat: -6.19, Lng: 106.80}: "JAK-SEL",
		{Lat: -6.28, Lng: 106.80}: "JAK-SEL",
		{Lat: -6.37, Lng: 106.80}: "JAK-SEL",
		{Lat: -6.10, Lng: 106.90}: "BOG-UTR",
		{Lat: -6.19, Lng: 106.90}: "BOG-UTR",
	}}
	engine := NewRoutingEngineWithZoneResolver(reader, zoneResolver)
	ctx := context.Background()

	tests := []struct {
		name      string
		pickup    Coordinate
		dropoff   Coordinate
		wantModel ModelType
		wantErr   bool
	}{
		{
			name:      "P2P Model (Distance 10)",
			pickup:    Coordinate{Lat: -6.10, Lng: 106.80},
			dropoff:   Coordinate{Lat: -6.19, Lng: 106.80},
			wantModel: ModelP2P,
			wantErr:   false,
		},
		{
			name:      "Two Legs Model (Distance 20)",
			pickup:    Coordinate{Lat: -6.10, Lng: 106.80},
			dropoff:   Coordinate{Lat: -6.28, Lng: 106.80},
			wantModel: ModelTwoLegs,
			wantErr:   false,
		},
		{
			name:      "Three Legs Model (Distance 30)",
			pickup:    Coordinate{Lat: -6.10, Lng: 106.80},
			dropoff:   Coordinate{Lat: -6.37, Lng: 106.80},
			wantModel: ModelThreeLegs,
			wantErr:   false,
		},
		{
			name:      "Zone Not Allowed (P2P)",
			pickup:    Coordinate{Lat: -6.10, Lng: 106.90},
			dropoff:   Coordinate{Lat: -6.19, Lng: 106.90},
			wantModel: "",
			wantErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := engine.SelectModel(ctx, OrderRequest{
				Pickup:  tt.pickup,
				Dropoff: tt.dropoff,
				UserID:  "user123",
			})

			if (err != nil) != tt.wantErr {
				t.Errorf("SelectModel() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got != tt.wantModel {
				t.Errorf("SelectModel() got = %v, want %v", got, tt.wantModel)
			}
		})
	}
}

func BenchmarkSelectModel(b *testing.B) {
	flags := map[string]*featureflags.FeatureFlag{
		"model_p2p": {
			IsEnabled: true,
			Config: map[string]interface{}{
				"active_zones": []interface{}{"JAK-TIM", "JAK-SEL"},
			},
		},
		"model_two_legs": {
			IsEnabled: true,
			Config: map[string]interface{}{
				"active_zones": []interface{}{"JAK-TIM", "JAK-SEL"},
			},
		},
		"model_three_legs": {
			IsEnabled: true,
			Config: map[string]interface{}{
				"active_zones":         []interface{}{"JAK-TIM", "JAK-SEL"},
				"rejection_message_id": "MSG_THREE_LEGS_UNAVAILABLE",
			},
		},
	}
	reader := &mockFlagReader{flags: flags}
	zoneResolver := &fakeZoneResolver{zones: map[Coordinate]string{
		{Lat: -6.10, Lng: 106.80}: "JAK-SEL",
		{Lat: -6.37, Lng: 106.80}: "JAK-SEL",
	}}
	engine := NewRoutingEngineWithZoneResolver(reader, zoneResolver)
	ctx := context.Background()

	req := OrderRequest{
		Pickup:  Coordinate{Lat: -6.10, Lng: 106.80},
		Dropoff: Coordinate{Lat: -6.37, Lng: 106.80},
		UserID:  "user123",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = engine.SelectModel(ctx, req)
	}
}

func TestInRollout(t *testing.T) {
	flag := &featureflags.FeatureFlag{
		IsEnabled: true,
		Config: map[string]interface{}{
			"rollout_pct": float64(50),
		},
	}

	// Because of hashing, we just check that distribution is roughly 50/50 over a large sample
	inRolloutCount := 0
	totalCount := 1000

	for i := 0; i < totalCount; i++ {
		userID := string(rune(i + 1000)) // simple unique ID
		if inRollout(flag, userID) {
			inRolloutCount++
		}
	}

	// Allow some variance, e.g., 400 to 600 out of 1000 for a 50% rollout
	if inRolloutCount < 400 || inRolloutCount > 600 {
		t.Errorf("Rollout distribution failed, expected ~500, got %d", inRolloutCount)
	}

	// Test 0%
	flag.Config["rollout_pct"] = float64(0)
	if inRollout(flag, "user1") {
		t.Errorf("Expected user to not be in 0%% rollout")
	}

	// Test 100%
	flag.Config["rollout_pct"] = float64(100)
	if !inRollout(flag, "user1") {
		t.Errorf("Expected user to be in 100%% rollout")
	}
}
