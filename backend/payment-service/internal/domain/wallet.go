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
	Balance   int64     `json:"balance" db:"balance"`
	Currency  string    `json:"currency" db:"currency"`
	Version   int       `json:"version" db:"version"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

type WalletTransaction struct {
	ID          uuid.UUID         `json:"id" db:"id"`
	WalletID    uuid.UUID         `json:"wallet_id" db:"wallet_id"`
	Type        TransactionType   `json:"type" db:"type"`
	Amount      int64             `json:"amount" db:"amount"`
	Fee         int64             `json:"fee" db:"fee"`
	Status      TransactionStatus `json:"status" db:"status"`
	ReferenceID string            `json:"reference_id" db:"reference_id"`
	Metadata    map[string]any    `json:"metadata" db:"metadata"`
	CreatedAt   time.Time         `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at" db:"updated_at"`
}

type WalletRepository interface {
	GetByUserID(ctx context.Context, userID uuid.UUID) (*Wallet, error)
	GetByID(ctx context.Context, id uuid.UUID) (*Wallet, error)
	Create(ctx context.Context, userID uuid.UUID) (*Wallet, error)
	UpdateBalance(ctx context.Context, walletID uuid.UUID, amount int64, version int) error
	CreateTransaction(ctx context.Context, tx *WalletTransaction) error
	GetTransactions(ctx context.Context, walletID uuid.UUID, limit, offset int) ([]*WalletTransaction, error)
	GetTransactionByReferenceID(ctx context.Context, referenceID string) (*WalletTransaction, error)
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

	// Universal Idempotency & Reconciliation methods (PAY-001 & PAY-002)
	RecordUniversalIdempotency(ctx context.Context, key string, opType string, reqHash string, respHash string, respPayload []byte) error
	GetUniversalIdempotency(ctx context.Context, key string, opType string) ([]byte, bool, error)
	ReconcileWalletLedger(ctx context.Context, walletID uuid.UUID, walletType string) (*WalletReconciliationResult, error)

	// WithTx runs the given function within a database transaction.
	WithTx(ctx context.Context, fn func(txCtx context.Context) error) error
}

type WalletReconciliationResult struct {
	WalletID         uuid.UUID `json:"wallet_id"`
	WalletType       string    `json:"wallet_type"`
	WalletBalanceIDR int64     `json:"wallet_balance_idr"`
	LedgerSumIDR     int64     `json:"ledger_sum_idr"`
	MismatchIDR      int64     `json:"mismatch_idr"`
	Status           string    `json:"status"` // matched, mismatched, repaired
	ReconciledAt     time.Time `json:"reconciled_at"`
}

type SettingsRepository interface {
	GetSetting(ctx context.Context, key string) (string, error)
	GetFee(ctx context.Context, role string) (int64, error)
}

type WalletService interface {
	GetBalance(ctx context.Context, userID uuid.UUID) (*Wallet, error)
	CreateTopUp(ctx context.Context, userID uuid.UUID, amount int64) (string, error)
	Deposit(ctx context.Context, userID uuid.UUID, amount int64, referenceID string) error
	// Withdraw menerima WithdrawRequest yang sudah tervalidasi penuh di handler layer.
	// Tidak ada parameter map[string]any yang tidak tervalidasi — zero-trust.
	Withdraw(ctx context.Context, userID uuid.UUID, userRole string, req WithdrawRequest) error
	ProcessPayment(ctx context.Context, userID uuid.UUID, amount int64, orderID string) error
	Refund(ctx context.Context, userID uuid.UUID, amount int64, orderID string) error
	DeductFakeSosPenalty(ctx context.Context, victimID uuid.UUID, amount int64, referenceID string) error
	CreditSosHelperReward(ctx context.Context, helperID uuid.UUID, amount int64, referenceID string) error
	ReconcileWallet(ctx context.Context, userID uuid.UUID, walletType string) (*WalletReconciliationResult, error)
	HandleTopUpCallback(ctx context.Context, referenceID string) error
	HandleDisbursementCallback(ctx context.Context, referenceID string, status string) error
}

