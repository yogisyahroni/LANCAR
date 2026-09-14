package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"tembus/order-service/internal/domain"
	"time"
)

type foodMembershipRepository struct{ db *sql.DB }

func NewFoodMembershipRepository(db *sql.DB) domain.FoodMembershipRepository {
	return &foodMembershipRepository{db: db}
}

func (r *foodMembershipRepository) ListFoodMembershipPlans(ctx context.Context) ([]domain.FoodMembershipPlan, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id::text, name, monthly_fee_idr, free_delivery_cap_idr, minimum_subtotal_idr, active FROM food_membership_plans WHERE active = TRUE ORDER BY monthly_fee_idr`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	plans := make([]domain.FoodMembershipPlan, 0)
	for rows.Next() {
		var p domain.FoodMembershipPlan
		if err := rows.Scan(&p.ID, &p.Name, &p.MonthlyFeeIDR, &p.FreeDeliveryCapIDR, &p.MinimumSubtotalIDR, &p.Active); err != nil {
			return nil, err
		}
		plans = append(plans, p)
	}
	return plans, rows.Err()
}

func (r *foodMembershipRepository) GetActiveFoodMembership(ctx context.Context, userID string) (*domain.FoodMembershipEntitlement, *domain.FoodMembershipPlan, error) {
	e := &domain.FoodMembershipEntitlement{}
	p := &domain.FoodMembershipPlan{}
	err := r.db.QueryRowContext(ctx, `SELECT e.id::text, e.user_id::text, e.plan_id::text, e.status, e.current_period_start, e.current_period_end, e.free_delivery_used_idr, p.id::text, p.name, p.monthly_fee_idr, p.free_delivery_cap_idr, p.minimum_subtotal_idr, p.active FROM food_membership_entitlements e JOIN food_membership_plans p ON p.id = e.plan_id WHERE e.user_id = $1::uuid AND e.status = 'active' AND e.current_period_start <= NOW() AND e.current_period_end > NOW() AND p.active = TRUE ORDER BY e.current_period_end DESC LIMIT 1`, userID).Scan(&e.ID, &e.UserID, &e.PlanID, &e.Status, &e.CurrentPeriodStart, &e.CurrentPeriodEnd, &e.FreeDeliveryUsedIDR, &p.ID, &p.Name, &p.MonthlyFeeIDR, &p.FreeDeliveryCapIDR, &p.MinimumSubtotalIDR, &p.Active)
	if err == sql.ErrNoRows {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, fmt.Errorf("get active membership: %w", err)
	}
	e.FreeDeliveryRemainingIDR = p.FreeDeliveryCapIDR - e.FreeDeliveryUsedIDR
	if e.FreeDeliveryRemainingIDR < 0 {
		e.FreeDeliveryRemainingIDR = 0
	}
	return e, p, nil
}

func (r *foodMembershipRepository) CreatePendingFoodMembership(ctx context.Context, userID, planID, idempotencyKey string) (*domain.FoodMembershipEntitlement, error) {
	e := &domain.FoodMembershipEntitlement{}
	now := time.Now()
	err := r.db.QueryRowContext(ctx, `INSERT INTO food_membership_entitlements (id, user_id, plan_id, status, current_period_start, current_period_end, free_delivery_used_idr, subscription_idempotency_key) VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'pending_payment', $3, $3, 0, $4) ON CONFLICT (subscription_idempotency_key) DO UPDATE SET id = food_membership_entitlements.id RETURNING id::text, user_id::text, plan_id::text, status, current_period_start, current_period_end, free_delivery_used_idr`, userID, planID, now, idempotencyKey).Scan(&e.ID, &e.UserID, &e.PlanID, &e.Status, &e.CurrentPeriodStart, &e.CurrentPeriodEnd, &e.FreeDeliveryUsedIDR)
	if err != nil {
		return nil, fmt.Errorf("create pending membership: %w", err)
	}
	return e, nil
}

func (r *foodMembershipRepository) ApplyFoodMembershipPaymentEvent(ctx context.Context, entitlementID, paymentState, paymentIntentID, providerReference, idempotencyKey string) (*domain.FoodMembershipEntitlement, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var current domain.FoodMembershipEntitlement
	var currentPaymentIntent sql.NullString
	err = tx.QueryRowContext(ctx, `
		SELECT id::text, user_id::text, plan_id::text, status, current_period_start,
		       current_period_end, free_delivery_used_idr, payment_intent_id::text
		  FROM food_membership_entitlements WHERE id = $1::uuid FOR UPDATE`, entitlementID).
		Scan(&current.ID, &current.UserID, &current.PlanID, &current.Status, &current.CurrentPeriodStart, &current.CurrentPeriodEnd, &current.FreeDeliveryUsedIDR, &currentPaymentIntent)
	if err != nil {
		return nil, fmt.Errorf("load membership entitlement: %w", err)
	}
	if currentPaymentIntent.Valid && paymentIntentID != "" && currentPaymentIntent.String != paymentIntentID {
		return nil, fmt.Errorf("membership payment intent mismatch")
	}
	nextStatus, err := domain.ResolveFoodMembershipPaymentTransition(current.Status, paymentState)
	if err != nil {
		return nil, err
	}
	var inserted string
	err = tx.QueryRowContext(ctx, `
		INSERT INTO food_membership_payment_events
		  (entitlement_id, idempotency_key, payment_state, resulting_status, payment_intent_id, provider_reference)
		VALUES ($1::uuid, $2, $3, $4, NULLIF($5, '')::uuid, NULLIF($6, ''))
		ON CONFLICT (idempotency_key) DO NOTHING
		RETURNING id::text`, entitlementID, idempotencyKey, strings.ToUpper(paymentState), nextStatus, paymentIntentID, providerReference).Scan(&inserted)
	if err == sql.ErrNoRows {
		var existingState, existingIntent, existingReference, existingResult string
		err = tx.QueryRowContext(ctx, `
			SELECT payment_state, COALESCE(payment_intent_id::text, ''),
			       COALESCE(provider_reference, ''), resulting_status
			  FROM food_membership_payment_events WHERE idempotency_key = $1`, idempotencyKey).
			Scan(&existingState, &existingIntent, &existingReference, &existingResult)
		if err != nil {
			return nil, fmt.Errorf("load duplicate membership payment event: %w", err)
		}
		if existingState != strings.ToUpper(strings.TrimSpace(paymentState)) || existingIntent != paymentIntentID || existingReference != providerReference || existingResult != nextStatus {
			return nil, fmt.Errorf("membership payment event idempotency key reuse")
		}
		err = tx.QueryRowContext(ctx, `
			SELECT id::text, user_id::text, plan_id::text, status, current_period_start,
			       current_period_end, free_delivery_used_idr
			  FROM food_membership_entitlements WHERE id = $1::uuid`, entitlementID).
			Scan(&current.ID, &current.UserID, &current.PlanID, &current.Status, &current.CurrentPeriodStart, &current.CurrentPeriodEnd, &current.FreeDeliveryUsedIDR)
		if err != nil {
			return nil, fmt.Errorf("load duplicate membership entitlement: %w", err)
		}
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return &current, nil
	}
	if err != nil {
		return nil, fmt.Errorf("record membership payment event: %w", err)
	}
	row := tx.QueryRowContext(ctx, `
		UPDATE food_membership_entitlements
		   SET status = $2::text,
		       payment_intent_id = COALESCE(payment_intent_id, NULLIF($3, '')::uuid),
		       current_period_start = CASE
		         WHEN $4::text = 'SUCCEEDED' AND status = 'active' THEN current_period_start
		         WHEN $2::text = 'active' AND status <> 'active' THEN NOW()
		         ELSE current_period_start
		       END,
		       current_period_end = CASE
		         WHEN $4::text = 'SUCCEEDED' AND status = 'active' THEN GREATEST(current_period_end, NOW()) + INTERVAL '30 days'
		         WHEN $2::text = 'active' AND status <> 'active' THEN NOW() + INTERVAL '30 days'
		         ELSE current_period_end
		       END,
		       updated_at = NOW()
		 WHERE id = $1::uuid
		 RETURNING id::text, user_id::text, plan_id::text, status, current_period_start,
		           current_period_end, free_delivery_used_idr`, entitlementID, nextStatus, paymentIntentID, strings.ToUpper(paymentState))
	var updated domain.FoodMembershipEntitlement
	if err := row.Scan(&updated.ID, &updated.UserID, &updated.PlanID, &updated.Status, &updated.CurrentPeriodStart, &updated.CurrentPeriodEnd, &updated.FreeDeliveryUsedIDR); err != nil {
		return nil, fmt.Errorf("apply membership payment state: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &updated, nil
}

func (r *foodMembershipRepository) RecordFoodMembershipSubsidy(ctx context.Context, entitlementID, orderID string, amountIDR int64) error {
	if amountIDR <= 0 {
		return nil
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	inserted, err := tx.ExecContext(ctx, `INSERT INTO food_membership_subsidy_ledger (entitlement_id, order_id, amount_idr) VALUES ($1::uuid, $2::uuid, $3) ON CONFLICT (order_id) DO NOTHING`, entitlementID, orderID, amountIDR)
	if err != nil {
		return err
	}
	insertedCount, _ := inserted.RowsAffected()
	if insertedCount == 0 {
		return tx.Commit()
	}
	result, err := tx.ExecContext(ctx, `UPDATE food_membership_entitlements SET free_delivery_used_idr = free_delivery_used_idr + $2, updated_at = NOW() WHERE id = $1::uuid AND status = 'active' AND free_delivery_used_idr + $2 <= (SELECT free_delivery_cap_idr FROM food_membership_plans p WHERE p.id = food_membership_entitlements.plan_id)`, entitlementID, amountIDR)
	if err != nil {
		return err
	}
	count, _ := result.RowsAffected()
	if count != 1 {
		return fmt.Errorf("membership subsidy cap exceeded or entitlement inactive")
	}
	return tx.Commit()
}
