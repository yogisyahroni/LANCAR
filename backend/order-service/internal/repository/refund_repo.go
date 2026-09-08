package repository

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"tembus/order-service/internal/domain"
)

type PostgresRefundRepo struct {
	db     *sqlx.DB
	readDb *sqlx.DB
}

func NewPostgresRefundRepo(db *sqlx.DB, readDb *sqlx.DB) *PostgresRefundRepo {
	if readDb == nil {
		readDb = db // fallback to primary if read replica is not provided
	}
	return &PostgresRefundRepo{db: db, readDb: readDb}
}

func (r *PostgresRefundRepo) CreateRefund(ctx context.Context, record *domain.RefundRecord) error {
	record.ApplyMoneyContract()
	breakdown := record.CancellationFeeBreakdown
	if len(breakdown) == 0 {
		breakdown = json.RawMessage(`{}`)
	}
	query := `
		INSERT INTO refunds (
			id, order_id, user_id, payment_id, currency_code, currency_minor_unit, amount_minor,
			amount_idr, reason, status, refund_percentage, tax_reversal_minor, platform_fee_reversal_minor,
			tax_reversal_idr, platform_fee_reversal_idr, cancellation_policy_version, cancellation_fee_minor,
			cancellation_fee_idr, cancellation_fee_breakdown, ledger_journal_id, tax_rule_version, tax_jurisdiction, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
		)
	`
	_, err := r.db.ExecContext(ctx, query,
		record.ID, record.OrderID, record.UserID, record.PaymentID, record.Currency, record.CurrencyMinorUnit, record.AmountMinor,
		record.AmountIDR, record.Reason, record.Status, record.RefundPercentage, record.TaxReversalMinor,
		record.PlatformFeeReversalMinor, record.TaxReversalIDR, record.PlatformFeeReversalIDR,
		record.CancellationPolicyVersion, record.CancellationFeeMinor, record.CancellationFeeIDR,
		breakdown, record.LedgerJournalID, record.TaxRuleVersion, record.TaxJurisdiction, record.CreatedAt, record.UpdatedAt,
	)
	return err
}

func (r *PostgresRefundRepo) UpdateRefundStatus(ctx context.Context, id uuid.UUID, status domain.RefundStatus, ref *string, errReason *string) error {
	query := `
		UPDATE refunds 
		SET status = $1, gateway_ref = $2, failure_reason = $3, updated_at = NOW()
		WHERE id = $4
	`
	_, err := r.db.ExecContext(ctx, query, status, ref, errReason, id)
	return err
}

// refundColumns — kolom eksplisit refunds sesuai struct domain.RefundRecord.
// (UAT F8-AN-070: SELECT * gagal "missing destination name payment_id" —
// tabel punya payment_id/user_id/processed_at yang tidak ada di struct.)
const refundColumns = `id, order_id, currency_code, currency_minor_unit, amount_minor, amount_idr, reason, status, refund_percentage,
	tax_reversal_minor, platform_fee_reversal_minor, tax_reversal_idr, platform_fee_reversal_idr, cancellation_policy_version,
	cancellation_fee_minor, cancellation_fee_idr, cancellation_fee_breakdown, ledger_journal_id, gateway_ref,
	failure_reason, tax_rule_version, tax_jurisdiction, created_at, updated_at`

func (r *PostgresRefundRepo) GetRefundsByOrder(ctx context.Context, orderID uuid.UUID) ([]domain.RefundRecord, error) {
	query := `
		SELECT ` + refundColumns + ` FROM refunds 
		WHERE order_id = $1
		ORDER BY created_at ASC
	`
	var records []domain.RefundRecord
	err := r.readDb.SelectContext(ctx, &records, query, orderID)
	return records, err
}

func (r *PostgresRefundRepo) GetPendingRefunds(ctx context.Context) ([]domain.RefundRecord, error) {
	query := `
		SELECT ` + refundColumns + ` FROM refunds 
		WHERE status = 'pending'
		ORDER BY created_at ASC
	`
	var records []domain.RefundRecord
	err := r.readDb.SelectContext(ctx, &records, query)
	return records, err
}
