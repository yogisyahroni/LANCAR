package service

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	"log"
	"sort"
	"tembus/order-service/internal/domain"
)

type meetingPointServiceImpl struct {
	orderRepo domain.OrderRepository
	mapsRepo  domain.MapsRepository
	redisRepo domain.RedisRepository
}

func NewMeetingPointService(or domain.OrderRepository, mr domain.MapsRepository, rr domain.RedisRepository) *meetingPointServiceImpl {
	return &meetingPointServiceImpl{
		orderRepo: or,
		mapsRepo:  mr,
		redisRepo: rr,
	}
}

func (s *meetingPointServiceImpl) SuggestMeetingPoint(ctx context.Context, pickupLat, pickupLng, dropoffLat, dropoffLng float64) ([]map[string]interface{}, error) {
	log.Printf("[MeetingPointService] Suggesting points for route %v,%v to %v,%v", pickupLat, pickupLng, dropoffLat, dropoffLng)

	// 1. Identify active zones/meeting points near the route
	// For simplicity in MVP, we find points within 5km of the pickup (first leg candidates)
	points, err := s.orderRepo.ListMeetingPoints(ctx, pickupLat, pickupLng, 5.0)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch meeting points: %w", err)
	}

	if len(points) == 0 {
		return []map[string]interface{}{}, nil
	}

	// 2. Score points based on traffic, distance, and courier density
	suggestions := []map[string]interface{}{}
	for _, p := range points {
		// Get traffic/travel time from pickup to point
		dist, dur, _, _, err := s.mapsRepo.GetDistanceMatrix(ctx, pickupLat, pickupLng, p.Latitude, p.Longitude)
		if err != nil {
			log.Printf("Failed to get traffic for point %s: %v", p.ID, err)
			continue
		}

		// 2.1 Check Courier Density via Redis
		couriers, err := s.redisRepo.FindNearbyCouriers(ctx, p.Latitude, p.Longitude, 2.0) // 2km radius around point
		density := float64(len(couriers))
		if err != nil {
			density = 0
		}

		// Enhanced Scoring: prioritize low duration and high courier availability
		// score = (1 / (dur + 1)) * (1 + density/10)
		score := (1.0 / (dur + 1)) * (1.0 + (density / 10.0))

		trafficLevel := "low"
		if dur > dist*3 { // threshold for "heavy" traffic
			trafficLevel = "heavy"
		} else if dur > dist*2 {
			trafficLevel = "moderate"
		}

		suggestions = append(suggestions, map[string]interface{}{
			"id":              p.ID,
			"name":            p.Name,
			"lat":             p.Latitude,
			"lng":             p.Longitude,
			"address":         p.Address,
			"distance_km":     dist,
			"duration_min":    dur,
			"courier_density": density,
			"score":           score,
			"traffic_level":   trafficLevel,
		})
	}

	// 3. Sort by score descending
	sort.Slice(suggestions, func(i, j int) bool {
		return suggestions[i]["score"].(float64) > suggestions[j]["score"].(float64)
	})

	return suggestions, nil
}
func (s *meetingPointServiceImpl) CreateMeetingPoint(ctx context.Context, mp *domain.MeetingPoint) error {
	if mp.ID == "" {
		mp.ID = uuid.New().String()
	}
	return s.orderRepo.CreateMeetingPoint(ctx, mp)
}

func (s *meetingPointServiceImpl) UpdateMeetingPoint(ctx context.Context, mp *domain.MeetingPoint) error {
	return s.orderRepo.UpdateMeetingPoint(ctx, mp)
}

func (s *meetingPointServiceImpl) DeleteMeetingPoint(ctx context.Context, id string) error {
	return s.orderRepo.DeleteMeetingPoint(ctx, id)
}

func (s *meetingPointServiceImpl) GetAnalytics(ctx context.Context) ([]domain.MeetingPointAnalytics, error) {
	return s.orderRepo.GetMeetingPointAnalytics(ctx)
}
