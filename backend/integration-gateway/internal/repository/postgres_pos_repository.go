package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"tembus/integration-gateway/internal/domain"
)

type postgresPOSRepository struct {
	db *sql.DB
}

func NewPostgresPOSRepository(db *sql.DB) domain.POSRepository {
	return &postgresPOSRepository{db: db}
}

func (r *postgresPOSRepository) BeginOrderDelivery(ctx context.Context, req domain.POSOrderRequest, providerCode, requestHash string) (*domain.POSOrderDelivery, bool, bool, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, false, false, fmt.Errorf("begin POS order delivery: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO pos_connector_bindings (merchant_id, branch_id, provider_code)
		VALUES ($1::uuid, NULLIF($2, '')::uuid, $3)
		ON CONFLICT DO NOTHING`, req.MerchantID, req.BranchID, providerCode); err != nil {
		return nil, false, false, fmt.Errorf("bind POS connector: %w", err)
	}

	var delivery domain.POSOrderDelivery
	err = tx.QueryRowContext(ctx, `
		INSERT INTO pos_order_deliveries (
			merchant_id, branch_id, order_id, provider_code, idempotency_key,
			request_hash, status, merchant_received, customer_order_status,
			attempts, lease_until
		) VALUES ($1::uuid, NULLIF($2, '')::uuid, $3::uuid, $4, $5, $6, 'pending', FALSE, 'pending_merchant', 1, NOW() + INTERVAL '2 minutes')
		ON CONFLICT (provider_code, idempotency_key) DO NOTHING
		RETURNING id, merchant_id, branch_id, order_id, provider_code, idempotency_key,
		          status, merchant_received, customer_order_status, provider_receipt_id,
		          attempts, last_error, created_at, updated_at`,
		req.MerchantID, req.BranchID, req.OrderID, providerCode, req.IdempotencyKey, requestHash).
		Scan(&delivery.ID, &delivery.MerchantID, nullString(&delivery.BranchID), &delivery.OrderID,
			&delivery.ProviderCode, &delivery.IdempotencyKey, &delivery.Status,
			&delivery.MerchantReceived, &delivery.CustomerOrderStatus, nullString(&delivery.ProviderReceiptID),
			&delivery.Attempts, nullString(&delivery.LastError), &delivery.CreatedAt, &delivery.UpdatedAt)
	if err == nil {
		if err := r.insertEvent(ctx, tx, "order", delivery.ID, providerCode, "dispatch_started", nil); err != nil {
			return nil, false, false, err
		}
		if err := r.upsertReconciliation(ctx, tx, delivery.MerchantID, delivery.BranchID, providerCode, "order", delivery.OrderID, delivery.ID, "pending", false, delivery.Attempts, "awaiting POS acknowledgement"); err != nil {
			return nil, false, false, err
		}
		if err := tx.Commit(); err != nil {
			return nil, false, false, fmt.Errorf("commit POS order delivery: %w", err)
		}
		return &delivery, false, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, false, fmt.Errorf("insert POS order delivery: %w", err)
	}

	var existingHash string
	var leaseUntil sql.NullTime
	if err := tx.QueryRowContext(ctx, `
		SELECT id, merchant_id, branch_id, order_id, provider_code, idempotency_key,
		       request_hash, status, merchant_received, customer_order_status,
		       provider_receipt_id, attempts, lease_until, last_error, created_at, updated_at
		FROM pos_order_deliveries
		WHERE provider_code = $1 AND idempotency_key = $2
		FOR UPDATE`, providerCode, req.IdempotencyKey).
		Scan(&delivery.ID, &delivery.MerchantID, nullString(&delivery.BranchID), &delivery.OrderID,
			&delivery.ProviderCode, &delivery.IdempotencyKey, &existingHash, &delivery.Status,
			&delivery.MerchantReceived, &delivery.CustomerOrderStatus, nullString(&delivery.ProviderReceiptID),
			&delivery.Attempts, &leaseUntil, nullString(&delivery.LastError), &delivery.CreatedAt, &delivery.UpdatedAt); err != nil {
		return nil, false, false, fmt.Errorf("load POS idempotent delivery: %w", err)
	}
	if existingHash != requestHash {
		return nil, false, false, domain.ErrPOSIdempotencyConflict
	}
	if delivery.Status == "acknowledged" {
		if err := tx.Commit(); err != nil {
			return nil, false, false, fmt.Errorf("commit POS replay: %w", err)
		}
		return &delivery, true, false, nil
	}
	if leaseUntil.Valid && leaseUntil.Time.After(time.Now()) {
		if err := tx.Commit(); err != nil {
			return nil, false, false, fmt.Errorf("commit POS in-progress replay: %w", err)
		}
		return &delivery, true, true, nil
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE pos_order_deliveries
		SET status = 'pending', attempts = attempts + 1, lease_until = NOW() + INTERVAL '2 minutes',
		    last_error = NULL, updated_at = NOW()
		WHERE id = $1::uuid`, delivery.ID); err != nil {
		return nil, false, false, fmt.Errorf("claim POS retry: %w", err)
	}
	delivery.Status = "pending"
	delivery.Attempts++
	delivery.LastError = ""
	if err := r.insertEvent(ctx, tx, "order", delivery.ID, providerCode, "retry_started", map[string]any{"attempt": delivery.Attempts}); err != nil {
		return nil, false, false, err
	}
	if err := r.upsertReconciliation(ctx, tx, delivery.MerchantID, delivery.BranchID, providerCode, "order", delivery.OrderID, delivery.ID, "pending", false, delivery.Attempts, "retrying POS delivery"); err != nil {
		return nil, false, false, err
	}
	if err := tx.Commit(); err != nil {
		return nil, false, false, fmt.Errorf("commit POS retry: %w", err)
	}
	return &delivery, true, false, nil
}

