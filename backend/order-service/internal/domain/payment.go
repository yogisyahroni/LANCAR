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
	ProviderVerifiedAt    *time.Time      `json:"provider_verified_at,omitempty" db:"provider_verified_at"`
	Purpose               string          `json:"purpose" db:"purpose"`
	ServiceAdjustmentID   *string         `json:"service_adjustment_id,omitempty" db:"service_adjustment_id"`
	ID                    string          `json:"id" db:"id"`
	OrderID               string          `json:"order_id" db:"order_id"`
	PaymentNumber         string          `json:"payment_number" db:"payment_number"`
	Provider              PaymentProvider `json:"provider" db:"provider"`
	Method                string          `json:"method" db:"method"`
	Status                PaymentStatus   `json:"status" db:"status"`
	Currency              string          `json:"currency" db:"currency_code"`
	CurrencyMinorUnit     int             `json:"currency_minor_unit" db:"currency_minor_unit"`
	AmountMinor           int64           `json:"amount_minor" db:"amount_minor"`
	MDRAmountMinor        int64           `json:"mdr_amount_minor" db:"mdr_amount_minor"`
	PPNAmountMinor        int64           `json:"ppn_amount_minor" db:"ppn_amount_minor"`
	WeatherReserveMinor   int64           `json:"weather_reserve_minor" db:"weather_reserve_minor"`
	InsuranceReserveMinor int64           `json:"insurance_reserve_minor" db:"insurance_reserve_minor"`
	NetOperationalMinor   int64           `json:"net_operational_minor" db:"net_operational_minor"`
	AmountIDR             int             `json:"amount_idr" db:"amount_idr"`
	MDRAmountIDR          int             `json:"mdr_amount_idr" db:"mdr_amount_idr"`
	PPNAmountIDR          int             `json:"ppn_amount_idr" db:"ppn_amount_idr"`
	WeatherReserveIDR     int             `json:"weather_reserve_idr" db:"weather_reserve_idr"`
	InsuranceReserveIDR   int             `json:"insurance_reserve_idr" db:"insurance_reserve_idr"`
	NetOperationalIDR     int             `json:"net_operational_idr" db:"net_operational_idr"`
	TaxRuleCode           *string         `json:"tax_rule_code,omitempty" db:"tax_rule_code"`
	TaxRuleVersion        *string         `json:"tax_rule_version,omitempty" db:"tax_rule_version"`
	TaxJurisdiction       *string         `json:"tax_jurisdiction,omitempty" db:"tax_jurisdiction"`
	PPNRateEffectivePct   float64         `json:"ppn_rate_effective_pct,omitempty" db:"ppn_rate_effective_pct"`
	PPNRateStatutoryPct   float64         `json:"ppn_rate_statutory_pct,omitempty" db:"ppn_rate_statutory_pct"`
	DPPIDR                int             `json:"dpp_idr,omitempty" db:"dpp_idr"`
	TaxInvoiceRequired    bool            `json:"tax_invoice_required,omitempty" db:"tax_invoice_required"`
	TaxInvoiceStatus      *string         `json:"tax_invoice_status,omitempty" db:"tax_invoice_status"`
	ProviderReference     *string         `json:"provider_reference" db:"provider_reference"`
	QRCodeURL             *string         `json:"qr_code_url" db:"qr_code_url"`
	QRCodeString          *string         `json:"qr_code_string" db:"qr_code_string"`
	WebhookPayload        []byte          `json:"webhook_payload" db:"webhook_payload"` // JSONB
	SnapToken             *string         `json:"snap_token,omitempty" db:"snap_token"`
	RedirectURL           *string         `json:"redirect_url,omitempty" db:"redirect_url"`
	ClientKey             *string         `json:"client_key,omitempty" db:"client_key"`
	SnapJSURL             *string         `json:"snap_js_url,omitempty" db:"snap_js_url"`
	BatchID               *string         `json:"batch_id,omitempty" db:"batch_id"`
	ExpiresAt             time.Time       `json:"expires_at" db:"expires_at"`
	PaidAt                *time.Time      `json:"paid_at" db:"paid_at"`
	CreatedAt             time.Time       `json:"created_at" db:"created_at"`
	UpdatedAt             time.Time       `json:"updated_at" db:"updated_at"`
}

type PaymentGatewayRequest struct {
	OrderID           string
	PaymentNumber     string
	AmountIDR         int
	AmountMinor       int64
	Currency          string
	CurrencyMinorUnit int
}

type PaymentGatewayResponse struct {
	ProviderReference string
	QRCodeURL         string
	QRCodeString      string
}

type SnapRequest struct {
	OrderID           string
	AmountIDR         int
	AmountMinor       int64
	Currency          string
	CurrencyMinorUnit int
	ItemName          string
	CustomerName      string
}

type SnapResponse struct {
	Token       string
	RedirectURL string
}

type PaymentGateway interface {
	GenerateQRIS(ctx context.Context, req PaymentGatewayRequest) (PaymentGatewayResponse, error)
	GenerateSnap(ctx context.Context, req SnapRequest) (SnapResponse, error)
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

// RoadsideCollectionRepository owns the verified adjustment payment lifecycle.
type RoadsideCollectionRepository interface {
	ReserveRoadsideAdjustmentPayment(ctx context.Context, adjustmentID, customerID string) (*Payment, bool, error)
	SaveRoadsideGatewayResult(ctx context.Context, paymentID string, result PaymentGatewayResponse, mdrIDR, ppnIDR int64) (*Payment, error)
	ApplyRoadsideAdjustmentWebhook(ctx context.Context, paymentNumber string, status PaymentStatus, amountIDR int64, providerRef string, payload []byte) error
}

type RoadsideCollectionService interface {
	Start(ctx context.Context, adjustmentID, customerID string) (*Payment, error)
	ApplyVerifiedWebhook(ctx context.Context, paymentNumber string, status PaymentStatus, amountIDR int64, providerRef string, payload []byte) error
}

// VerifiedPaymentUpdate can only be called after authenticating a provider notice.
// It is deliberately separate from the legacy administrative UpdateStatus method.
type VerifiedPaymentUpdate struct {
	PaymentID         string
	PaymentNumber     string
	ProviderReference string
	AmountIDR         int64
	AmountMinor       int64
	Currency          string
	Status            PaymentStatus
	Payload           []byte
}
