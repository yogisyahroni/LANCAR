package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"tembus/order-service/internal/domain"
)

type serviceAdjustmentRepo struct {
	db *sql.DB
}

func NewServiceAdjustmentRepository(db *sql.DB) domain.ServiceAdjustmentRepository {
	return &serviceAdjustmentRepo{db: db}
}

const serviceAdjustmentColumns = `id, order_id, customer_id, requested_by_courier_id,
       service_category, service_code, service_sub_type, reason, items,
       initial_quote_id, initial_pricing_snapshot, original_total_idr, delta_idr,
       proposed_total_idr, approved_delta_idr, status, financial_state,
       approved_by_customer_id, approved_at, rejected_by_customer_id, rejected_at,
       rejection_reason, correlation_id, created_at, updated_at`

func (r *serviceAdjustmentRepo) Propose(ctx context.Context, req *domain.ProposeServiceAdjustmentRequest, courierID string, deltaIDR int64) (*domain.ServiceAdjustment, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin service adjustment proposal: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "service_adjustment:"+req.OrderID); err != nil {
		return nil, fmt.Errorf("lock service adjustment proposal: %w", err)
	}

	var customerID, category, serviceCode, serviceSubType, quoteID, pricingSnapshot string
	var originalTotal int64
	err = tx.QueryRowContext(ctx, `
		SELECT o.customer_id::text,
		       COALESCE(o.service_category, ''), COALESCE(o.service_code, ''), COALESCE(o.service_sub_type, ''),
		       COALESCE(o.quote_id::text, ''), COALESCE(o.pricing_snapshot::text, '{}'), o.total_price_idr
		FROM orders o
		JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1 AND ol.courier_id = $2
		WHERE o.id = $1
		FOR UPDATE OF o`, req.OrderID, courierID).
		Scan(&customerID, &category, &serviceCode, &serviceSubType, &quoteID, &pricingSnapshot, &originalTotal)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrServiceAdjustmentForbidden
		}
		return nil, fmt.Errorf("verify service adjustment order: %w", err)
	}
	category = strings.TrimSpace(category)
	if category == "" {
		switch {
		case strings.HasPrefix(serviceSubType, "tambal_ban"):
			category = "tambal_ban"
		case strings.HasPrefix(serviceSubType, "towing"):
			category = "towing"
		}
	}
	if category != "tambal_ban" && category != "towing" {
		return nil, fmt.Errorf("%w: adjustment hanya untuk roadside service", domain.ErrInvalidServiceAdjustment)
	}
	if strings.TrimSpace(quoteID) == "" || strings.TrimSpace(pricingSnapshot) == "" || strings.TrimSpace(pricingSnapshot) == "{}" || !json.Valid([]byte(pricingSnapshot)) {
		return nil, domain.ErrServiceAdjustmentMissingQuote
	}

	if existing, existingHash, err := r.getProposalByIdempotencyTx(ctx, tx, courierID, req.IdempotencyKey); err == nil {
		if existingHash == req.RequestFingerprint && existing.OrderID == req.OrderID {
			return existing, nil
		}
		return nil, domain.ErrServiceAdjustmentIdempotencyConflict
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("read service adjustment idempotency: %w", err)
	}

	var pendingID string
	if err := tx.QueryRowContext(ctx, `SELECT id::text FROM service_adjustments WHERE order_id = $1 AND status = 'pending' LIMIT 1`, req.OrderID).Scan(&pendingID); err == nil {
		return nil, domain.ErrServiceAdjustmentConflict
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("check pending service adjustment: %w", err)
	}

	itemsJSON, err := json.Marshal(req.Items)
	if err != nil {
		return nil, fmt.Errorf("encode service adjustment items: %w", err)
	}
	proposedTotal := originalTotal + deltaIDR
	adjustment, err := scanServiceAdjustment(tx.QueryRowContext(ctx, `
		INSERT INTO service_adjustments
			(order_id, customer_id, requested_by_courier_id, service_category, service_code, service_sub_type,
			 reason, items, initial_quote_id, initial_pricing_snapshot, original_total_idr, delta_idr,
			 proposed_total_idr, proposal_idempotency_key, proposal_request_hash, correlation_id)
		VALUES ($1,$2,$3,$4,NULLIF($5,''),NULLIF($6,''),$7,$8::jsonb,$9,$10::jsonb,$11,$12,$13,$14,$15,NULLIF($16,''))
		RETURNING `+serviceAdjustmentColumns,
		req.OrderID, customerID, courierID, category, serviceCode, serviceSubType,
		req.Reason, itemsJSON, quoteID, pricingSnapshot, originalTotal, deltaIDR, proposedTotal,
		req.IdempotencyKey, req.RequestFingerprint, req.CorrelationID))
	if err != nil {
		return nil, fmt.Errorf("persist service adjustment: %w", err)
	}

	payload, _ := json.Marshal(map[string]any{
		"adjustment_id":      adjustment.ID,
		"order_id":           adjustment.OrderID,
		"initial_quote_id":   adjustment.InitialQuoteID,
		"original_total_idr": adjustment.OriginalTotalIDR,
		"delta_idr":          adjustment.DeltaIDR,
		"proposed_total_idr": adjustment.ProposedTotalIDR,
		"items":              adjustment.Items,
		"correlation_id":     req.CorrelationID,
	})
	if _, err := tx.ExecContext(ctx, `INSERT INTO audit_logs (actor_id, action, target_id, payload) VALUES ($1, 'service_adjustment.proposed', $2, $3::jsonb)`, courierID, adjustment.ID, payload); err != nil {
		return nil, fmt.Errorf("audit service adjustment proposal: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit service adjustment proposal: %w", err)
	}
	return adjustment, nil
}