func (r *postgresPOSRepository) FinishOrderDelivery(ctx context.Context, deliveryID, status, providerReceiptID, lastError string) error {
	if status != "acknowledged" && status != "failed" {
		return fmt.Errorf("invalid POS order delivery status %q", status)
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	var delivery domain.POSOrderDelivery
	err = tx.QueryRowContext(ctx, `
		UPDATE pos_order_deliveries
		SET status = $2::varchar, merchant_received = ($2::text = 'acknowledged'),
		    provider_receipt_id = NULLIF($3, ''), last_error = NULLIF($4, ''),
		    lease_until = NULL, acknowledged_at = CASE WHEN $2::text = 'acknowledged' THEN NOW() ELSE NULL END,
		    updated_at = NOW()
		WHERE id = $1::uuid
		RETURNING id, merchant_id, branch_id, order_id, provider_code, idempotency_key,
		          status, merchant_received, customer_order_status, provider_receipt_id,
		          attempts, last_error, created_at, updated_at`, deliveryID, status, providerReceiptID, lastError).
		Scan(&delivery.ID, &delivery.MerchantID, nullString(&delivery.BranchID), &delivery.OrderID,
			&delivery.ProviderCode, &delivery.IdempotencyKey, &delivery.Status,
			&delivery.MerchantReceived, &delivery.CustomerOrderStatus, nullString(&delivery.ProviderReceiptID),
			&delivery.Attempts, nullString(&delivery.LastError), &delivery.CreatedAt, &delivery.UpdatedAt)
	if err != nil {
		return fmt.Errorf("finish POS order delivery: %w", err)
	}
	eventType := "failed"
	if status == "acknowledged" {
		eventType = "acknowledged"
	}
	if err := r.insertEvent(ctx, tx, "order", delivery.ID, delivery.ProviderCode, eventType, map[string]any{"merchant_received": delivery.MerchantReceived}); err != nil {
		return err
	}
	if err := r.upsertReconciliation(ctx, tx, delivery.MerchantID, delivery.BranchID, delivery.ProviderCode, "order", delivery.OrderID, delivery.ID, status, delivery.MerchantReceived, delivery.Attempts, lastError); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *postgresPOSRepository) BeginSyncOperation(ctx context.Context, resourceType string, req domain.POSCatalogSyncRequest, providerCode, requestHash string) (*domain.POSSyncOperation, bool, bool, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, false, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO pos_connector_bindings (merchant_id, branch_id, provider_code)
		VALUES ($1::uuid, NULLIF($2, '')::uuid, $3)
		ON CONFLICT DO NOTHING`, req.MerchantID, req.BranchID, providerCode); err != nil {
		return nil, false, false, fmt.Errorf("bind POS connector for sync: %w", err)
	}
	var operation domain.POSSyncOperation
	err = tx.QueryRowContext(ctx, `
		INSERT INTO pos_sync_operations (
			merchant_id, branch_id, provider_code, resource_type, resource_id,
			canonical_version, idempotency_key, request_hash, status, attempts, lease_until
		) VALUES ($1::uuid, NULLIF($2, '')::uuid, $3, $4, $5, $6, $7, $8, 'pending', 1, NOW() + INTERVAL '2 minutes')
		ON CONFLICT (provider_code, resource_type, idempotency_key) DO NOTHING
		RETURNING id, merchant_id, branch_id, provider_code, resource_type, resource_id,
		          canonical_version, status, provider_receipt_id, attempts, last_error`,
		req.MerchantID, req.BranchID, providerCode, resourceType, req.ResourceID,
		req.CanonicalVersion, req.IdempotencyKey, requestHash).
		Scan(&operation.ID, &operation.MerchantID, nullString(&operation.BranchID), &operation.ProviderCode,
			&operation.ResourceType, &operation.ResourceID, &operation.CanonicalVersion, &operation.Status,
			nullString(&operation.ProviderReceiptID), &operation.Attempts, nullString(&operation.LastError))
	if err == nil {
		if err := r.insertEvent(ctx, tx, "sync", operation.ID, providerCode, "dispatch_started", map[string]any{"resource_type": resourceType}); err != nil {
			return nil, false, false, err
		}
		if err := r.upsertReconciliation(ctx, tx, operation.MerchantID, operation.BranchID, providerCode, resourceType, operation.ResourceID, operation.ID, "pending", false, operation.Attempts, "awaiting POS sync acknowledgement"); err != nil {
			return nil, false, false, err
		}
		if err := tx.Commit(); err != nil {
			return nil, false, false, err
		}
		return &operation, false, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, false, fmt.Errorf("insert POS sync operation: %w", err)
	}
	var existingHash string
	var leaseUntil sql.NullTime
	if err := tx.QueryRowContext(ctx, `
		SELECT id, merchant_id, branch_id, provider_code, resource_type, resource_id,
		       canonical_version, request_hash, status, provider_receipt_id, attempts,
		       lease_until, last_error
		FROM pos_sync_operations
		WHERE provider_code = $1 AND resource_type = $2 AND idempotency_key = $3
		FOR UPDATE`, providerCode, resourceType, req.IdempotencyKey).
		Scan(&operation.ID, &operation.MerchantID, nullString(&operation.BranchID), &operation.ProviderCode,
			&operation.ResourceType, &operation.ResourceID, &operation.CanonicalVersion, &existingHash,
			&operation.Status, nullString(&operation.ProviderReceiptID), &operation.Attempts, &leaseUntil,
			nullString(&operation.LastError)); err != nil {
		return nil, false, false, err
	}
	if existingHash != requestHash {
		return nil, false, false, domain.ErrPOSIdempotencyConflict
	}
	if operation.Status == "acknowledged" {
		if err := tx.Commit(); err != nil {
			return nil, false, false, err
		}
		return &operation, true, false, nil
	}
	if leaseUntil.Valid && leaseUntil.Time.After(time.Now()) {
		if err := tx.Commit(); err != nil {
			return nil, false, false, err
		}
		return &operation, true, true, nil
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE pos_sync_operations
		SET status = 'pending', attempts = attempts + 1, lease_until = NOW() + INTERVAL '2 minutes',
		    last_error = NULL, updated_at = NOW()
		WHERE id = $1::uuid`, operation.ID); err != nil {
		return nil, false, false, err
	}
	operation.Status = "pending"
	operation.Attempts++
	operation.LastError = ""
	if err := r.insertEvent(ctx, tx, "sync", operation.ID, providerCode, "retry_started", map[string]any{"attempt": operation.Attempts, "resource_type": resourceType}); err != nil {
		return nil, false, false, err
	}
	if err := r.upsertReconciliation(ctx, tx, operation.MerchantID, operation.BranchID, providerCode, resourceType, operation.ResourceID, operation.ID, "pending", false, operation.Attempts, "retrying POS sync"); err != nil {
		return nil, false, false, err
	}
	if err := tx.Commit(); err != nil {
		return nil, false, false, err
	}
	return &operation, true, false, nil
}

