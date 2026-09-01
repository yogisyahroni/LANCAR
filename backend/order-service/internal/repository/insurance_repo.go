package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	"tembus/order-service/internal/domain"
)

type insuranceRepository struct {
	db *sqlx.DB
}

func NewInsuranceRepository(db *sqlx.DB) domain.InsuranceRepository {
	return &insuranceRepository{
		db: db,
	}
}

func (r *insuranceRepository) CreateCourierInsurance(ctx context.Context, ins *domain.CourierInsurance) error {
	query := `
		INSERT INTO courier_insurance (
			courier_id, type, provider, policy_number, coverage_idr, 
			premium_monthly_idr, company_share_idr, courier_share_idr, 
			status, valid_from, valid_until
		) VALUES (
			:courier_id, :type, :provider, :policy_number, :coverage_idr, 
			:premium_monthly_idr, :company_share_idr, :courier_share_idr, 
			:status, :valid_from, :valid_until
		) RETURNING id, created_at, updated_at
	`

	stmt, err := r.db.PrepareNamedContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to prepare named stmt for CreateCourierInsurance: %w", err)
	}
	defer stmt.Close()

	err = stmt.GetContext(ctx, ins, ins)
	if err != nil {
		return fmt.Errorf("failed to execute CreateCourierInsurance: %w", err)
	}

	return nil
}

func (r *insuranceRepository) GetCourierInsurance(ctx context.Context, courierID uuid.UUID, insuranceType string) (*domain.CourierInsurance, error) {
	var ins domain.CourierInsurance
	query := `
		SELECT * FROM courier_insurance 
		WHERE courier_id = $1 AND type = $2 AND status = 'active'
		ORDER BY valid_until DESC 
		LIMIT 1
	`

	err := r.db.GetContext(ctx, &ins, query, courierID, insuranceType)
	if err != nil {
		return nil, fmt.Errorf("failed to get courier insurance: %w", err)
	}

	return &ins, nil
}

func (r *insuranceRepository) UpdateCourierInsuranceStatus(ctx context.Context, id uuid.UUID, status domain.InsuranceStatus) error {
	query := `
		UPDATE courier_insurance 
		SET status = $1, updated_at = NOW() 
		WHERE id = $2
	`

	res, err := r.db.ExecContext(ctx, query, status, id)
	if err != nil {
		return fmt.Errorf("failed to update courier insurance status: %w", err)
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("courier insurance not found")
	}

	return nil
}

func (r *insuranceRepository) GetExpiringCourierInsurances(ctx context.Context, daysBefore int) ([]domain.CourierInsurance, error) {
	var insurances []domain.CourierInsurance
	query := `
		SELECT * FROM courier_insurance 
		WHERE status = 'active' AND valid_until = CURRENT_DATE + $1
	`

	err := r.db.SelectContext(ctx, &insurances, query, daysBefore)
	if err != nil {
		return nil, fmt.Errorf("failed to get expiring insurances: %w", err)
	}

	return insurances, nil
}

func (r *insuranceRepository) CreateOrderInsurance(ctx context.Context, ins *domain.OrderInsurance) error {
	query := `
		INSERT INTO order_insurance (
			order_id, declared_value, premium_fee, coverage_limit, 
			status, provider, claim_id
		) VALUES (
			:order_id, :declared_value, :premium_fee, :coverage_limit, 
			:status, :provider, :claim_id
		) RETURNING id, created_at, updated_at
	`

	stmt, err := r.db.PrepareNamedContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to prepare named stmt for CreateOrderInsurance: %w", err)
	}
	defer stmt.Close()

	err = stmt.GetContext(ctx, ins, ins)
	if err != nil {
		return fmt.Errorf("failed to execute CreateOrderInsurance: %w", err)
	}

	return nil
}

func (r *insuranceRepository) GetOrderInsurance(ctx context.Context, orderID uuid.UUID) (*domain.OrderInsurance, error) {
	var ins domain.OrderInsurance
	query := `
		SELECT * FROM order_insurance 
		WHERE order_id = $1
	`

	err := r.db.GetContext(ctx, &ins, query, orderID)
	if err != nil {
		return nil, fmt.Errorf("failed to get order insurance: %w", err)
	}

	return &ins, nil
}

func (r *insuranceRepository) GetOrderInsuranceForCustomer(ctx context.Context, orderID, customerID uuid.UUID) (*domain.OrderInsurance, error) {
	var ins domain.OrderInsurance
	query := `
		SELECT oi.id, oi.order_id, oi.declared_value, oi.premium_fee, oi.coverage_limit,
		       oi.status, oi.provider, oi.claim_id, oi.created_at, oi.updated_at
		FROM order_insurance oi
		JOIN orders o ON o.id = oi.order_id
		WHERE oi.order_id = $1 AND o.customer_id = $2
		LIMIT 1
	`
	if err := r.db.GetContext(ctx, &ins, query, orderID, customerID); err != nil {
		return nil, fmt.Errorf("failed to get customer order insurance: %w", err)
	}
	return &ins, nil
}

func (r *insuranceRepository) CreateOrderInsuranceClaim(ctx context.Context, claim *domain.OrderInsuranceClaim) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin insurance claim transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	insert := `
		INSERT INTO order_insurance_claims (
			id, order_insurance_id, order_id, claimant_id, reason,
			claimed_amount, evidence_urls, status
		) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
		RETURNING created_at, updated_at
	`
	if err := tx.QueryRowxContext(ctx, insert,
		claim.ID, claim.OrderInsuranceID, claim.OrderID, claim.ClaimantID,
		claim.Reason, claim.ClaimedAmount, claim.EvidenceURLs, claim.Status,
	).Scan(&claim.CreatedAt, &claim.UpdatedAt); err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code == "23505" {
			return domain.ErrInsuranceClaimExists
		}
		return fmt.Errorf("failed to insert insurance claim: %w", err)
	}

	update := `
		UPDATE order_insurance
		SET status = 'claimed', claim_id = $1, updated_at = NOW()
		WHERE id = $2 AND order_id = $3
		  AND status IN ('active', 'pending_provider_activation')
	`
	result, err := tx.ExecContext(ctx, update, claim.ID.String(), claim.OrderInsuranceID, claim.OrderID)
	if err != nil {
		return fmt.Errorf("failed to mark order insurance claimed: %w", err)
	}
	if rows, _ := result.RowsAffected(); rows != 1 {
		return domain.ErrOrderInsuranceNotFound
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit insurance claim: %w", err)
	}
	return nil
}

func (r *insuranceRepository) GetOrderInsuranceClaim(ctx context.Context, orderID, claimantID uuid.UUID) (*domain.OrderInsuranceClaim, error) {
	var claim domain.OrderInsuranceClaim
	query := `
		SELECT c.id, c.order_insurance_id, c.order_id, c.claimant_id, c.reason,
		       c.claimed_amount, c.evidence_urls, c.status, c.provider_claim_id,
		       c.reviewed_at, c.resolution_note, c.created_at, c.updated_at
		FROM order_insurance_claims c
		JOIN orders o ON o.id = c.order_id
		WHERE c.order_id = $1 AND c.claimant_id = $2
		LIMIT 1
	`
	if err := r.db.GetContext(ctx, &claim, query, orderID, claimantID); err != nil {
		return nil, fmt.Errorf("failed to get order insurance claim: %w", err)
	}
	return &claim, nil
}
