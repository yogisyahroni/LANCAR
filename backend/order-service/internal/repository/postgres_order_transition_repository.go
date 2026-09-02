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

	"github.com/google/uuid"
)

type lockedOrderTransition struct {
	ID                string
	CustomerID        string
	Status            domain.OrderStatus
	ServiceCategory   string
	Model             string
	ServiceSubType    string
	LogisticsProvider string
	StateVersion      int64
	BasePriceIDR      int64
	VolumetricIDR     int64
	DynamicPriceIDR   int64
	TotalPriceIDR     int64
	BatchID           sql.NullString
}

// TransitionOrder is the only repository write path that combines an order
// lifecycle mutation with its audit event, optional proof, and delivery ledger
// effect. The row lock serializes competing actors; the idempotency index makes
// retries safe across service instances.
func (r *postgresRepo) TransitionOrder(ctx context.Context, request domain.OrderTransitionRequest) (domain.OrderTransitionResult, error) {
	request = request.Normalized()
	if request.OrderID == "" {
		return domain.OrderTransitionResult{}, fmt.Errorf("order id is required")
	}
	if request.TargetStatus == "" {
		return domain.OrderTransitionResult{}, fmt.Errorf("target status is required")
	}
	if request.Actor == "" {
		return domain.OrderTransitionResult{}, fmt.Errorf("actor is required")
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.OrderTransitionResult{}, fmt.Errorf("begin order transition: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	// Explicit transport/provider keys are checked before locking the order.
	// The same check is repeated after the order lock for the concurrent case.
	if request.IdempotencyKey != "" {
		if replay, found, err := findTransitionReplay(ctx, tx, request.IdempotencyKey); err != nil {
			return domain.OrderTransitionResult{}, err
		} else if found {
			return replay, tx.Commit()
		}
	}

	var order lockedOrderTransition
	err = tx.QueryRowContext(ctx, `
		SELECT id::text, COALESCE(customer_id::text, ''), status,
		       COALESCE(service_category, ''), COALESCE(model, ''),
		       COALESCE(service_sub_type, ''), COALESCE(logistics_provider, ''),
		       COALESCE(state_version, 1), COALESCE(base_price_idr, 0),
		       COALESCE(volumetric_surcharge_idr, 0), COALESCE(dynamic_price_idr, 0),
		       COALESCE(total_price_idr, 0), batch_id::text
		  FROM orders
		 WHERE id = $1
		 FOR UPDATE`, request.OrderID).Scan(
		&order.ID, &order.CustomerID, &order.Status, &order.ServiceCategory,
		&order.Model, &order.ServiceSubType, &order.LogisticsProvider,
		&order.StateVersion, &order.BasePriceIDR, &order.VolumetricIDR,
		&order.DynamicPriceIDR, &order.TotalPriceIDR, &order.BatchID,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.OrderTransitionResult{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.OrderTransitionResult{}, fmt.Errorf("lock order for transition: %w", err)
	}

	if request.IdempotencyKey != "" {
		if replay, found, err := findTransitionReplay(ctx, tx, request.IdempotencyKey); err != nil {
			return domain.OrderTransitionResult{}, err
		} else if found {
			return replay, tx.Commit()
		}
	} else {
		request.IdempotencyKey = fmt.Sprintf("order-transition:%s:%d:%s:%s", order.ID, order.StateVersion, request.Actor, request.TargetStatus)
	}

	result := domain.OrderTransitionResult{
		OrderID:        order.ID,
		PreviousStatus: order.Status,
		Status:         order.Status,
		StateVersion:   order.StateVersion,
	}
	if order.Status == request.TargetStatus {
		return result, tx.Commit()
	}

	category := domain.CanonicalServiceCategory(order.ServiceCategory)
	if category == "" {
		legacy := &domain.Order{Model: order.Model, ServiceSubType: order.ServiceSubType, LogisticsProvider: order.LogisticsProvider}
		legacy.ApplyCanonicalOrderContract()
		if legacy.ServiceCategory != "" {
			category = domain.CanonicalServiceCategory(legacy.ServiceCategory)
		}
	}
	if err := domain.ValidateOrderTransition(order.Status, request.TargetStatus, request.Actor, category); err != nil {
		return domain.OrderTransitionResult{}, err
	}
	if request.Actor == domain.OrderActorAdmin && request.Reason == "" {
		return domain.OrderTransitionResult{}, domain.ErrAdminOverrideReasonRequired
	}
	if request.TargetStatus == domain.StatusCancelled && request.Reason == "" {
		request.Reason = "Order cancelled by " + string(request.Actor)
	}
	if request.Proof != nil && request.Proof.HandoffToken != "" {
		stage := domain.HandoffStageDelivery
		if request.Proof.ScanType == "pickup" {
			stage = domain.HandoffStagePickup
		}
		if err := r.consumeHandoffTokenForTransition(ctx, tx, request.Proof.HandoffToken, order.ID, request.ActorID, stage, time.Now().UTC()); err != nil {
			return domain.OrderTransitionResult{}, fmt.Errorf("handoff verification failed: %w", err)
		}
	}

	if request.TargetStatus == domain.StatusDelivered {
		if err := validateDeliveredProof(ctx, tx, order.ID, request); err != nil {
			return domain.OrderTransitionResult{}, err
		}
	}
	if request.Proof != nil {
		proofID, err := insertTransitionProof(ctx, tx, order.ID, request)
		if err != nil {
			return domain.OrderTransitionResult{}, err
		}
		result.ProofID = proofID
	}

	var stateVersion int64
	var statusUpdateQuery string
	var statusUpdateArgs []any
	switch {
	case request.ClearDispatchExpiry:
		statusUpdateQuery = `
			UPDATE orders
			   SET status = $1, dispatch_expiry = NULL, updated_at = $2
			 WHERE id = $3
			RETURNING state_version`
		statusUpdateArgs = []any{request.TargetStatus, time.Now().UTC(), order.ID}
	default:
		statusUpdateQuery = `
			UPDATE orders
			   SET status = $1, updated_at = $2
			 WHERE id = $3
			RETURNING state_version`
		statusUpdateArgs = []any{request.TargetStatus, time.Now().UTC(), order.ID}
	}
	err = tx.QueryRowContext(ctx, statusUpdateQuery, statusUpdateArgs...).Scan(&stateVersion)
	if err != nil {
		return domain.OrderTransitionResult{}, fmt.Errorf("commit order status: %w", err)
	}
	result.StateVersion = stateVersion
	result.Status = request.TargetStatus
	if request.CourierID != "" {
		if _, err := tx.ExecContext(ctx, `
			UPDATE order_legs
			   SET courier_id = $1,
			       status = 'assigned',
			       assigned_at = COALESCE(assigned_at, NOW()),
			       updated_at = NOW()
			 WHERE order_id = $2
			   AND status NOT IN ('delivered', 'completed', 'cancelled', 'failed', 'rejected')`, request.CourierID, order.ID); err != nil {
			return domain.OrderTransitionResult{}, fmt.Errorf("persist courier assignment: %w", err)
		}
	} else if request.ClearCourier {
		if _, err := tx.ExecContext(ctx, `
			UPDATE order_legs
			   SET courier_id = NULL, updated_at = NOW()
			 WHERE order_id = $1
			   AND status NOT IN ('delivered', 'completed', 'cancelled', 'failed', 'rejected')`, order.ID); err != nil {
			return domain.OrderTransitionResult{}, fmt.Errorf("clear courier assignment: %w", err)
		}
	}
	if request.TargetStatus == domain.StatusPreparing && request.PreparationMinutes > 0 {
		if _, err := tx.ExecContext(ctx, `
			UPDATE orders
			   SET merchant_accepted_at = NOW(),
			       food_ready_at = NOW() + ($1 * INTERVAL '1 minute')
			 WHERE id = $2`, request.PreparationMinutes, order.ID); err != nil {
			return domain.OrderTransitionResult{}, fmt.Errorf("persist food preparation timestamps: %w", err)
		}
	}
	if request.TargetStatus == domain.StatusCancelled && request.Reason != "" {
		if _, err := tx.ExecContext(ctx, `
			UPDATE orders
			   SET cancellation_reason = $1, cancelled_at = NOW()
			 WHERE id = $2`, request.Reason, order.ID); err != nil {
			return domain.OrderTransitionResult{}, fmt.Errorf("persist cancellation reason: %w", err)
		}
	}

	if request.TargetStatus == domain.StatusDelivered || request.TargetStatus == domain.StatusCancelled {
		if _, err := tx.ExecContext(ctx, `
			UPDATE order_legs
			   SET status = $1, updated_at = NOW()
			 WHERE order_id = $2
			   AND status NOT IN ('delivered', 'completed', 'cancelled', 'failed', 'rejected')`, request.TargetStatus, order.ID); err != nil {
			return domain.OrderTransitionResult{}, fmt.Errorf("finalize order legs: %w", err)
		}
	}

	if request.TargetStatus == domain.StatusDelivered {
		journalID, err := insertDeliveryLedger(ctx, tx, order, request)
		if err != nil {
			return domain.OrderTransitionResult{}, err
		}
		result.LedgerJournalID = &journalID
	}

	eventType := "order.transition"
	if request.Actor == domain.OrderActorAdmin {
		eventType = "order.admin_override"
	}
	message := request.EventMessage
	if message == "" {
		message = fmt.Sprintf("Order status updated to %s", request.TargetStatus)
	}
	metadata, _ := json.Marshal(map[string]any{
		"transition":      true,
		"proof_reference": request.ProofReference,
	})
	var eventID string
	err = tx.QueryRowContext(ctx, `
		INSERT INTO order_events
			(order_id, user_id, event_type, description, created_at,
			 actor_id, actor_role, from_status, to_status, reason, idempotency_key, metadata)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), $7, $8, $9, NULLIF($10, ''), $11, $12)
		RETURNING id::text`, order.ID, order.CustomerID, eventType, message,
		time.Now().UTC(), request.ActorID, string(request.Actor), string(order.Status),
		string(request.TargetStatus), request.Reason, request.IdempotencyKey, metadata).Scan(&eventID)
	if err != nil {
		return domain.OrderTransitionResult{}, fmt.Errorf("write order transition audit: %w", err)
	}
	result.AuditEventID = eventID
	result.Applied = true

	if err := tx.Commit(); err != nil {
		return domain.OrderTransitionResult{}, fmt.Errorf("commit order transition: %w", err)
	}
	return result, nil
}

func findTransitionReplay(ctx context.Context, tx *sql.Tx, key string) (domain.OrderTransitionResult, bool, error) {
	var result domain.OrderTransitionResult
	err := tx.QueryRowContext(ctx, `
		SELECT order_id::text, COALESCE(from_status, ''), COALESCE(to_status, event_type),
		       COALESCE((SELECT state_version FROM orders WHERE id = order_events.order_id), 1),
		       id::text
		  FROM order_events
		 WHERE idempotency_key = $1
		 FOR UPDATE`, key).Scan(&result.OrderID, &result.PreviousStatus, &result.Status, &result.StateVersion, &result.AuditEventID)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.OrderTransitionResult{}, false, nil
	}
	if err != nil {
		return domain.OrderTransitionResult{}, false, fmt.Errorf("check transition idempotency: %w", err)
	}
	result.Applied = true
	result.Replayed = true
	return result, true, nil
}

func validateDeliveredProof(ctx context.Context, tx *sql.Tx, orderID string, request domain.OrderTransitionRequest) error {
	if request.ProofReference != "" {
		return nil
	}
	if request.Proof != nil {
		if request.Proof.ScanType != "delivered" {
			return domain.ErrTransitionProofRequired
		}
		if request.Proof.PhotoURL == nil || strings.TrimSpace(*request.Proof.PhotoURL) == "" {
			return domain.ErrTransitionProofRequired
		}
		return nil
	}
	var exists bool
	err := tx.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM package_scans
			 WHERE order_id = $1 AND scan_type = 'delivered'
			   AND NULLIF(BTRIM(photo_url), '') IS NOT NULL
		)`, orderID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("check delivered proof: %w", err)
	}
	if !exists {
		return domain.ErrTransitionProofRequired
	}
	return nil
}

func insertTransitionProof(ctx context.Context, tx *sql.Tx, orderID string, request domain.OrderTransitionRequest) (string, error) {
	proof := request.Proof
	if proof.OrderID == "" {
		proof.OrderID = orderID
	}
	if proof.OrderID != orderID || proof.ScannedBy == "" || proof.ScanType == "" {
		return "", fmt.Errorf("invalid transition proof")
	}
	if _, err := uuid.Parse(proof.ScannedBy); err != nil {
		return "", fmt.Errorf("invalid transition proof actor: %w", err)
	}
	proofRole := proof.ScannedByRole
	if proofRole == "" {
		proofRole = string(request.Actor)
	}
	var id string
	err := tx.QueryRowContext(ctx, `
		INSERT INTO package_scans
			(order_id, scan_type, scanned_by, scanned_by_role, latitude, longitude, photo_url, bag_number, idempotency_key, scanned_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
		RETURNING id::text`, orderID, proof.ScanType, proof.ScannedBy, proofRole, proof.Latitude,
		proof.Longitude, proof.PhotoURL, proof.BagNumber, request.IdempotencyKey).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("write transition proof: %w", err)
	}
	proof.ID = id
	proof.RecordedAt = time.Now().UTC()
	return id, nil
}

func insertDeliveryLedger(ctx context.Context, tx *sql.Tx, order lockedOrderTransition, request domain.OrderTransitionRequest) (uuid.UUID, error) {
	gross := order.BasePriceIDR + order.VolumetricIDR + order.DynamicPriceIDR
	if gross <= 0 {
		gross = order.TotalPriceIDR
	}
	if gross <= 0 {
		return uuid.Nil, domain.ErrTransitionLedgerRequired
	}
	courierPayable := int64(float64(gross) * 0.8)
	promoDiscount := gross - order.TotalPriceIDR
	if promoDiscount < 0 {
		promoDiscount = 0
	}
	entries := []domain.LedgerEntry{
		{AccountName: "unearned_revenue", DebitIDR: gross},
		{AccountName: "delivery_revenue", CreditIDR: gross},
		{AccountName: "courier_payout_expense", DebitIDR: courierPayable},
		{AccountName: "courier_payable", CreditIDR: courierPayable},
	}
	if promoDiscount > 0 {
		entries = append(entries,
			domain.LedgerEntry{AccountName: "promo_subsidy_expense", DebitIDR: promoDiscount},
			domain.LedgerEntry{AccountName: "unearned_revenue", CreditIDR: promoDiscount})
	}
	if err := domain.ValidateLedgerEntries(entries); err != nil {
		return uuid.Nil, fmt.Errorf("validate delivery ledger: %w", err)
	}

	key := "LEDGER-DELIVERED-" + order.ID
	var journalID uuid.UUID
	err := tx.QueryRowContext(ctx, `SELECT id FROM ledger_journals WHERE idempotency_key = $1 FOR UPDATE`, key).Scan(&journalID)
	if errors.Is(err, sql.ErrNoRows) {
		metadata, _ := json.Marshal(map[string]any{
			"order_id":                   order.ID,
			"batch_id":                   order.BatchID.String,
			"transition_idempotency_key": request.IdempotencyKey,
		})
		err = tx.QueryRowContext(ctx, `
			INSERT INTO ledger_journals
				(journal_type, reference_type, reference_id, idempotency_key, reason, metadata, created_by, actor_role)
			VALUES ('order_delivered', 'order', $1, $2, $3, $4, $5, $6)
			RETURNING id`, order.ID, key, "Revenue recognition and courier payout accrual on delivery", metadata, request.ActorID, string(request.Actor)).Scan(&journalID)
		if err != nil {
			return uuid.Nil, fmt.Errorf("write delivery ledger journal: %w", err)
		}
		for _, entry := range entries {
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO ledger_entries (journal_id, account_name, debit_idr, credit_idr)
				VALUES ($1, $2, $3, $4)`, journalID, entry.AccountName, entry.DebitIDR, entry.CreditIDR); err != nil {
				return uuid.Nil, fmt.Errorf("write delivery ledger entry: %w", err)
			}
		}
	} else if err != nil {
		return uuid.Nil, fmt.Errorf("check delivery ledger idempotency: %w", err)
	}
	return journalID, nil
}
