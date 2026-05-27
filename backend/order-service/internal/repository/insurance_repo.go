package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
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
