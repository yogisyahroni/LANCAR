package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// SettlementStatus mendefinisikan state machine untuk escrow merchant.
// Lifecycle: HOLDING → PROCESSING → COMPLETED | FAILED | DISPUTED
type SettlementStatus string

const (
	SettlementStatusHolding    SettlementStatus = "HOLDING"
	SettlementStatusProcessing SettlementStatus = "PROCESSING"
	SettlementStatusCompleted  SettlementStatus = "COMPLETED"
	SettlementStatusFailed     SettlementStatus = "FAILED"
	SettlementStatusDisputed   SettlementStatus = "DISPUTED"
)

// MerchantSettlement adalah ledger escrow untuk setiap pembayaran payment link
// yang menunggu release ke merchant setelah POD dikonfirmasi oleh 3PL.
type MerchantSettlement struct {
	ID                uuid.UUID        `json:"id"`
	PaymentLinkID     string           `json:"payment_link_id"`
	MerchantID        string           `json:"merchant_id"`
	OrderID           string           `json:"order_id"`
	GrossItemPriceIDR  int64            `json:"gross_item_price_idr"`
	MerchantFeeIDR     int64            `json:"merchant_fee_idr"`
	DisbursementFeeIDR int64            `json:"disbursement_fee_idr"`
	NetPayoutIDR       int64            `json:"net_payout_idr"`
	Status             SettlementStatus `json:"status"`
	// IdempotencyKey = "settle-" + payment_link_id (satu PL hanya satu settlement)
	IdempotencyKey   string            `json:"idempotency_key"`
	PODConfirmedAt   *time.Time        `json:"pod_confirmed_at,omitempty"`
	HoldingReleaseAt *time.Time        `json:"holding_release_at,omitempty"`
	SettledAt        *time.Time        `json:"settled_at,omitempty"`
	DisbursementRef  string            `json:"disbursement_ref,omitempty"`
	FailureReason    string            `json:"failure_reason,omitempty"`
	RetryCount       int               `json:"retry_count"`
	// Metadata menyimpan audit trail: bank_snapshot pada saat disburse, admin_id jika manual
	Metadata         map[string]any    `json:"metadata"`
	CreatedByAdminID *uuid.UUID        `json:"created_by_admin_id,omitempty"`
	CreatedAt        time.Time         `json:"created_at"`
	UpdatedAt        time.Time         `json:"updated_at"`
}

// MerchantBankInfo adalah informasi rekening bank merchant
// yang diambil dari tabel users saat proses disbursement.
type MerchantBankInfo struct {
	UserID            uuid.UUID
	BankCode          *string
	BankAccountNumber *string
	BankAccountName   *string
	BankVerified      bool
}

