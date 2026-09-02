package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
)

type aggregatorFinanceRepository struct {
	db *sql.DB
}

func NewAggregatorFinanceRepository(db *sql.DB) domain.AggregatorFinanceRepository {
	return &aggregatorFinanceRepository{db: db}
}

func (r *aggregatorFinanceRepository) CreateInvoice(ctx context.Context, inv *domain.ProviderInvoice, items []domain.ProviderInvoiceItem) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	queryInv := `
		INSERT INTO provider_invoices (
			id, invoice_number, provider_name, billing_period_start, billing_period_end,
			total_claimed_idr, total_matched_idr, total_discrepancy_idr, status, notes, created_by, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
	`
	_, err = tx.ExecContext(ctx, queryInv,
		inv.ID, inv.InvoiceNumber, inv.ProviderName, inv.BillingPeriodStart, inv.BillingPeriodEnd,
		inv.TotalClaimedIDR, inv.TotalMatchedIDR, inv.TotalDiscrepancyIDR, inv.Status, inv.Notes, inv.CreatedBy,
	)
	if err != nil {
		return fmt.Errorf("failed to insert provider_invoice: %w", err)
	}

	queryItem := `
		INSERT INTO provider_invoice_items (
			id, invoice_id, awb_number, order_id, claimed_amount_idr, expected_net_cost_idr,
			discrepancy_idr, discrepancy_type, resolution_status, resolution_notes, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
	`
	for _, it := range items {
		_, err = tx.ExecContext(ctx, queryItem,
			it.ID, inv.ID, it.AWBNumber, it.OrderID, it.ClaimedAmountIDR, it.ExpectedNetIDR,
			it.DiscrepancyIDR, it.DiscrepancyType, it.ResolutionStatus, it.ResolutionNotes,
		)
		if err != nil {
			return fmt.Errorf("failed to insert provider_invoice_item awb %s: %w", it.AWBNumber, err)
		}
	}

	return tx.Commit()
}

