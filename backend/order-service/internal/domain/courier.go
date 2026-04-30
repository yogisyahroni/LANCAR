package domain

import "context"

type CourierStatus string

const (
	CourierStatusOnline  CourierStatus = "online"
	CourierStatusOffline CourierStatus = "offline"
	CourierStatusBusy    CourierStatus = "busy"
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
