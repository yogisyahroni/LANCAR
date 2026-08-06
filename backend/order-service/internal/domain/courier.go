package domain

import (
	"context"
	"time"
)

type CourierStatus string
type CourierTier string

const (
	CourierStatusOnline  CourierStatus = "online"
	CourierStatusOffline CourierStatus = "offline"
	CourierStatusBusy    CourierStatus = "busy"
)

const (
	CourierTierNewbie  CourierTier = "NEWBIE"
	CourierTierSilver  CourierTier = "SILVER"
	CourierTierGold    CourierTier = "GOLD"
	CourierTierGodMode CourierTier = "GOD_MODE"
)

type Courier struct {
	ID           string        `json:"id"`
	Name         string        `json:"name"`
	Phone        string        `json:"phone"`
	VehicleType  string        `json:"vehicle_type"`
	VehiclePlate string        `json:"vehicle_plate"`
	Status       CourierStatus `json:"status"`
	CurrentLat   float64       `json:"current_lat"`
	CurrentLng   float64       `json:"current_lng"`
	Tier         CourierTier   `json:"tier"`
	JoinDate     time.Time     `json:"join_date"`
	RadiusMaxKM  int           `json:"radius_max_km" db:"radius_max_km"`
}

type CourierRepository interface {
	GetByID(ctx context.Context, id string) (*Courier, error)
	UpdateStatus(ctx context.Context, id string, status CourierStatus) error
	UpdateLocation(ctx context.Context, id string, lat, lng float64) error
}

type CourierMatchingService interface {
	FindNearby(ctx context.Context, lat, lng float64, radiusKM float64) ([]*Courier, error)
	Assign(ctx context.Context, orderID string, courierID string) error
}