func (r *postgresPOSRepository) FinishSyncOperation(ctx context.Context, operationID, status, providerReceiptID, lastError string) error {
	if status != "acknowledged" && status != "failed" {
		return fmt.Errorf("invalid POS sync status %q", status)
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	var operation domain.POSSyncOperation
	err = tx.QueryRowContext(ctx, `
		UPDATE pos_sync_operations
		SET status = $2::varchar, provider_receipt_id = NULLIF($3, ''), last_error = NULLIF($4, ''),
		    lease_until = NULL, acknowledged_at = CASE WHEN $2::text = 'acknowledged' THEN NOW() ELSE NULL END,
		    updated_at = NOW()
		WHERE id = $1::uuid
		RETURNING id, merchant_id, branch_id, provider_code, resource_type, resource_id,
		          canonical_version, status, provider_receipt_id, attempts, last_error`,
		operationID, status, providerReceiptID, lastError).
		Scan(&operation.ID, &operation.MerchantID, nullString(&operation.BranchID), &operation.ProviderCode,
			&operation.ResourceType, &operation.ResourceID, &operation.CanonicalVersion, &operation.Status,
			nullString(&operation.ProviderReceiptID), &operation.Attempts, nullString(&operation.LastError))
	if err != nil {
		return fmt.Errorf("finish POS sync: %w", err)
	}
	eventType := "failed"
	if status == "acknowledged" {
		eventType = "acknowledged"
	}
	if err := r.insertEvent(ctx, tx, "sync", operation.ID, operation.ProviderCode, eventType, map[string]any{"resource_type": operation.ResourceType}); err != nil {
		return err
	}
	if err := r.upsertReconciliation(ctx, tx, operation.MerchantID, operation.BranchID, operation.ProviderCode, operation.ResourceType, operation.ResourceID, operation.ID, status, false, operation.Attempts, lastError); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *postgresPOSRepository) RecordHealth(ctx context.Context, health domain.POSHealth) error {
	capabilities, err := json.Marshal(health.Capabilities)
	if err != nil {
		return err
	}
	var checkedAt any
	if health.LastCheckedAt != "" {
		if parsed, parseErr := time.Parse(time.RFC3339Nano, health.LastCheckedAt); parseErr == nil {
			checkedAt = parsed
		}
	}
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO pos_connector_health (
			provider_code, provider_name, state, capabilities, last_checked_at,
			last_latency_ms, consecutive_failures, last_error, availability_reason, updated_at
		) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NULLIF($8, ''), NULLIF($9, ''), NOW())
		ON CONFLICT (provider_code) DO UPDATE SET
			provider_name = EXCLUDED.provider_name, state = EXCLUDED.state,
			capabilities = EXCLUDED.capabilities, last_checked_at = EXCLUDED.last_checked_at,
			last_latency_ms = EXCLUDED.last_latency_ms, consecutive_failures = EXCLUDED.consecutive_failures,
			last_error = EXCLUDED.last_error, availability_reason = EXCLUDED.availability_reason,
			updated_at = NOW()`, health.ProviderCode, health.ProviderName, health.State, string(capabilities), checkedAt,
		health.LastLatencyMS, health.ConsecutiveFailures, health.LastError, health.AvailabilityReason)
	return err
}

func (r *postgresPOSRepository) ListHealth(ctx context.Context, merchantID string) ([]domain.POSHealth, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT h.provider_code, h.provider_name, h.state, h.capabilities,
		       h.last_checked_at, h.last_latency_ms, h.consecutive_failures,
		       h.last_error, h.availability_reason
		FROM pos_connector_health h
		WHERE ($1 = '' OR EXISTS (
			SELECT 1 FROM pos_connector_bindings b
			WHERE b.provider_code = h.provider_code AND b.merchant_id = NULLIF($1, '')::uuid AND b.enabled
		))
		ORDER BY h.provider_code`, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]domain.POSHealth, 0)
	for rows.Next() {
		var health domain.POSHealth
		var capabilities []byte
		var checkedAt sql.NullTime
		var latency sql.NullInt64
		var lastError, reason sql.NullString
		if err := rows.Scan(&health.ProviderCode, &health.ProviderName, &health.State, &capabilities,
			&checkedAt, &latency, &health.ConsecutiveFailures, &lastError, &reason); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(capabilities, &health.Capabilities)
		if checkedAt.Valid {
			health.LastCheckedAt = checkedAt.Time.UTC().Format(time.RFC3339Nano)
		}
		if latency.Valid {
			health.LastLatencyMS = latency.Int64
		}
		if lastError.Valid {
			health.LastError = lastError.String
		}
		if reason.Valid {
			health.AvailabilityReason = reason.String
		}
		result = append(result, health)
	}
	return result, rows.Err()
}