func (r *aggregatorFinanceRepository) GetInvoiceByID(ctx context.Context, id uuid.UUID) (*domain.ProviderInvoice, error) {
	query := `
		SELECT id, invoice_number, provider_name, billing_period_start, billing_period_end,
		       total_claimed_idr, total_matched_idr, total_discrepancy_idr, status, COALESCE(notes, ''),
		       created_at, updated_at
		FROM provider_invoices
		WHERE id = $1
	`
	inv := &domain.ProviderInvoice{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&inv.ID, &inv.InvoiceNumber, &inv.ProviderName, &inv.BillingPeriodStart, &inv.BillingPeriodEnd,
		&inv.TotalClaimedIDR, &inv.TotalMatchedIDR, &inv.TotalDiscrepancyIDR, &inv.Status, &inv.Notes,
		&inv.CreatedAt, &inv.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	queryItems := `
		SELECT id, invoice_id, awb_number, order_id, claimed_amount_idr, expected_net_cost_idr,
		       discrepancy_idr, discrepancy_type, resolution_status, COALESCE(resolution_notes, ''), created_at
		FROM provider_invoice_items
		WHERE invoice_id = $1
	`
	rows, err := r.db.QueryContext(ctx, queryItems, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var it domain.ProviderInvoiceItem
		var orderID sql.NullString
		if err := rows.Scan(
			&it.ID, &it.InvoiceID, &it.AWBNumber, &orderID, &it.ClaimedAmountIDR, &it.ExpectedNetIDR,
			&it.DiscrepancyIDR, &it.DiscrepancyType, &it.ResolutionStatus, &it.ResolutionNotes, &it.CreatedAt,
		); err != nil {
			return nil, err
		}
		if orderID.Valid {
			uid, _ := uuid.Parse(orderID.String)
			it.OrderID = &uid
		}
		inv.Items = append(inv.Items, it)
	}

	return inv, nil
}

func (r *aggregatorFinanceRepository) ListInvoices(ctx context.Context, providerName string, status string, limit, offset int) ([]*domain.ProviderInvoice, error) {
	query := `
		SELECT id, invoice_number, provider_name, billing_period_start, billing_period_end,
		       total_claimed_idr, total_matched_idr, total_discrepancy_idr, status, COALESCE(notes, ''),
		       created_at, updated_at
		FROM provider_invoices
		WHERE ($1 = '' OR provider_name = $1)
		  AND ($2 = '' OR status = $2)
		ORDER BY created_at DESC
		LIMIT $3 OFFSET $4
	`
	rows, err := r.db.QueryContext(ctx, query, providerName, status, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*domain.ProviderInvoice
	for rows.Next() {
		inv := &domain.ProviderInvoice{}
		if err := rows.Scan(
			&inv.ID, &inv.InvoiceNumber, &inv.ProviderName, &inv.BillingPeriodStart, &inv.BillingPeriodEnd,
			&inv.TotalClaimedIDR, &inv.TotalMatchedIDR, &inv.TotalDiscrepancyIDR, &inv.Status, &inv.Notes,
			&inv.CreatedAt, &inv.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, inv)
	}
	return out, nil
}

func (r *aggregatorFinanceRepository) UpdateInvoiceStatus(ctx context.Context, id uuid.UUID, status domain.ProviderInvoiceStatus, totalMatched, totalDiscrepancy int64, approvedBy *uuid.UUID) error {
	query := `
		UPDATE provider_invoices
		SET status = $1, total_matched_idr = $2, total_discrepancy_idr = $3, approved_by = $4, approved_at = NOW(), updated_at = NOW()
		WHERE id = $5
	`
	_, err := r.db.ExecContext(ctx, query, status, totalMatched, totalDiscrepancy, approvedBy, id)
	return err
}

func (r *aggregatorFinanceRepository) UpdateInvoiceItems(ctx context.Context, items []domain.ProviderInvoiceItem) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	query := `
		UPDATE provider_invoice_items
		SET order_id = $1, expected_net_cost_idr = $2, discrepancy_idr = $3, discrepancy_type = $4, resolution_status = $5
		WHERE id = $6
	`
	for _, it := range items {
		_, err := tx.ExecContext(ctx, query, it.OrderID, it.ExpectedNetIDR, it.DiscrepancyIDR, it.DiscrepancyType, it.ResolutionStatus, it.ID)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *aggregatorFinanceRepository) GetPolicyByTypeAndProvider(ctx context.Context, exceptionType, providerName string) (*domain.LogisticsExceptionPolicy, error) {
	query := `
		SELECT id, policy_code, policy_name, exception_type, provider_name, fee_borne_by,
		       fee_amount_idr, fee_pct_order, is_active, created_at, updated_at
		FROM logistics_exception_policies
		WHERE exception_type = $1 AND (provider_name = $2 OR provider_name = 'ALL') AND is_active = true
		ORDER BY CASE WHEN provider_name = 'ALL' THEN 2 ELSE 1 END
		LIMIT 1
	`
	p := &domain.LogisticsExceptionPolicy{}
	err := r.db.QueryRowContext(ctx, query, exceptionType, providerName).Scan(
		&p.ID, &p.PolicyCode, &p.PolicyName, &p.ExceptionType, &p.ProviderName, &p.FeeBorneBy,
		&p.FeeAmountIDR, &p.FeePctOrder, &p.IsActive, &p.CreatedAt, &p.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return p, err
}

func (r *aggregatorFinanceRepository) ListPolicies(ctx context.Context) ([]*domain.LogisticsExceptionPolicy, error) {
	query := `
		SELECT id, policy_code, policy_name, exception_type, provider_name, fee_borne_by,
		       fee_amount_idr, fee_pct_order, is_active, created_at, updated_at
		FROM logistics_exception_policies
		ORDER BY exception_type ASC, provider_name ASC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*domain.LogisticsExceptionPolicy
	for rows.Next() {
		p := &domain.LogisticsExceptionPolicy{}
		if err := rows.Scan(
			&p.ID, &p.PolicyCode, &p.PolicyName, &p.ExceptionType, &p.ProviderName, &p.FeeBorneBy,
			&p.FeeAmountIDR, &p.FeePctOrder, &p.IsActive, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

func (r *aggregatorFinanceRepository) CreateOrUpdatePolicy(ctx context.Context, pol *domain.LogisticsExceptionPolicy) error {
	metaJSON, _ := json.Marshal(pol.ConfigMetadata)
	query := `
		INSERT INTO logistics_exception_policies (
			id, policy_code, policy_name, exception_type, provider_name, fee_borne_by,
			fee_amount_idr, fee_pct_order, is_active, config_metadata, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
		ON CONFLICT (policy_code) DO UPDATE SET
			policy_name = EXCLUDED.policy_name,
			fee_borne_by = EXCLUDED.fee_borne_by,
			fee_amount_idr = EXCLUDED.fee_amount_idr,
			fee_pct_order = EXCLUDED.fee_pct_order,
			is_active = EXCLUDED.is_active,
			config_metadata = EXCLUDED.config_metadata,
			updated_at = NOW()
	`
	if pol.ID == uuid.Nil {
		pol.ID = uuid.New()
	}
	_, err := r.db.ExecContext(ctx, query,
		pol.ID, pol.PolicyCode, pol.PolicyName, pol.ExceptionType, pol.ProviderName, pol.FeeBorneBy,
		pol.FeeAmountIDR, pol.FeePctOrder, pol.IsActive, metaJSON,
	)
	return err
}

func (r *aggregatorFinanceRepository) CreateClaim(ctx context.Context, claim *domain.LogisticsExceptionClaim) error {
	evidence := claim.EvidenceURLs
	if len(evidence) == 0 {
		evidence = json.RawMessage(`[]`)
	}
	query := `
		INSERT INTO logistics_exception_claims (
			id, order_id, awb_number, exception_type, provider_name, claim_amount_idr,
			item_value_idr, insurance_coverage_idr, provider_payout_idr, customer_compensation_idr, merchant_compensation_idr,
			provider_claim_reference, fee_borne_by, evidence_urls, status, notes, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
		ON CONFLICT (order_id, exception_type) DO NOTHING
	`
	_, err := r.db.ExecContext(ctx, query,
		claim.ID, claim.OrderID, claim.AWBNumber, claim.ExceptionType, claim.ProviderName,
		claim.ClaimAmountIDR, claim.ItemValueIDR, claim.InsuranceCoverageIDR,
		claim.ProviderPayoutIDR, claim.CustomerCompensationIDR, claim.MerchantCompensationIDR,
		claim.ProviderClaimReference, claim.FeeBorneBy, evidence, claim.Status, claim.Notes,
	)
	return err
}

func (r *aggregatorFinanceRepository) GetClaimByID(ctx context.Context, id uuid.UUID) (*domain.LogisticsExceptionClaim, error) {
	query := `
		SELECT id, order_id, awb_number, exception_type, provider_name, claim_amount_idr,
		       item_value_idr, insurance_coverage_idr, provider_payout_idr, customer_compensation_idr, merchant_compensation_idr,
		       COALESCE(provider_claim_reference, ''), COALESCE(fee_borne_by, ''), COALESCE(evidence_urls, '[]'::jsonb),
		       status, COALESCE(notes, ''), resolved_at, created_at, updated_at
		FROM logistics_exception_claims
		WHERE id = $1
	`
	c := &domain.LogisticsExceptionClaim{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&c.ID, &c.OrderID, &c.AWBNumber, &c.ExceptionType, &c.ProviderName,
		&c.ClaimAmountIDR, &c.ItemValueIDR, &c.InsuranceCoverageIDR, &c.ProviderPayoutIDR, &c.CustomerCompensationIDR,
		&c.MerchantCompensationIDR, &c.ProviderClaimReference, &c.FeeBorneBy, &c.EvidenceURLs,
		&c.Status, &c.Notes, &c.ResolvedAt, &c.CreatedAt, &c.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return c, err
}

func (r *aggregatorFinanceRepository) ListClaims(ctx context.Context, status string, limit, offset int) ([]*domain.LogisticsExceptionClaim, error) {
	query := `
		SELECT id, order_id, awb_number, exception_type, provider_name, claim_amount_idr,
		       item_value_idr, insurance_coverage_idr, provider_payout_idr, customer_compensation_idr, merchant_compensation_idr,
		       COALESCE(provider_claim_reference, ''), COALESCE(fee_borne_by, ''), COALESCE(evidence_urls, '[]'::jsonb),
		       status, COALESCE(notes, ''), resolved_at, created_at, updated_at
		FROM logistics_exception_claims
		WHERE ($1 = '' OR status = $1)
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.db.QueryContext(ctx, query, status, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*domain.LogisticsExceptionClaim
	for rows.Next() {
		c := &domain.LogisticsExceptionClaim{}
		if err := rows.Scan(
			&c.ID, &c.OrderID, &c.AWBNumber, &c.ExceptionType, &c.ProviderName,
			&c.ClaimAmountIDR, &c.ItemValueIDR, &c.InsuranceCoverageIDR, &c.ProviderPayoutIDR, &c.CustomerCompensationIDR,
			&c.MerchantCompensationIDR, &c.ProviderClaimReference, &c.FeeBorneBy, &c.EvidenceURLs,
			&c.Status, &c.Notes, &c.ResolvedAt, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, nil
}

func (r *aggregatorFinanceRepository) UpdateClaimStatus(ctx context.Context, id uuid.UUID, status string, journalID *uuid.UUID) error {
	query := `
		UPDATE logistics_exception_claims
		SET status = $1, ledger_journal_id = COALESCE($2, ledger_journal_id), resolved_at = NOW(), updated_at = NOW()
		WHERE id = $3
	`
	_, err := r.db.ExecContext(ctx, query, status, journalID, id)
	return err
}

func (r *aggregatorFinanceRepository) GetOrderAndNetCostByAWB(ctx context.Context, awbNumber string) (*uuid.UUID, int64, error) {
	query := `
		SELECT id, COALESCE(provider_net_cost_idr, 0)
		FROM orders
		WHERE awb_number = $1
		LIMIT 1
	`
	var oidStr string
	var netCost int64
	err := r.db.QueryRowContext(ctx, query, awbNumber).Scan(&oidStr, &netCost)
	if err == sql.ErrNoRows {
		return nil, 0, nil
	}
	if err != nil {
		return nil, 0, err
	}
	uid, _ := uuid.Parse(oidStr)
	return &uid, netCost, nil
}
