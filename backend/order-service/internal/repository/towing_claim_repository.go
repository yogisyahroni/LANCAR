package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"tembus/order-service/internal/domain"
	"time"
)

func NewTowingDamageClaimRepository(db *sql.DB) domain.TowingDamageClaimRepository {
	return &towingDamageClaimRepo{db: db}
}

type towingDamageClaimRepo struct {
	db *sql.DB
}

const towingClaimColumns = `id, order_id, towing_report_id, vehicle_id, operator_id, status, severity,
       claim_amount_idr, approved_amount_idr, liability_decision, liability_decided_by,
       liability_decided_at, liability_reason, compensation_channel, compensation_reference,
       compensated_at, created_at, updated_at`

func (r *towingDamageClaimRepo) CreateTowingDamageClaim(ctx context.Context, req *domain.SubmitTowingDamageClaimRequest, operatorID string) (*domain.TowingDamageClaim, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin towing damage claim: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "towing_damage_claim:"+req.OrderID); err != nil {
		return nil, fmt.Errorf("lock towing damage claim: %w", err)
	}

	var reportID, vehicleID string
	if err := tx.QueryRowContext(ctx, `
		SELECT tr.id, ol.vehicle_id
		FROM towing_reports tr
		JOIN order_legs ol ON ol.order_id = tr.order_id AND ol.leg_number = 1
		JOIN courier_profiles cp ON cp.user_id = ol.courier_id AND cp.user_id = $2
		WHERE tr.order_id = $1
		  AND tr.vehicle_id = ol.vehicle_id
		  AND ol.vehicle_id IS NOT NULL
		FOR UPDATE OF tr, ol`, req.OrderID, operatorID).Scan(&reportID, &vehicleID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("%w: report tidak terikat ke kendaraan operator pada leg order", domain.ErrInvalidTowingDamageClaim)
		}
		return nil, fmt.Errorf("verify towing report vehicle binding: %w", err)
	}

	claim, err := scanTowingDamageClaim(tx.QueryRowContext(ctx, `
		INSERT INTO towing_damage_claims
			(order_id, towing_report_id, vehicle_id, operator_id, severity, claim_amount_idr)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (towing_report_id) DO UPDATE SET updated_at = towing_damage_claims.updated_at
		RETURNING `+towingClaimColumns, req.OrderID, reportID, vehicleID, operatorID, req.Severity, req.ClaimAmountIDR))
	if err != nil {
		return nil, fmt.Errorf("persist towing damage claim: %w", err)
	}

	payload, _ := json.Marshal(map[string]any{
		"claim_id": claim.ID, "vehicle_id": vehicleID, "severity": req.Severity,
		"claim_amount_idr": req.ClaimAmountIDR,
	})
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO audit_logs (actor_id, action, target_id, payload)
		VALUES ($1, 'towing.damage_claim.submitted', $2, $3)`, operatorID, claim.ID, payload); err != nil {
		return nil, fmt.Errorf("audit towing damage claim: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit towing damage claim: %w", err)
	}
	return claim, nil
}

func (r *towingDamageClaimRepo) GetTowingDamageClaim(ctx context.Context, claimID string) (*domain.TowingDamageClaim, error) {
	return scanTowingDamageClaim(r.db.QueryRowContext(ctx, `SELECT `+towingClaimColumns+` FROM towing_damage_claims WHERE id = $1`, claimID))
}

func (r *towingDamageClaimRepo) GetTowingDamageClaimByOrderID(ctx context.Context, orderID string) (*domain.TowingDamageClaim, error) {
	return scanTowingDamageClaim(r.db.QueryRowContext(ctx, `SELECT `+towingClaimColumns+` FROM towing_damage_claims WHERE order_id = $1`, orderID))
}

func (r *towingDamageClaimRepo) DecideTowingDamageClaim(ctx context.Context, req *domain.DecideTowingDamageClaimRequest, reviewerID string) (*domain.TowingDamageClaim, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin towing damage claim decision: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "towing_damage_claim_decision:"+req.ClaimID); err != nil {
		return nil, fmt.Errorf("lock towing damage claim decision: %w", err)
	}

	status := domain.TowingDamageClaimStatusApproved
	if req.LiabilityDecision == domain.TowingLiabilityRejected {
		status = domain.TowingDamageClaimStatusRejected
	}
	claim, err := scanTowingDamageClaim(tx.QueryRowContext(ctx, `
		UPDATE towing_damage_claims
		SET status = $2,
		    approved_amount_idr = $3,
		    liability_decision = $4,
		    liability_decided_by = $5,
		    liability_decided_at = NOW(),
		    liability_reason = $6,
		    updated_at = NOW()
		WHERE id = $1
		  AND status = 'submitted'
		  AND liability_decision = 'pending'
		RETURNING `+towingClaimColumns,
		req.ClaimID, status, req.ApprovedAmountIDR, req.LiabilityDecision, reviewerID, strings.TrimSpace(req.LiabilityReason)))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("%w: claim tidak lagi menunggu keputusan", domain.ErrInvalidTowingDamageClaim)
		}
		return nil, fmt.Errorf("decide towing damage claim: %w", err)
	}

	payload, _ := json.Marshal(map[string]any{
		"claim_id": claim.ID, "liability_decision": claim.LiabilityDecision,
		"approved_amount_idr": claim.ApprovedAmountIDR, "reason": req.LiabilityReason,
	})
	if _, err := tx.ExecContext(ctx, `INSERT INTO audit_logs (actor_id, action, target_id, payload) VALUES ($1, 'towing.damage_claim.liability_decided', $2, $3)`, reviewerID, claim.ID, payload); err != nil {
		return nil, fmt.Errorf("audit towing liability decision: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit towing liability decision: %w", err)
	}
	return claim, nil
}

func (r *towingDamageClaimRepo) ReconcileTowingDamageCompensation(ctx context.Context, req *domain.ReconcileTowingDamageCompensationRequest, reviewerID string) (*domain.TowingDamageClaim, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin towing compensation reconciliation: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "towing_damage_claim_reconcile:"+req.ClaimID); err != nil {
		return nil, fmt.Errorf("lock towing compensation reconciliation: %w", err)
	}

	claim, err := scanTowingDamageClaim(tx.QueryRowContext(ctx, `
		UPDATE towing_damage_claims
		SET status = 'paid', compensation_channel = $2, compensation_reference = $3,
		    compensated_at = NOW(), updated_at = NOW()
		WHERE id = $1
		  AND status = 'approved'
		  AND liability_decision <> 'rejected'
		  AND approved_amount_idr > 0
		  AND compensated_at IS NULL
		RETURNING `+towingClaimColumns,
		req.ClaimID, req.CompensationChannel, strings.TrimSpace(req.CompensationReference)))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("%w: claim belum approved atau sudah direkonsiliasi", domain.ErrInvalidTowingDamageClaim)
		}
		return nil, fmt.Errorf("reconcile towing compensation: %w", err)
	}

	payload, _ := json.Marshal(map[string]any{
		"claim_id": claim.ID, "approved_amount_idr": claim.ApprovedAmountIDR,
		"compensation_channel": claim.CompensationChannel, "compensation_reference": claim.CompensationReference,
	})
	if _, err := tx.ExecContext(ctx, `INSERT INTO audit_logs (actor_id, action, target_id, payload) VALUES ($1, 'towing.damage_claim.compensation_reconciled', $2, $3)`, reviewerID, claim.ID, payload); err != nil {
		return nil, fmt.Errorf("audit towing compensation: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit towing compensation: %w", err)
	}
	return claim, nil
}

type towingDamageClaimScanner interface {
	Scan(dest ...any) error
}

func scanTowingDamageClaim(scanner towingDamageClaimScanner) (*domain.TowingDamageClaim, error) {
	claim := &domain.TowingDamageClaim{}
	var compensatedAt, decidedAt sql.NullTime
	var decidedBy, reason, channel, reference sql.NullString
	err := scanner.Scan(
		&claim.ID, &claim.OrderID, &claim.TowingReportID, &claim.VehicleID, &claim.OperatorID,
		&claim.Status, &claim.Severity, &claim.ClaimAmountIDR, &claim.ApprovedAmountIDR,
		&claim.LiabilityDecision, &decidedBy, &decidedAt, &reason, &channel, &reference,
		&compensatedAt, &claim.CreatedAt, &claim.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if decidedBy.Valid {
		claim.LiabilityDecidedBy = &decidedBy.String
	}
	if decidedAt.Valid {
		claim.LiabilityDecidedAt = timePtr(decidedAt.Time)
	}
	if reason.Valid {
		claim.LiabilityReason = &reason.String
	}
	if channel.Valid {
		claim.CompensationChannel = &channel.String
	}
	if reference.Valid {
		claim.CompensationReference = &reference.String
	}
	if compensatedAt.Valid {
		claim.CompensatedAt = timePtr(compensatedAt.Time)
	}
	return claim, nil
}

func timePtr(value time.Time) *time.Time { return &value }
