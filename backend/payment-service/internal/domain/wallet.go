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
}

type SettingsRepository interface {
	GetSetting(ctx context.Context, key string) (string, error)
	GetFee(ctx context.Context, role string) (float64, error)
}

type WalletService interface {
	GetBalance(ctx context.Context, userID uuid.UUID) (*Wallet, error)
	CreateTopUp(ctx context.Context, userID uuid.UUID, amount float64) (string, error)
	Deposit(ctx context.Context, userID uuid.UUID, amount float64, referenceID string) error
	Withdraw(ctx context.Context, userID uuid.UUID, userRole string, amount float64, bankDetails map[string]any) error
	ProcessPayment(ctx context.Context, userID uuid.UUID, amount float64, orderID string) error
	Refund(ctx context.Context, userID uuid.UUID, amount float64, orderID string) error
}
