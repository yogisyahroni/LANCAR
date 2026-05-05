package repository

import (
	"context"
	"database/sql"
	"errors"
	"lancar/payment-service/internal/domain"
	"strconv"
	"time"

	"github.com/google/uuid"
)

type postgresWalletRepository struct {
	db     *sql.DB
	readDB *sql.DB
}

func NewPostgresWalletRepository(db, readDB *sql.DB) domain.WalletRepository {
	return &postgresWalletRepository{
		db:     db,
		readDB: readDB,
	}
}

func (r *postgresWalletRepository) GetByUserID(ctx context.Context, userID uuid.UUID) (*domain.Wallet, error) {
	// For Extreme Security, we check both tables but in practice, we should know the role.
	// We'll try customers first.
	query := `SELECT id, customer_id as user_id, balance, currency, version, created_at, updated_at FROM customer_wallets WHERE customer_id = $1`
	
	var w domain.Wallet
	err := r.readDB.QueryRowContext(ctx, query, userID).Scan(
		&w.ID, &w.UserID, &w.Balance, &w.Currency, &w.Version, &w.CreatedAt, &w.UpdatedAt,
	)
	
	if err == nil {
		return &w, nil
	}
	
	if err != sql.ErrNoRows {
		return nil, err
	}

	// Try couriers
	query = `SELECT id, courier_id as user_id, balance, currency, version, created_at, updated_at FROM courier_wallets WHERE courier_id = $1`
	err = r.readDB.QueryRowContext(ctx, query, userID).Scan(
		&w.ID, &w.UserID, &w.Balance, &w.Currency, &w.Version, &w.CreatedAt, &w.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	
	return &w, nil
}

func (r *postgresWalletRepository) Create(ctx context.Context, userID uuid.UUID) (*domain.Wallet, error) {
	// We need to know if it's a customer or courier. 
	// For now, we'll try to check the role in customers table first.
	var role string
	err := r.readDB.QueryRowContext(ctx, "SELECT 'customer' FROM customers WHERE id = $1", userID).Scan(&role)
	
	table := "customer_wallets"
	col := "customer_id"
	
	if err == sql.ErrNoRows {
		table = "courier_wallets"
		col = "courier_id"
	} else if err != nil {
		return nil, err
	}

	query := `INSERT INTO ` + table + ` (` + col + `) VALUES ($1) RETURNING id, ` + col + ` as user_id, balance, currency, version, created_at, updated_at`
	
	var w domain.Wallet
	err = r.db.QueryRowContext(ctx, query, userID).Scan(
		&w.ID, &w.UserID, &w.Balance, &w.Currency, &w.Version, &w.CreatedAt, &w.UpdatedAt,
	)
	
	if err != nil {
		return nil, err
	}
	
	return &w, nil
}

func (r *postgresWalletRepository) UpdateBalance(ctx context.Context, walletID uuid.UUID, amount float64, version int) error {
	// Try updating customer_wallets first
	query := `UPDATE customer_wallets SET balance = balance + $1, version = version + 1, updated_at = $2 
	          WHERE id = $3 AND version = $4`
	
	res, err := r.db.ExecContext(ctx, query, amount, time.Now(), walletID, version)
	if err == nil {
		if count, _ := res.RowsAffected(); count > 0 {
			return nil
		}
	}

	// Try courier_wallets
	query = `UPDATE courier_wallets SET balance = balance + $1, version = version + 1, updated_at = $2 
	          WHERE id = $3 AND version = $4`
	
	res, err = r.db.ExecContext(ctx, query, amount, time.Now(), walletID, version)
	if err != nil {
		return err
	}
	
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	
	if rows == 0 {
		return errors.New("concurrent update detected or wallet not found")
	}
	
	return nil
}

func (r *postgresWalletRepository) CreateTransaction(ctx context.Context, tx *domain.WalletTransaction) error {
	// Determine if wallet_id is customer or courier
	var exists bool
	err := r.readDB.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM customer_wallets WHERE id = $1)", tx.WalletID).Scan(&exists)
	
	table := "customer_wallet_transactions"
	if err != nil || !exists {
		table = "courier_wallet_transactions"
	}

	query := `INSERT INTO ` + table + ` (wallet_id, type, amount, fee, status, reference_id, metadata) 
	          VALUES ($1, $2, $3, $4, $5, $6, $7) 
	          RETURNING id, created_at, updated_at`
	
	err = r.db.QueryRowContext(ctx, query, 
		tx.WalletID, tx.Type, tx.Amount, tx.Fee, tx.Status, tx.ReferenceID, tx.Metadata,
	).Scan(&tx.ID, &tx.CreatedAt, &tx.UpdatedAt)
	
	return err
}

func (r *postgresWalletRepository) GetTransactions(ctx context.Context, walletID uuid.UUID, limit, offset int) ([]*domain.WalletTransaction, error) {
	// Try customer transactions first
	query := `SELECT id, wallet_id, type, amount, fee, status, reference_id, metadata, created_at, updated_at 
	          FROM customer_wallet_transactions WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`
	
	rows, err := r.readDB.QueryContext(ctx, query, walletID, limit, offset)
	if err != nil || rows.Err() != nil {
		// Try courier transactions
		query = `SELECT id, wallet_id, type, amount, fee, status, reference_id, metadata, created_at, updated_at 
		          FROM courier_wallet_transactions WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`
		rows, err = r.readDB.QueryContext(ctx, query, walletID, limit, offset)
		if err != nil {
			return nil, err
		}
	}
	defer rows.Close()
	
	var txs []*domain.WalletTransaction
	for rows.Next() {
		var tx domain.WalletTransaction
		err := rows.Scan(
			&tx.ID, &tx.WalletID, &tx.Type, &tx.Amount, &tx.Fee, &tx.Status, &tx.ReferenceID, &tx.Metadata, &tx.CreatedAt, &tx.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		txs = append(txs, &tx)
	}
	
	return txs, nil
}

// Settings Repository
func (r *postgresWalletRepository) GetSetting(ctx context.Context, key string) (string, error) {
	var value string
	// system_configs stores value as JSONB, we use #>> '{}' to get it as text
	err := r.readDB.QueryRowContext(ctx, "SELECT value #>> '{}' FROM system_configs WHERE key = $1", key).Scan(&value)
	return value, err
}

func (r *postgresWalletRepository) GetFee(ctx context.Context, role string) (float64, error) {
	key := "withdrawal_fee_customer"
	if role == "courier" {
		key = "withdrawal_fee_courier"
	}
	
	val, err := r.GetSetting(ctx, key)
	if err != nil {
		return 5000.0, nil // Fallback to safe default
	}
	
	fee, _ := strconv.ParseFloat(val, 64)
	return fee, nil
}
