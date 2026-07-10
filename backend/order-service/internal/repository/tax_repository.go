package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/jmoiron/sqlx"
	"tembus/order-service/internal/domain"
)

type PostgresTaxRepository struct {
	primaryDB *sqlx.DB
	replicaDB *sqlx.DB
}

func NewPostgresTaxRepository(primaryDB *sqlx.DB, replicaDB *sqlx.DB) *PostgresTaxRepository {
	return &PostgresTaxRepository{
		primaryDB: primaryDB,
		replicaDB: replicaDB,
	}
}

func (r *PostgresTaxRepository) GetActiveRuleByCode(ctx context.Context, code string) (*domain.TaxRule, error) {
	query := `
		SELECT id, code, name, tax_type, effective_rate_pct, statutory_rate_pct, dpp_formula, invoice_required, effective_from, effective_to
		FROM tax_rules
		WHERE code = $1
		  AND effective_from <= $2
		  AND (effective_to IS NULL OR effective_to > $2)
		ORDER BY effective_from DESC
		LIMIT 1
	`
	
	now := time.Now()
	var rule domain.TaxRule
	
	err := r.replicaDB.GetContext(ctx, &rule, query, code, now)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	
	return &rule, nil
}

// GetDefaultPPNRule is a helper to get the default PPN rule if a specific code is not provided.
func (r *PostgresTaxRepository) GetDefaultPPNRule(ctx context.Context) (*domain.TaxRule, error) {
	query := `
		SELECT id, code, name, tax_type, effective_rate_pct, statutory_rate_pct, dpp_formula, invoice_required, effective_from, effective_to
		FROM tax_rules
		WHERE tax_type = 'PPN'
		  AND effective_from <= $1
		  AND (effective_to IS NULL OR effective_to > $1)
		ORDER BY effective_from DESC
		LIMIT 1
	`
	
	now := time.Now()
	var rule domain.TaxRule
	
	err := r.replicaDB.GetContext(ctx, &rule, query, now)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	
	return &rule, nil
}

func (r *PostgresTaxRepository) SaveEFakturExport(ctx context.Context, export *domain.TaxEFakturExport) error {
	query := `
		INSERT INTO tax_efaktur_exports (
			id, tax_period, export_status, total_dpp_idr, total_ppn_idr,
			exported_by, file_path, checksum, created_at, updated_at
		) VALUES (
			:id, :tax_period, :export_status, :total_dpp_idr, :total_ppn_idr,
			:exported_by, :file_path, :checksum, :created_at, :updated_at
		)
		ON CONFLICT (id) DO UPDATE SET
			export_status = EXCLUDED.export_status,
			total_dpp_idr = EXCLUDED.total_dpp_idr,
			total_ppn_idr = EXCLUDED.total_ppn_idr,
			file_path = EXCLUDED.file_path,
			checksum = EXCLUDED.checksum,
			updated_at = EXCLUDED.updated_at
	`
	_, err := r.primaryDB.NamedExecContext(ctx, query, export)
	return err
}

func (r *PostgresTaxRepository) GetEFakturExportByPeriod(ctx context.Context, period string) (*domain.TaxEFakturExport, error) {
	query := `
		SELECT * FROM tax_efaktur_exports
		WHERE tax_period = $1
		ORDER BY created_at DESC
		LIMIT 1
	`
	var export domain.TaxEFakturExport
	err := r.replicaDB.GetContext(ctx, &export, query, period)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &export, nil
}

func (r *PostgresTaxRepository) AggregateTaxByPeriod(ctx context.Context, period string) (int64, int64, error) {
	// period is YYYY-MM. We need to aggregate orders and payments created in this month.
	query := `
		WITH order_tax AS (
			SELECT COALESCE(SUM(dpp_idr), 0) as total_dpp, COALESCE(SUM(ppn_idr), 0) as total_ppn
			FROM orders
			WHERE to_char(created_at, 'YYYY-MM') = $1
			  AND status NOT IN ('cancelled', 'failed')
			  AND tax_invoice_required = true
		),
		payment_tax AS (
			SELECT COALESCE(SUM(dpp_idr), 0) as total_dpp, COALESCE(SUM(ppn_amount_idr), 0) as total_ppn
			FROM payments
			WHERE to_char(created_at, 'YYYY-MM') = $1
			  AND status = 'paid'
			  AND tax_invoice_required = true
		)
		SELECT 
			(SELECT total_dpp FROM order_tax) + (SELECT total_dpp FROM payment_tax) as dpp,
			(SELECT total_ppn FROM order_tax) + (SELECT total_ppn FROM payment_tax) as ppn
	`
	var dpp, ppn int64
	err := r.replicaDB.QueryRowContext(ctx, query, period).Scan(&dpp, &ppn)
	if err != nil {
		return 0, 0, err
	}
	return dpp, ppn, nil
}

func (r *PostgresTaxRepository) GetEFakturDetailsByPeriod(ctx context.Context, period string, fallbackNPWP string, fallbackProviderAddress string) ([]domain.EFakturDetailRecord, error) {
	query := `
		SELECT o.created_at as transaction_date,
		       o.order_number as reference_number,
		       COALESCE(utp.tax_name, u.full_name, 'Customer') as customer_name,
		       COALESCE(NULLIF(utp.tax_address, ''), NULLIF(u.default_pickup_address, ''), 'Alamat Tidak Diketahui') as customer_address,
		       COALESCE(NULLIF(utp.npwp, ''), $2) as customer_npwp,
		       o.dpp_idr as dpp,
		       o.ppn_idr as ppn
		FROM orders o
		LEFT JOIN users u ON o.customer_id = u.id
		LEFT JOIN user_tax_profiles utp ON u.id = utp.user_id
		WHERE to_char(o.created_at, 'YYYY-MM') = $1
		  AND o.status NOT IN ('cancelled', 'failed')
		  AND o.tax_invoice_required = true
		UNION ALL
		SELECT p.created_at as transaction_date,
		       p.payment_number as reference_number,
		       COALESCE(p.provider, 'Payment Gateway') as customer_name,
		       $3 as customer_address,
		       $2 as customer_npwp,
		       p.dpp_idr as dpp,
		       p.ppn_amount_idr as ppn
		FROM payments p
		WHERE to_char(p.created_at, 'YYYY-MM') = $1
		  AND p.status = 'paid'
		  AND p.tax_invoice_required = true
		ORDER BY transaction_date ASC
	`
	var records []domain.EFakturDetailRecord
	err := r.replicaDB.SelectContext(ctx, &records, query, period, fallbackNPWP, fallbackProviderAddress)
	if err != nil {
		return nil, err
	}
	return records, nil
}

func (r *PostgresTaxRepository) UpdateEFakturExportStatus(ctx context.Context, id string, status string) error {
	query := `UPDATE tax_efaktur_exports SET status = $1, updated_at = NOW() WHERE id = $2`
	_, err := r.primaryDB.ExecContext(ctx, query, status, id)
	return err
}

func (r *PostgresTaxRepository) HasNPWP(ctx context.Context, userID string) (bool, error) {
	query := `SELECT npwp FROM user_tax_profiles WHERE user_id = $1 LIMIT 1`
	var npwp *string
	err := r.replicaDB.GetContext(ctx, &npwp, query, userID)
	if err != nil {
		if err.Error() == "sql: no rows in result set" {
			return false, nil
		}
		return false, err
	}
	return npwp != nil && *npwp != "", nil
}
