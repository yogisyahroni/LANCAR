package domain

import "time"

type CourierStatus string

const (
	CourierStatusPending   CourierStatus = "pending"
	CourierStatusActive    CourierStatus = "active"
	CourierStatusSuspended CourierStatus = "suspended"
)

type CourierProfile struct {
	ID               string        `json:"id" db:"id"`
	UserID           string        `json:"user_id" db:"user_id"`
	VehicleType      string        `json:"vehicle_type" db:"vehicle_type"`
	VehiclePlate     string        `json:"vehicle_plate" db:"vehicle_plate"`
	CurrentZoneID    *string       `json:"current_zone_id" db:"current_zone_id"`
	Status           CourierStatus `json:"status" db:"status"`
	RelayScore       float64       `json:"relay_score" db:"relay_score"`
	IsVerified       bool          `json:"is_verified" db:"is_verified"`
	LivenessVerified bool          `json:"liveness_verified" db:"liveness_verified"`
	VerifiedAt       *time.Time    `json:"verified_at" db:"verified_at"`
	CreatedAt        time.Time     `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time     `json:"updated_at" db:"updated_at"`
}

type CourierDocument struct {
	ID           string    `json:"id" db:"id"`
	CourierID    string    `json:"courier_id" db:"courier_id"`
	DocumentType string    `json:"document_type" db:"document_type"` // ktp, sim, stnk, selfie
	DocumentURL  string    `json:"document_url" db:"document_url"`
	IsVerified   bool      `json:"is_verified" db:"is_verified"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
}

type CourierLocalSecurityLog struct {
	ID         string    `json:"id" db:"id"`
	CourierID  string    `json:"courier_id" db:"courier_id"`
	ActionType string    `json:"action_type" db:"action_type"`
	Method     string    `json:"method" db:"method"`
	OrderID    *string   `json:"order_id,omitempty" db:"order_id"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
}
