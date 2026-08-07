package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// DriverTip — FB-077: tip dari customer ke kurir untuk SEMUA service
// (parcel, tambal ban, towing, food). 1 tip per order; dana 100% ke kurir
// via payment-service (wallet customer → wallet kurir).
type DriverTip struct {
	ID             uuid.UUID `json:"id" db:"id"`
	OrderID        uuid.UUID `json:"order_id" db:"order_id"`
	CustomerID     uuid.UUID `json:"customer_id" db:"customer_id"`
	CourierID      uuid.UUID `json:"courier_id" db:"courier_id"`
	AmountIDR      int64     `json:"amount_idr" db:"amount_idr"`
	ServiceSubType string    `json:"service_sub_type" db:"service_sub_type"`
	Status         string    `json:"status" db:"status"`
	PaymentRef     *string   `json:"payment_ref,omitempty" db:"payment_ref"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" db:"updated_at"`
}

type TipSummary struct {
	TotalTips    int   `json:"total_tips"`
	TotalAmount  int64 `json:"total_amount_idr"`
	TodayAmount  int64 `json:"today_amount_idr"`
	TodayTips    int   `json:"today_tips"`
}

type TipRepository interface {
	CreateTip(ctx context.Context, tip *DriverTip) error
	GetTipByOrderID(ctx context.Context, orderID uuid.UUID) (*DriverTip, error)
	ListTipsByCourier(ctx context.Context, courierID uuid.UUID, limit, offset int) ([]DriverTip, error)
	SumTipsByCourier(ctx context.Context, courierID uuid.UUID) (total int64, count int, err error)
	SumTipsByCourierSince(ctx context.Context, courierID uuid.UUID, since time.Time) (int64, int, error)
}

// TipGateway — HTTP ke payment-service /api/internal/wallet/tip.
type TipGateway interface {
	ProcessTip(ctx context.Context, customerID, courierID uuid.UUID, amount int64, referenceID string) error
}

type TipService interface {
	CreateTip(ctx context.Context, orderID uuid.UUID, customerID uuid.UUID, amount int64) (*DriverTip, error)
	GetTipByOrder(ctx context.Context, orderID uuid.UUID) (*DriverTip, error)
	ListTipsByCourier(ctx context.Context, courierID uuid.UUID) ([]DriverTip, error)
	GetTipSummary(ctx context.Context, courierID uuid.UUID) (*TipSummary, error)
}