func (r *postgresPOSRepository) ListReconciliation(ctx context.Context, merchantID string, limit int) ([]domain.POSReconciliationItem, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, merchant_id, branch_id, provider_code, resource_type, resource_id,
		       status, local_status, merchant_received, attempts, reason, last_seen_at
		FROM pos_reconciliation_items
		WHERE ($1 = '' OR merchant_id = NULLIF($1, '')::uuid)
		ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, last_seen_at DESC
		LIMIT $2`, merchantID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]domain.POSReconciliationItem, 0)
	for rows.Next() {
		var item domain.POSReconciliationItem
		var updatedAt time.Time
		var branchID, reason sql.NullString
		if err := rows.Scan(&item.ID, &item.MerchantID, &branchID, &item.ProviderCode, &item.ResourceType,
			&item.ResourceID, &item.Status, &item.LocalStatus, &item.MerchantReceived,
			&item.Attempts, &reason, &updatedAt); err != nil {
			return nil, err
		}
		if branchID.Valid {
			item.BranchID = branchID.String
		}
		if reason.Valid {
			item.Reason = reason.String
		}
		item.UpdatedAt = updatedAt.UTC().Format(time.RFC3339Nano)
		result = append(result, item)
	}
	return result, rows.Err()
}

func (r *postgresPOSRepository) insertEvent(ctx context.Context, tx *sql.Tx, entityType, entityID, providerCode, eventType string, metadata map[string]any) error {
	if metadata == nil {
		metadata = map[string]any{}
	}
	payload, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO pos_integration_events (entity_type, entity_id, provider_code, event_type, metadata)
		VALUES ($1, $2::uuid, $3, $4, $5::jsonb)`, entityType, entityID, providerCode, eventType, string(payload))
	return err
}