// MerchantSettlementRepository mendefinisikan kontrak akses data untuk merchant_settlements.
type MerchantSettlementRepository interface {
	// Create menyimpan record settlement baru. Idempotency_key harus unik.
	Create(ctx context.Context, s *MerchantSettlement) error

	// GetByID mengambil settlement berdasarkan ID.
	GetByID(ctx context.Context, id uuid.UUID) (*MerchantSettlement, error)

	// GetByIdempotencyKey mengecek apakah settlement untuk payment link ini sudah ada.
	// Dipakai untuk idempotency check sebelum insert.
	GetByIdempotencyKey(ctx context.Context, key string) (*MerchantSettlement, error)

	// GetPendingHoldingReleased mengambil semua settlement HOLDING yang sudah melewati
	// holding_release_at. Menggunakan FOR UPDATE SKIP LOCKED untuk aman multi-instance.
	GetPendingHoldingReleased(ctx context.Context, now time.Time, limit int) ([]*MerchantSettlement, error)

	// AtomicSetStatus mengubah status secara atomik dengan optimistic locking.
	// Hanya berhasil jika status saat ini = fromStatus. Mengembalikan (true, nil) jika
	// berhasil, (false, nil) jika record sudah diubah oleh goroutine lain (idempotent skip).
	AtomicSetStatus(ctx context.Context, id uuid.UUID, fromStatus, toStatus SettlementStatus) (bool, error)

	// UpdateCompleted mencatat disbursement berhasil.
	UpdateCompleted(ctx context.Context, id uuid.UUID, disbursementRef string) error

	// UpdateFailed mencatat disbursement gagal + increment retry_count.
	UpdateFailed(ctx context.Context, id uuid.UUID, reason string) error

	// RequeueForRetry mengatur ulang status ke HOLDING dengan holding_release_at baru
	// untuk settlement yang gagal dan masih bisa di-retry.
	RequeueForRetry(ctx context.Context, id uuid.UUID, retryAt time.Time) error

	// ListByMerchantID mengambil daftar settlement untuk merchant tertentu (pagination).
	ListByMerchantID(ctx context.Context, merchantID string, limit, offset int) ([]*MerchantSettlement, error)

	// ListAll mengambil semua settlement dengan filter (untuk admin dashboard).
	ListAll(ctx context.Context, status string, limit, offset int) ([]*MerchantSettlement, error)

	// GetMerchantBankInfo mengambil info bank merchant dari tabel users.
	GetMerchantBankInfo(ctx context.Context, merchantID uuid.UUID) (*MerchantBankInfo, error)

	// GetOrderByAWB mengambil order berdasarkan nomor AWB (untuk lookup saat webhook diterima).
	GetOrderByAWB(ctx context.Context, awbNumber string) (*Order, error)

	// GetPaymentLinkByOrderID mengambil payment_link yang terkait dengan order.
	GetPaymentLinkByOrderID(ctx context.Context, orderID string) (*PaymentLink, error)

	// UpdateOrderDeliveryConfirmed mengupdate order setelah POD dikonfirmasi.
	UpdateOrderDeliveryConfirmed(ctx context.Context, orderID string, confirmedAt time.Time, podURL string) error
}

// MerchantSettlementService mendefinisikan use-case untuk merchant escrow settlement.
type MerchantSettlementService interface {
	// HandleDeliveryConfirmed dipanggil ketika webhook 3PL DELIVERED diterima.
	// Membuat merchant_settlement record (HOLDING) dan menjadwalkan release dana.
	HandleDeliveryConfirmed(ctx context.Context, req DeliveryConfirmedRequest) error

	// ProcessPendingSettlements adalah cron runner yang dijalankan tiap 5 menit.
	// Memproses semua HOLDING yang sudah melewati holding_release_at.
	ProcessPendingSettlements(ctx context.Context) error

	// ManualRelease adalah override oleh admin untuk bypass holding period.
	ManualRelease(ctx context.Context, settlementID uuid.UUID, adminID uuid.UUID) error

	// MarkDisputed menandai settlement sebagai DISPUTED (tahan dana karena sengketa).
	MarkDisputed(ctx context.Context, settlementID uuid.UUID, adminID uuid.UUID, reason string) error

	// GetByPaymentLink mengambil status settlement untuk payment link tertentu.
	GetByPaymentLink(ctx context.Context, paymentLinkID string) (*MerchantSettlement, error)

	// ListByMerchant mengambil daftar settlement untuk merchant (merchant dashboard).
	ListByMerchant(ctx context.Context, merchantID string, limit, offset int) ([]*MerchantSettlement, error)

	// ListAll mengambil semua settlement dengan filter (untuk admin dashboard).
	ListAll(ctx context.Context, status string, limit, offset int) ([]*MerchantSettlement, error)
}

// DeliveryConfirmedRequest adalah payload yang dikirim oleh integration-gateway
// ke order-service ketika webhook DELIVERED dari 3PL diterima.
type DeliveryConfirmedRequest struct {
	AWBNumber   string    `json:"awb_number"`
	Provider    string    `json:"provider"`
	PodURL      string    `json:"pod_url,omitempty"`
	ConfirmedAt time.Time `json:"confirmed_at"`
	// RawPayload menyimpan raw webhook body untuk audit trail
	RawPayload  string    `json:"raw_payload,omitempty"`
}
