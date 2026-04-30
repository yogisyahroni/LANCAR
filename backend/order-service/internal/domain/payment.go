package domain

import (
	"context"
	"time"
)

type PaymentStatus string

const (
	PaymentStatusPending PaymentStatus = "pending"
	PaymentStatusPaid    PaymentStatus = "paid"
	PaymentStatusFailed  PaymentStatus = "failed"
	PaymentStatusExpired PaymentStatus = "expired"
)

type PaymentProvider string

const (
	ProviderMidtrans PaymentProvider = "midtrans"
	ProviderXendit   PaymentProvider = "xendit"
)

type Payment struct {
	ID                  string          `json:"id" db:"id"`
	OrderID             string          `json:"order_id" db:"order_id"`
	PaymentNumber       string          `json:"payment_number" db:"payment_number"`
	Provider            PaymentProvider `json:"provider" db:"provider"`
	Method              string          `json:"method" db:"method"`
	Status              PaymentStatus   `json:"status" db:"status"`
	AmountIDR           int             `json:"amount_idr" db:"amount_idr"`
	MDRAmountIDR        int             `json:"mdr_amount_idr" db:"mdr_amount_idr"`
	PPNAmountIDR        int             `json:"ppn_amount_idr" db:"ppn_amount_idr"`
	WeatherReserveIDR   int             `json:"weather_reserve_idr" db:"weather_reserve_idr"`
	InsuranceReserveIDR int             `json:"insurance_reserve_idr" db:"insurance_reserve_idr"`
	NetOperationalIDR   int             `json:"net_operational_idr" db:"net_operational_idr"`
	ProviderReference   *string         `json:"provider_reference" db:"provider_reference"`
	QRCodeURL           *string         `json:"qr_code_url" db:"qr_code_url"`
	QRCodeString        *string         `json:"qr_code_string" db:"qr_code_string"`
	WebhookPayload      []byte          `json:"webhook_payload" db:"webhook_payload"` // JSONB
	ExpiresAt           time.Time       `json:"expires_at" db:"expires_at"`
	PaidAt              *time.Time      `json:"paid_at" db:"paid_at"`
	CreatedAt           time.Time       `json:"created_at" db:"created_at"`
	UpdatedAt           time.Time       `json:"updated_at" db:"updated_at"`
}

type PaymentGatewayRequest struct {
	OrderID       string
	PaymentNumber string
	AmountIDR     int
}

type PaymentGatewayResponse struct {
	ProviderReference string
	QRCodeURL         string
	QRCodeString      string
}

type PaymentGateway interface {
	GenerateQRIS(ctx context.Context, req PaymentGatewayRequest) (PaymentGatewayResponse, error)
	VerifyWebhookSignature(ctx context.Context, payload []byte, signature string) error
}

type PaymentRepository interface {
	Create(ctx context.Context, p *Payment) error
	GetByID(ctx context.Context, id string) (*Payment, error)
	GetByOrderID(ctx context.Context, orderID string) (*Payment, error)
	GetByPaymentNumber(ctx context.Context, paymentNumber string) (*Payment, error)
	UpdateStatus(ctx context.Context, id string, status PaymentStatus, paidAt *time.Time, providerRef *string, webhookPayload []byte) error
}

type PaymentService interface {
	CreatePayment(ctx context.Context, orderID string) (*Payment, error)
	HandleWebhook(ctx context.Context, payload []byte, signature string) error
	GetPaymentStatus(ctx context.Context, orderID string) (*Payment, error)
}