func (r *serviceAdjustmentRepo) ListForCustomer(ctx context.Context, orderID, customerID string) ([]domain.ServiceAdjustment, error) {
	var owns bool
	if err := r.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM orders WHERE id = $1 AND customer_id = $2)`, orderID, customerID).Scan(&owns); err != nil {
		return nil, fmt.Errorf("verify service adjustment customer: %w", err)
	}
	if !owns {
		return nil, domain.ErrServiceAdjustmentForbidden
	}
	rows, err := r.db.QueryContext(ctx, `SELECT `+serviceAdjustmentColumns+` FROM service_adjustments WHERE order_id = $1 ORDER BY created_at DESC`, orderID)
	if err != nil {
		return nil, fmt.Errorf("list service adjustments: %w", err)
	}
	defer rows.Close()
	result := make([]domain.ServiceAdjustment, 0)
	for rows.Next() {
		item, err := scanServiceAdjustment(rows)
		if err != nil {
			return nil, fmt.Errorf("scan service adjustment: %w", err)
		}
		result = append(result, *item)
	}
	return result, rows.Err()
}

func (r *serviceAdjustmentRepo) Decide(ctx context.Context, req *domain.DecideServiceAdjustmentRequest, customerID string) (*domain.ServiceAdjustment, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin service adjustment decision: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "service_adjustment_decision:"+req.AdjustmentID); err != nil {
		return nil, fmt.Errorf("lock service adjustment decision: %w", err)
	}

	adjustment, currentTotal, decisionKey, decisionHash, err := r.getForDecisionTx(ctx, tx, req.AdjustmentID, customerID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrServiceAdjustmentForbidden
		}
		return nil, fmt.Errorf("read service adjustment decision: %w", err)
	}
	if adjustment.Status != domain.ServiceAdjustmentStatusPending {
		if decisionKey == req.IdempotencyKey && decisionHash == req.RequestFingerprint &&
			((req.Decision == "approve" && adjustment.Status == domain.ServiceAdjustmentStatusApproved) ||
				(req.Decision == "reject" && adjustment.Status == domain.ServiceAdjustmentStatusRejected)) {
			return adjustment, nil
		}
		return nil, domain.ErrServiceAdjustmentConflict
	}
	if decisionKey != "" && (decisionKey != req.IdempotencyKey || decisionHash != req.RequestFingerprint) {
		return nil, domain.ErrServiceAdjustmentIdempotencyConflict
	}

	if req.Decision == "approve" {
		if currentTotal != adjustment.OriginalTotalIDR {
			return nil, domain.ErrServiceAdjustmentStale
		}
		if _, err := tx.ExecContext(ctx, `UPDATE orders SET total_price_idr = $2, updated_at = NOW() WHERE id = $1`, adjustment.OrderID, adjustment.ProposedTotalIDR); err != nil {
			return nil, fmt.Errorf("update order service adjustment total: %w", err)
		}
		adjustment, err = scanServiceAdjustment(tx.QueryRowContext(ctx, `
			UPDATE service_adjustments
			SET status = 'approved', financial_state = 'pending_collection', approved_delta_idr = delta_idr,
			    approved_by_customer_id = $2, approved_at = NOW(), decision_idempotency_key = $3,
			    decision_request_hash = $4, correlation_id = COALESCE(NULLIF($5,''), correlation_id), updated_at = NOW()
			WHERE id = $1 AND status = 'pending'
			RETURNING `+serviceAdjustmentColumns,
			req.AdjustmentID, customerID, req.IdempotencyKey, req.RequestFingerprint, req.CorrelationID))
	} else {
		adjustment, err = scanServiceAdjustment(tx.QueryRowContext(ctx, `
			UPDATE service_adjustments
			SET status = 'rejected', financial_state = 'not_due', approved_delta_idr = 0,
			    rejected_by_customer_id = $2, rejected_at = NOW(), rejection_reason = $3,
			    decision_idempotency_key = $4, decision_request_hash = $5,
			    correlation_id = COALESCE(NULLIF($6,''), correlation_id), updated_at = NOW()
			WHERE id = $1 AND status = 'pending'
			RETURNING `+serviceAdjustmentColumns,
			req.AdjustmentID, customerID, req.RejectionReason, req.IdempotencyKey, req.RequestFingerprint, req.CorrelationID))
	}
	if err != nil {
		return nil, fmt.Errorf("persist service adjustment decision: %w", err)
	}

	action := "service_adjustment.rejected"
	if req.Decision == "approve" {
		action = "service_adjustment.approved"
	}
	payload, _ := json.Marshal(map[string]any{
		"adjustment_id":      adjustment.ID,
		"order_id":           adjustment.OrderID,
		"decision":           req.Decision,
		"approved_delta_idr": adjustment.ApprovedDeltaIDR,
		"proposed_total_idr": adjustment.ProposedTotalIDR,
		"financial_state":    adjustment.FinancialState,
		"rejection_reason":   req.RejectionReason,
		"correlation_id":     req.CorrelationID,
	})
	if _, err := tx.ExecContext(ctx, `INSERT INTO audit_logs (actor_id, action, target_id, payload) VALUES ($1, $2, $3, $4::jsonb)`, customerID, action, adjustment.ID, payload); err != nil {
		return nil, fmt.Errorf("audit service adjustment decision: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit service adjustment decision: %w", err)
	}
	return adjustment, nil
}

func (r *serviceAdjustmentRepo) getProposalByIdempotencyTx(ctx context.Context, tx *sql.Tx, courierID, key string) (*domain.ServiceAdjustment, string, error) {
	var requestHash string
	adjustment, err := scanServiceAdjustmentWithExtra(tx.QueryRowContext(ctx, `SELECT `+serviceAdjustmentColumns+`, proposal_request_hash FROM service_adjustments WHERE requested_by_courier_id = $1 AND proposal_idempotency_key = $2`, courierID, key), &requestHash)
	return adjustment, requestHash, err
}

func qualifiedServiceAdjustmentColumns(alias string) string {
	columns := strings.Split(serviceAdjustmentColumns, ",")
	for i, column := range columns {
		columns[i] = alias + "." + strings.TrimSpace(column)
	}
	return strings.Join(columns, ", ")
}

func (r *serviceAdjustmentRepo) getForDecisionTx(ctx context.Context, tx *sql.Tx, adjustmentID, customerID string) (*domain.ServiceAdjustment, int64, string, string, error) {
	var currentTotal int64
	var key, requestHash sql.NullString
	adjustment, err := scanServiceAdjustmentWithExtra(tx.QueryRowContext(ctx, `
		SELECT `+qualifiedServiceAdjustmentColumns("sa")+`, o.total_price_idr,
		       sa.decision_idempotency_key, sa.decision_request_hash
		FROM service_adjustments sa
		JOIN orders o ON o.id = sa.order_id AND o.customer_id = $2
		WHERE sa.id = $1
		FOR UPDATE OF sa, o`, adjustmentID, customerID), &currentTotal, &key, &requestHash)
	return adjustment, currentTotal, key.String, requestHash.String, err
}

type serviceAdjustmentScanner interface {
	Scan(dest ...any) error
}

func scanServiceAdjustment(scanner serviceAdjustmentScanner) (*domain.ServiceAdjustment, error) {
	return scanServiceAdjustmentWithExtra(scanner)
}

func scanServiceAdjustmentWithExtra(scanner serviceAdjustmentScanner, extra ...any) (*domain.ServiceAdjustment, error) {
	item := &domain.ServiceAdjustment{}
	var itemsJSON, pricingJSON []byte
	var serviceCode, serviceSubType, correlation sql.NullString
	var approvedBy, rejectedBy, rejectionReason sql.NullString
	var approvedAt, rejectedAt sql.NullTime
	dest := []any{
		&item.ID, &item.OrderID, &item.CustomerID, &item.RequestedByCourierID,
		&item.ServiceCategory, &serviceCode, &serviceSubType, &item.Reason, &itemsJSON,
		&item.InitialQuoteID, &pricingJSON, &item.OriginalTotalIDR, &item.DeltaIDR,
		&item.ProposedTotalIDR, &item.ApprovedDeltaIDR, &item.Status, &item.FinancialState,
		&approvedBy, &approvedAt, &rejectedBy, &rejectedAt, &rejectionReason,
		&correlation, &item.CreatedAt, &item.UpdatedAt,
	}
	dest = append(dest, extra...)
	if err := scanner.Scan(dest...); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(itemsJSON, &item.Items); err != nil {
		return nil, fmt.Errorf("decode service adjustment items: %w", err)
	}
	item.InitialPricingSnapshot = append(json.RawMessage(nil), pricingJSON...)
	item.ServiceCode = serviceCode.String
	item.ServiceSubType = serviceSubType.String
	item.CorrelationID = correlation.String
	if approvedBy.Valid {
		item.ApprovedByCustomerID = &approvedBy.String
	}
	if approvedAt.Valid {
		t := approvedAt.Time
		item.ApprovedAt = &t
	}
	if rejectedBy.Valid {
		item.RejectedByCustomerID = &rejectedBy.String
	}
	if rejectedAt.Valid {
		t := rejectedAt.Time
		item.RejectedAt = &t
	}
	if rejectionReason.Valid {
		item.RejectionReason = &rejectionReason.String
	}
	return item, nil
}