func (r *postgresPOSRepository) upsertReconciliation(ctx context.Context, tx *sql.Tx, merchantID, branchID, providerCode, resourceType, resourceID, sourceEntityID, localStatus string, merchantReceived bool, attempts int, reason string) error {
	status := "open"
	if localStatus == "acknowledged" {
		status = "resolved"
	}
	_, err := tx.ExecContext(ctx, `
		INSERT INTO pos_reconciliation_items (
			merchant_id, branch_id, provider_code, resource_type, resource_id,
			source_entity_id, status, local_status, merchant_received, attempts, reason,
			resolved_at
		) VALUES ($1::uuid, NULLIF($2, '')::uuid, $3, $4, $5, $6::uuid, $7::varchar, $8::varchar, $9, $10, NULLIF($11, ''), CASE WHEN $7::text = 'resolved' THEN NOW() ELSE NULL END)
		ON CONFLICT (provider_code, resource_type, resource_id) DO UPDATE SET
			merchant_id = EXCLUDED.merchant_id, branch_id = EXCLUDED.branch_id,
			source_entity_id = EXCLUDED.source_entity_id, status = EXCLUDED.status,
			local_status = EXCLUDED.local_status, merchant_received = EXCLUDED.merchant_received,
			attempts = EXCLUDED.attempts, reason = EXCLUDED.reason,
			last_seen_at = NOW(), resolved_at = EXCLUDED.resolved_at`,
		merchantID, branchID, providerCode, resourceType, resourceID, sourceEntityID,
		status, localStatus, merchantReceived, attempts, reason)
	return err
}

type nullableStringScanner struct {
	target *string
}

func (s *nullableStringScanner) Scan(src any) error {
	if src == nil {
		*s.target = ""
		return nil
	}
	switch value := src.(type) {
	case string:
		*s.target = value
	case []byte:
		*s.target = string(value)
	default:
		return fmt.Errorf("cannot scan %T into string", src)
	}
	return nil
}

func nullString(target *string) *nullableStringScanner {
	return &nullableStringScanner{target: target}
}
