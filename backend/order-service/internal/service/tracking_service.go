package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"lancar/order-service/internal/domain"
)

type TrackingServiceImpl struct {
	repo     domain.TrackingRepository
	eventBus domain.EventBus
}

func NewTrackingService(repo domain.TrackingRepository, eventBus domain.EventBus) domain.TrackingService {
	return &TrackingServiceImpl{
		repo:     repo,
		eventBus: eventBus,
	}
}

func (s *TrackingServiceImpl) UpdateLocation(ctx context.Context, req domain.CourierLocationUpdate) error {
	// Simple spoofing check based on velocity
	isSpoofed := false
	if req.Location.Speed > 150 { // > 150 km/h is suspicious for a motorcycle courier
		isSpoofed = true
	}

	// 1. Save to GPS Log (Partitioned table)
	if err := s.repo.SaveGPSLog(ctx, req.CourierID, req.OrderID, req.Location, isSpoofed); err != nil {
		return fmt.Errorf("failed to save gps log: %w", err)
	}

	// 2. Update current location in profile
	if err := s.repo.UpdateCourierLocation(ctx, req.CourierID, req.Location); err != nil {
		return fmt.Errorf("failed to update courier location: %w", err)
	}

	// 3. Real PostGIS Geofencing Check via ST_Contains
	// Queries whether the courier's lat/lng point falls within their assigned zone polygon.
	geofenceResult, geoErr := s.repo.CheckGeofence(ctx, req.CourierID, req.Location.Latitude, req.Location.Longitude)
	if geoErr != nil {
		// Non-fatal: log and continue. Don't block location updates on geofence check failures.
		// In production this should be sent to a structured logger (e.g. pino/zap).
		fmt.Printf("[TrackingService] WARN: geofence check failed for courier %s: %v\n", req.CourierID, geoErr)
	} else if !geofenceResult.IsInsideZone && geofenceResult.OutOfZoneMinutes > 5 {
		// Courier has been out of their assigned zone for more than 5 minutes — alert
		topic := fmt.Sprintf("alert:geofence:%s", req.CourierID.String())
		s.eventBus.Publish(ctx, topic, map[string]interface{}{
			"courier_id":         req.CourierID.String(),
			"alert":              "Courier has been out of assigned zone for >5 minutes",
			"out_of_zone_minutes": geofenceResult.OutOfZoneMinutes,
			"zone_id":            geofenceResult.AssignedZoneID,
			"location":           req.Location,
		})
	}

	// 4. Publish to Redis Pub/Sub for real-time tracking
	topic := fmt.Sprintf("tracking:courier:%s", req.CourierID.String())
	payload := map[string]interface{}{
		"courier_id": req.CourierID.String(),
		"location":   req.Location,
	}
	s.eventBus.Publish(ctx, topic, payload)

	if req.OrderID != nil {
		orderTopic := fmt.Sprintf("tracking:order:%s", req.OrderID.String())
		s.eventBus.Publish(ctx, orderTopic, payload)
	}

	return nil
}

func (s *TrackingServiceImpl) GetTrackingByOrder(ctx context.Context, orderID uuid.UUID) (*domain.TrackingResponse, error) {
	// 1. Get active courier for this order
	courierID, err := s.repo.GetActiveCourierForOrder(ctx, orderID)
	if err != nil {
		return nil, fmt.Errorf("no active courier found for order: %w", err)
	}

	// 2. Get latest location of that courier
	loc, err := s.repo.GetLatestLocation(ctx, *courierID)
	if err != nil {
		return nil, fmt.Errorf("failed to get latest location: %w", err)
	}

	return &domain.TrackingResponse{
		CourierID: *courierID,
		Location:  *loc,
		// ETA and RoutePolyline would be calculated via a routing service in a real scenario
		ETA:           "Calculated via routing service",
		RoutePolyline: "Polyline data",
	}, nil
}

func (s *TrackingServiceImpl) ProcessIdleCouriers(ctx context.Context) error {
	// 15 minutes threshold for auto-offline
	idleCouriers, err := s.repo.GetIdleCouriers(ctx, 15)
	if err != nil {
		return err
	}

	for _, id := range idleCouriers {
		_ = s.repo.SetCourierOffline(ctx, id)
		// Optionally publish an event
		topic := fmt.Sprintf("courier:status:%s", id.String())
		s.eventBus.Publish(ctx, topic, map[string]interface{}{
			"status": "offline",
			"reason": "idle_timeout",
		})
	}
	return nil
}
