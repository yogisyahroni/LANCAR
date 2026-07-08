package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"tembus/payment-service/internal/domain"
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
	var role string
	err := r.readDB.QueryRowContext(
		ctx,
		`SELECT role
		 FROM users
		 WHERE id = $1
		   AND deleted_at IS NULL`,
		userID,
	).Scan(&role)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("wallet owner %s was not found", userID)
	}
	if err != nil {
		return nil, err
	}

	// SECURITY 2026 — Cegah SQL Injection via Second-Order / Dynamic Table Name:
	// String concatenation untuk nama tabel (meski role dari DB) adalah anti-pattern.
	// Jika kolom `users.role` pernah terkompromi atau di-manipulasi melalui injection
	// di tempat lain, kode ini akan mengeksekusi SQL arbitrer.
	// Real incident: Second-order SQL injection via data dari DB (OWASP A03:2021).
	// Fix: gunakan allowlist eksplisit dengan switch-case — tidak ada concatenation.
	var query string
	switch role {
	case "customer":
		query = `INSERT INTO customer_wallets (customer_id) VALUES ($1)
		         RETURNING id, customer_id as user_id, balance, currency, version, created_at, updated_at`
	case "courier":
		query = `INSERT INTO courier_wallets (courier_id) VALUES ($1)
		         RETURNING id, courier_id as user_id, balance, currency, version, created_at, updated_at`
	default:
		return nil, fmt.Errorf("wallet owner role %q is not supported", role)
	}

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

func (r *postgresWalletRepository) IsRefundProcessed(ctx context.Context, referenceID string) (bool, error) {
	if referenceID == "" {
		return false, nil
	}
	var exists bool
	query := `SELECT EXISTS(SELECT 1 FROM customer_wallet_transactions WHERE reference_id = $1 AND type = 'REFUND')`
	err := r.readDB.QueryRowContext(ctx, query, referenceID).Scan(&exists)
	if err != nil || exists {
		return exists, err
	}
	query = `SELECT EXISTS(SELECT 1 FROM courier_wallet_transactions WHERE reference_id = $1 AND type = 'REFUND')`
	err = r.readDB.QueryRowContext(ctx, query, referenceID).Scan(&exists)
	return exists, err
}

// UpdateTransactionStatus memperbarui status transaksi (COMPLETED/FAILED) berdasarkan
// reference_id. Dipanggil oleh walletService setelah disbursement selesai/gagal.
// Mencoba customer_wallet_transactions terlebih dahulu, lalu courier_wallet_transactions.
func (r *postgresWalletRepository) UpdateTransactionStatus(ctx context.Context, referenceID string, status domain.TransactionStatus) error {
	if referenceID == "" {
		return errors.New("UpdateTransactionStatus: referenceID wajib diisi")
	}
	query := `UPDATE customer_wallet_transactions
	          SET status = $1, updated_at = NOW()
	          WHERE reference_id = $2`
	res, err := r.db.ExecContext(ctx, query, string(status), referenceID)
	if err != nil {
		return fmt.Errorf("UpdateTransactionStatus customer: %w", err)
	}
	if count, _ := res.RowsAffected(); count > 0 {
		return nil
	}
	// Coba tabel kurir
	query = `UPDATE courier_wallet_transactions
	         SET status = $1, updated_at = NOW()
	         WHERE reference_id = $2`
	res, err = r.db.ExecContext(ctx, query, string(status), referenceID)
	if err != nil {
		return fmt.Errorf("UpdateTransactionStatus courier: %w", err)
	}
	if count, _ := res.RowsAffected(); count == 0 {
		return fmt.Errorf("UpdateTransactionStatus: transaksi dengan reference_id %s tidak ditemukan", referenceID)
	}
	return nil
}

// IsWithdrawIdempotent memeriksa apakah idempotency_key sudah pernah dipakai
// untuk permintaan WITHDRAWAL. Ini mencegah replay attack / double-submit.
func (r *postgresWalletRepository) IsWithdrawIdempotent(ctx context.Context, idempotencyKey string) (bool, error) {
	if idempotencyKey == "" {
		return false, errors.New("IsWithdrawIdempotent: idempotencyKey wajib diisi")
	}
	var exists bool
	// Cek di customer wallet
	query := `SELECT EXISTS(
	    SELECT 1 FROM customer_wallet_transactions
	    WHERE metadata->>'idempotency_key' = $1
	    AND type = 'WITHDRAWAL'
	)`
	err := r.readDB.QueryRowContext(ctx, query, idempotencyKey).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("IsWithdrawIdempotent customer: %w", err)
	}
	if exists {
		return true, nil
	}
	// Cek di courier wallet
	query = `SELECT EXISTS(
	    SELECT 1 FROM courier_wallet_transactions
	    WHERE metadata->>'idempotency_key' = $1
	    AND type = 'WITHDRAWAL'
	)`
	err = r.readDB.QueryRowContext(ctx, query, idempotencyKey).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("IsWithdrawIdempotent courier: %w", err)
	}
	return exists, nil
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
		return 0, fmt.Errorf("fee setting %s is not configured: %w", key, err)
	}

	fee, err := strconv.ParseFloat(val, 64)
	if err != nil {
		return 0, fmt.Errorf("fee setting %s is invalid: %w", key, err)
	}
	return fee, nil
}
