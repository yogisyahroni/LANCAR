package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type SLAConfig struct {
	ID             uuid.UUID `json:"id" db:"id"`
	Model          string    `json:"model" db:"model"`
	LegNumber      int       `json:"leg_number" db:"leg_number"`
	MaxMinutes     int       `json:"max_minutes" db:"max_minutes"`
	WarningMinutes int       `json:"warning_minutes" db:"warning_minutes"`
	IsActive       bool      `json:"is_active" db:"is_active"`
}

type SLALog struct {
	ID               uuid.UUID `json:"id" db:"id"`
	OrderID          string    `json:"order_id" db:"order_id"`
	LegID            uuid.UUID `json:"leg_id" db:"leg_id"`
	CourierID        string    `json:"courier_id" db:"courier_id"`
	SLADeadline      time.Time `json:"sla_deadline" db:"sla_deadline"`
	BreachDetectedAt time.Time `json:"breach_detected_at" db:"breach_detected_at"`
	BreachMinutes    int       `json:"breach_minutes" db:"breach_minutes"`
	PenaltyAmount    int64     `json:"penalty_amount" db:"penalty_amount"`
	Status           string    `json:"status" db:"status"` // e.g. "unpaid", "paid"
	CreatedAt        time.Time `json:"created_at" db:"created_at"`
}

type SLARepository interface {
	GetConfig(ctx context.Context, model string, legNumber int) (*SLAConfig, error)
	ListActiveLegs(ctx context.Context) ([]*OrderLegSLA, error)
	SaveSLALog(ctx context.Context, log *SLALog) error
	GetComplianceRate(ctx context.Context, zoneID string, date string) (float64, error)
	GetIdleCouriers(ctx context.Context, threshold time.Time) ([]*IdleCourier, error)
	SetLegSLADeadline(ctx context.Context, legID uuid.UUID, deadline time.Time) error
}

type OrderLegSLA struct {
	LegID       uuid.UUID `json:"leg_id" db:"id"`
	OrderID     string    `json:"order_id" db:"order_id"`
	CourierID   string    `json:"courier_id" db:"courier_id"`
	Model       string    `json:"model" db:"model"`
	LegNumber   int       `json:"leg_number" db:"leg_number"`
	Status      string    `json:"status" db:"status"`
	SLADeadline time.Time `json:"sla_deadline" db:"sla_deadline"`
}

type IdleCourier struct {
	LegID          uuid.UUID `json:"leg_id" db:"id"`
	OrderID        string    `json:"order_id" db:"order_id"`
	CourierID      string    `json:"courier_id" db:"courier_id"`
	MeetingPointID string    `json:"meeting_point_id" db:"meeting_point_id"`
	ArrivedAt      time.Time `json:"arrived_at" db:"arrived_at"`
}

type SLAService interface {
	SetSLADeadline(ctx context.Context, orderID string, legID uuid.UUID, model string, legNumber int) error
	ProcessSLAWarnings(ctx context.Context) error
	ProcessSLABreaches(ctx context.Context) error
	ProcessIdleCompensation(ctx context.Context) error
	GetComplianceDashboard(ctx context.Context, zoneID string, date string) (map[string]interface{}, error)
}
