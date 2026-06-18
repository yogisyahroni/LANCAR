package domain

import (
	"context"
	"time"
)

type PaymentLinkStatus string

const (
	PaymentLinkStatusPending PaymentLinkStatus = "PENDING"
	PaymentLinkStatusPaid    PaymentLinkStatus = "PAID"
	PaymentLinkStatusExpired PaymentLinkStatus = "EXPIRED"
)

type PaymentLink struct {
	ID                string            `json:"id"`
	MerchantID        string            `json:"merchant_id"`
	ItemName          string            `json:"item_name"`
	ItemPrice         int64             `json:"item_price"`
	ItemImageURL      string            `json:"item_image_url"`
	MerchantFeeAmount int64             `json:"merchant_fee_amount"`
	DropoffAddress    string            `json:"dropoff_address"`
	DropoffLat        float64           `json:"dropoff_lat"`
	DropoffLng        float64           `json:"dropoff_lng"`
	Status            PaymentLinkStatus `json:"status"`
	ExpiredAt         time.Time         `json:"expired_at"`
	DeletedAt         *time.Time        `json:"deleted_at,omitempty"`
	EstimateID        string            `json:"estimate_id,omitempty"`
	OrderID           string            `json:"order_id,omitempty"`
	ServiceCode       string            `json:"service_code,omitempty"`
	PickupAddress     string            `json:"pickup_address,omitempty"`
	PickupLat         float64           `json:"pickup_lat,omitempty"`
	PickupLng         float64           `json:"pickup_lng,omitempty"`
	DeliveryFeeAmount int64             `json:"delivery_fee_amount"`
	StoreName         string            `json:"store_name,omitempty"`
	CreatedAt         time.Time         `json:"created_at"`
	UpdatedAt         time.Time         `json:"updated_at"`
}

type PaymentLinkRepository interface {
	Create(ctx context.Context, link *PaymentLink) error
	GetByID(ctx context.Context, id string) (*PaymentLink, error)
	UpdateStatus(ctx context.Context, id string, status PaymentLinkStatus) error
	UpdateOrderID(ctx context.Context, id string, orderID string) error
	ListByMerchantID(ctx context.Context, merchantID string, limit, offset int) ([]*PaymentLink, error)
	MarkExpired(ctx context.Context, before time.Time) (int64, error)
	SoftDeleteExpiredLinks(ctx context.Context, olderThan time.Time) (int64, error)
}

type CreatePaymentLinkRequest struct {
	ItemName       string  `json:"item_name" validate:"required"`
	ItemPrice      int64   `json:"item_price" validate:"required,gt=0"`
	ItemImageURL   string  `json:"item_image_url" validate:"required"`
	ServiceCode    string  `json:"service_code" validate:"required"`
	PickupAddress  string  `json:"pickup_address" validate:"required"`
	PickupLat      float64 `json:"pickup_lat" validate:"required"`
	PickupLng      float64 `json:"pickup_lng" validate:"required"`
	DropoffAddress string  `json:"dropoff_address" validate:"required"`
	DropoffLat     float64 `json:"dropoff_lat" validate:"required"`
	DropoffLng     float64 `json:"dropoff_lng" validate:"required"`
	StoreName      string  `json:"store_name,omitempty"`
}

type PaymentLinkCheckoutResponse struct {
	Token       string `json:"token"`
	RedirectURL string `json:"redirect_url"`
}

type PaymentLinkService interface {
	CreateLink(ctx context.Context, merchantID string, req CreatePaymentLinkRequest) (*PaymentLink, error)
	GetLink(ctx context.Context, id string) (*PaymentLink, error)
	ListLinks(ctx context.Context, merchantID string, limit, offset int) ([]*PaymentLink, error)
	CheckoutLink(ctx context.Context, id string) (*PaymentLinkCheckoutResponse, error)
	HandleWebhook(ctx context.Context, id string, event string) error
	AutoExpireLinks(ctx context.Context) error
	CleanupExpiredLinks(ctx context.Context) error
}
