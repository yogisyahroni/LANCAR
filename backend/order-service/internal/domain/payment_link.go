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
	DropoffCity       string            `json:"dropoff_city,omitempty"`
	DropoffZipCode    string            `json:"dropoff_zip_code,omitempty"`
	DropoffLat        float64           `json:"dropoff_lat"`
	DropoffLng        float64           `json:"dropoff_lng"`
	Status            PaymentLinkStatus `json:"status"`
	ExpiredAt         time.Time         `json:"expired_at"`
	DeletedAt         *time.Time        `json:"deleted_at,omitempty"`
	EstimateID        string            `json:"estimate_id,omitempty"`
	OrderID           string            `json:"order_id,omitempty"`
	ServiceCode       string            `json:"service_code,omitempty"`
	PickupAddress     string            `json:"pickup_address,omitempty"`
	PickupCity        string            `json:"pickup_city,omitempty"`
	PickupZipCode     string            `json:"pickup_zip_code,omitempty"`
	PickupLat         float64           `json:"pickup_lat,omitempty"`
	PickupLng         float64           `json:"pickup_lng,omitempty"`
	DeliveryFeeAmount int64             `json:"delivery_fee_amount"`
	StoreName         string            `json:"store_name,omitempty"`
	// RecipientPhone adalah nomor HP konsignee (penerima paket) — opsional.
	// Dipakai untuk broadcast WhatsApp saat link pembayaran berhasil dibuat.
	RecipientPhone       string    `json:"recipient_phone,omitempty"`
	RecipientName        string    `json:"recipient_name,omitempty"`
	LogisticsProvider    string    `json:"logistics_provider,omitempty"`
	LogisticsServiceType string    `json:"logistics_service_type,omitempty"`
	AggregatorQuoteID    string    `json:"aggregator_quote_id,omitempty"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
	PaymentURL           string    `json:"payment_url,omitempty"`
}

type PaymentLinkRepository interface {
	Create(ctx context.Context, link *PaymentLink) error
	GetByID(ctx context.Context, id string) (*PaymentLink, error)
	UpdateStatus(ctx context.Context, id string, status PaymentLinkStatus) error
	// AtomicMarkPaid mengubah status PENDING → PAID secara atomik menggunakan
	// UPDATE WHERE status='PENDING' RETURNING id. Mengembalikan (true, nil) jika
	// berhasil (link ditemukan & statusnya PENDING), atau (false, nil) jika link
	// sudah diproses sebelumnya (idempotent). Error jika terjadi DB failure.
	AtomicMarkPaid(ctx context.Context, id string) (bool, error)
	UpdateOrderID(ctx context.Context, id string, orderID string) error
	ListByMerchantID(ctx context.Context, merchantID string, limit, offset int) ([]*PaymentLink, error)
	MarkExpired(ctx context.Context, before time.Time) (int64, error)
	SoftDeleteExpiredLinks(ctx context.Context, olderThan time.Time) (int64, error)
	CreateAggregatorRateQuote(ctx context.Context, quote *AggregatorRateQuote) error
	GetValidAggregatorRateQuote(ctx context.Context, id string, now time.Time) (*AggregatorRateQuote, error)
}

type CreatePaymentLinkRequest struct {
	ItemName     string `json:"item_name" validate:"required"`
	ItemPrice    int64  `json:"item_price" validate:"required,gt=0"`
	ItemImageURL string `json:"item_image_url" validate:"required"`
	// ServiceCode wajib untuk mode on-demand (kode layanan kurir p2p).
	// Untuk mode 3PL, field ini boleh kosong — yang dipakai adalah LogisticsServiceType.
	ServiceCode    string  `json:"service_code,omitempty"`
	PickupAddress  string  `json:"pickup_address" validate:"required"`
	PickupCity     string  `json:"pickup_city,omitempty"`
	PickupZipCode  string  `json:"pickup_zip_code,omitempty"`
	PickupLat      float64 `json:"pickup_lat" validate:"required"`
	PickupLng      float64 `json:"pickup_lng" validate:"required"`
	DropoffAddress string  `json:"dropoff_address" validate:"required"`
	DropoffCity    string  `json:"dropoff_city,omitempty"`
	DropoffZipCode string  `json:"dropoff_zip_code,omitempty"`
	DropoffLat     float64 `json:"dropoff_lat" validate:"required"`
	DropoffLng     float64 `json:"dropoff_lng" validate:"required"`
	StoreName      string  `json:"store_name,omitempty"`
	// RecipientPhone (opsional) — nomor HP konsignee untuk notifikasi WhatsApp.
	RecipientPhone string `json:"recipient_phone,omitempty"`
	RecipientName  string `json:"recipient_name,omitempty"`
	// LogisticsProvider & LogisticsServiceType hanya wajib jika menggunakan mode 3PL.
	// Untuk mode on-demand (kurir internal), kedua field ini dikosongkan.
	// Validasi mode 3PL dilakukan di service layer.
	LogisticsProvider    string `json:"logistics_provider,omitempty"`
	LogisticsServiceType string `json:"logistics_service_type,omitempty"`
	AggregatorQuoteID    string `json:"aggregator_quote_id,omitempty"`
}

// AWBRequest adalah request pembuatan AWB ke integration-gateway.
type AWBRequest struct {
	Provider        string        `json:"provider"` // "jne" atau "jnt"
	IdempotencyKey  string        `json:"idempotency_key,omitempty"`
	FirstMileMode   FirstMileMode `json:"first_mile_mode,omitempty"`
	ReferenceID     string        `json:"reference_id"`
	SenderAlias     string        `json:"sender_alias"` // dari users.awb_sender_name
	SenderName      string        `json:"sender_name"`
	SenderPhone     string        `json:"sender_phone"`
	SenderAddress   string        `json:"sender_address"`
	SenderCity      string        `json:"sender_city"`
	SenderZipCode   string        `json:"sender_zip_code"`
	ReceiverName    string        `json:"receiver_name"`
	ReceiverPhone   string        `json:"receiver_phone"`
	ReceiverAddress string        `json:"receiver_address"`
	ReceiverCity    string        `json:"receiver_city"`
	ReceiverZipCode string        `json:"receiver_zip_code"`
	OriginCode      string        `json:"origin_code"`
	DestinationCode string        `json:"destination_code"`
	WeightKG        float64       `json:"weight_kg"`
	ItemDescription string        `json:"item_description"`
	ItemValue       float64       `json:"item_value"`
	ServiceType     string        `json:"service_type"`
}

// AWBResponse adalah respons dari integration-gateway setelah AWB dibuat.
type AWBResponse struct {
	AWBNumber   string `json:"awb_number"`
	Provider    string `json:"provider"`
	ServiceType string `json:"service_type"`
	BookingCode string `json:"booking_code"`
	TrackingURL string `json:"tracking_url"`
}

// AWBClient adalah port (interface) untuk komunikasi ke integration-gateway.
// Implementasi nyata melakukan HTTP call. Test dapat menggunakan mock.
type AWBClient interface {
	CreateAWB(ctx context.Context, req AWBRequest) (*AWBResponse, error)
	SendWhatsApp(ctx context.Context, to, message string) error
	CheckTariff(ctx context.Context, req CheckTariffRequest) (*CheckTariffResponse, error)
}

type CheckTariffRequest struct {
	Provider        string  `json:"provider"`
	OriginCode      string  `json:"origin"`
	DestinationCode string  `json:"destination"`
	WeightKG        float64 `json:"weight"`
	LengthCM        float64 `json:"length_cm,omitempty"`
	WidthCM         float64 `json:"width_cm,omitempty"`
	HeightCM        float64 `json:"height_cm,omitempty"`
	ItemValueIDR    int64   `json:"item_value_idr,omitempty"`
	Category        string  `json:"category,omitempty"`
	Insurance       bool    `json:"insurance,omitempty"`
	COD             bool    `json:"cod,omitempty"`
}

type CheckTariffResponse struct {
	Provider         string                `json:"provider"`
	Origin           string                `json:"origin"`
	Dest             string                `json:"destination"`
	Weight           float64               `json:"weight"`
	ChargeableWeight float64               `json:"chargeable_weight_kg,omitempty"`
	RuleVersion      string                `json:"rule_version,omitempty"`
	ExpiresAt        time.Time             `json:"expires_at,omitempty"`
	Services         []TariffServiceOption `json:"services"`
}

type TariffServiceOption struct {
	ServiceCode       string  `json:"service_code"`
	ServiceName       string  `json:"service_name"`
	TariffGross       int64   `json:"tariff_gross"`
	TariffNet         int64   `json:"tariff_net"`
	DiscountPct       float64 `json:"discount_pct"`
	MarkupPct         float64 `json:"markup_pct"`
	ETD               string  `json:"etd"`
	ETDSource         string  `json:"etd_source,omitempty"`
	QuoteID           string  `json:"quote_id,omitempty"`
	CustomerTariffIDR int64   `json:"customer_tariff_idr,omitempty"`
}

// AggregatorRateQuote is an immutable server-owned snapshot of one native
// carrier service shown during rate comparison. Clients may select it by ID,
// but may not supply or override its monetary fields.
type AggregatorRateQuote struct {
	ID                 string    `json:"id"`
	ProviderCode       string    `json:"provider_code"`
	OriginCode         string    `json:"origin_code"`
	DestinationCode    string    `json:"destination_code"`
	ChargeableWeightKG float64   `json:"chargeable_weight_kg"`
	LengthCM           float64   `json:"length_cm,omitempty"`
	WidthCM            float64   `json:"width_cm,omitempty"`
	HeightCM           float64   `json:"height_cm,omitempty"`
	ItemValueIDR       int64     `json:"item_value_idr,omitempty"`
	Category           string    `json:"category,omitempty"`
	Insurance          bool      `json:"insurance"`
	COD                bool      `json:"cod"`
	ServiceCode        string    `json:"service_code"`
	ServiceName        string    `json:"service_name"`
	NormalizedCategory string    `json:"normalized_category,omitempty"`
	TariffGrossIDR     int64     `json:"tariff_gross_idr"`
	TariffNetIDR       int64     `json:"tariff_net_idr"`
	CustomerTariffIDR  int64     `json:"customer_tariff_idr"`
	ETA                string    `json:"eta,omitempty"`
	ETASource          string    `json:"eta_source,omitempty"`
	RuleVersion        string    `json:"rule_version"`
	ExpiresAt          time.Time `json:"expires_at"`
	CreatedAt          time.Time `json:"created_at"`
}

type AggregatorRateQuoteService interface {
	Quote(ctx context.Context, req CheckTariffRequest) (*CheckTariffResponse, error)
	ValidateSelection(ctx context.Context, quoteID, providerCode, serviceCode string) (*AggregatorRateQuote, error)
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
	CheckTariff(ctx context.Context, provider, origin, dest string, weight float64) (*CheckTariffResponse, error)
	HandleWebhook(ctx context.Context, id string, event string) error
	AutoExpireLinks(ctx context.Context) error
	CleanupExpiredLinks(ctx context.Context) error
}
