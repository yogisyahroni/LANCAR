package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type TransactionType string
type TransactionStatus string

const (
	TypeDeposit    TransactionType = "DEPOSIT"
	TypeWithdrawal TransactionType = "WITHDRAWAL"
	TypePayment    TransactionType = "PAYMENT"
	TypeRefund     TransactionType = "REFUND"
	TypeAdjustment TransactionType = "ADJUSTMENT"

	StatusPending   TransactionStatus = "PENDING"
	StatusCompleted TransactionStatus = "COMPLETED"
	StatusFailed    TransactionStatus = "FAILED"
	StatusRejected  TransactionStatus = "REJECTED"
)

type Wallet struct {
	ID        uuid.UUID `json:"id" db:"id"`
	UserID    uuid.UUID `json:"user_id" db:"user_id"`
	Balance   float64   `json:"balance" db:"balance"`
	Currency  string    `json:"currency" db:"currency"`
	Version   int       `json:"version" db:"version"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

type WalletTransaction struct {
	ID          uuid.UUID         `json:"id" db:"id"`
	WalletID    uuid.UUID         `json:"wallet_id" db:"wallet_id"`
	Type        TransactionType   `json:"type" db:"type"`
	Amount      float64           `json:"amount" db:"amount"`
	Fee         float64           `json:"fee" db:"fee"`
	Status      TransactionStatus `json:"status" db:"status"`
	ReferenceID string            `json:"reference_id" db:"reference_id"`
	Metadata    map[string]any    `json:"metadata" db:"metadata"`
	CreatedAt   time.Time         `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at" db:"updated_at"`
}

type WalletRepository interface {
	GetByUserID(ctx context.Context, userID uuid.UUID) (*Wallet, error)
	Create(ctx context.Context, userID uuid.UUID) (*Wallet, error)
	UpdateBalance(ctx context.Context, walletID uuid.UUID, amount float64, version int) error
	CreateTransaction(ctx context.Context, tx *WalletTransaction) error
	GetTransactions(ctx context.Context, walletID uuid.UUID, limit, offset int) ([]*WalletTransaction, error)
	IsRefundProcessed(ctx context.Context, referenceID string) (bool, error)

	// HasActiveSOS mengecek apakah ada SOS incident aktif (belum resolve) untuk user ini.
	// CEL-NEW #5: SOS Emergency Fund Ghosting
	HasActiveSOS(ctx context.Context, userID uuid.UUID) (bool, error)

	// UpdateTransactionStatus memperbarui status transaksi berdasarkan referenceID.
	// Dipanggil setelah disbursement berhasil (COMPLETED) atau gagal (FAILED).
	UpdateTransactionStatus(ctx context.Context, referenceID string, status TransactionStatus) error

	// IsWithdrawIdempotent memeriksa apakah idempotency_key sudah pernah digunakan
	// untuk mencegah double-submit dari client (replay attack).
	IsWithdrawIdempotent(ctx context.Context, idempotencyKey string) (bool, error)

	// WithTx runs the given function within a database transaction.
	WithTx(ctx context.Context, fn func(txCtx context.Context) error) error
}

type SettingsRepository interface {
	GetSetting(ctx context.Context, key string) (string, error)
	GetFee(ctx context.Context, role string) (float64, error)
}

type WalletService interface {
	GetBalance(ctx context.Context, userID uuid.UUID) (*Wallet, error)
	CreateTopUp(ctx context.Context, userID uuid.UUID, amount float64) (string, error)
	Deposit(ctx context.Context, userID uuid.UUID, amount float64, referenceID string) error
	// Withdraw menerima WithdrawRequest yang sudah tervalidasi penuh di handler layer.
	// Tidak ada parameter map[string]any yang tidak tervalidasi — zero-trust.
	Withdraw(ctx context.Context, userID uuid.UUID, userRole string, req WithdrawRequest) error
	ProcessPayment(ctx context.Context, userID uuid.UUID, amount float64, orderID string) error
	Refund(ctx context.Context, userID uuid.UUID, amount float64, orderID string) error
	DeductFakeSosPenalty(ctx context.Context, victimID uuid.UUID, amount float64, referenceID string) error
	CreditSosHelperReward(ctx context.Context, helperID uuid.UUID, amount float64, referenceID string) error
}
