package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"tembus/merchant-service/internal/domain"
)

type postgresMerchantIntegrationRepository struct {
	db *sql.DB
}

func NewPostgresMerchantIntegrationRepository(db *sql.DB) domain.MerchantIntegrationRepository {
	return &postgresMerchantIntegrationRepository{db: db}
}

func (r *postgresMerchantIntegrationRepository) GetPOSStatusByOwnerUser(ctx context.Context, ownerUserID string) (*domain.MerchantPOSIntegrationStatus, error) {
	var merchantID string
	if err := r.db.QueryRowContext(ctx, `SELECT id FROM merchants WHERE user_id = $1::uuid`, ownerUserID).Scan(&merchantID); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("merchant belum terdaftar")
		}
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT b.provider_code, COALESCE(h.provider_name, b.provider_code), b.branch_id,
		       b.enabled, COALESCE(h.state, 'unknown'), COALESCE(h.capabilities, '[]'::jsonb),
		       h.last_checked_at, h.last_latency_ms, COALESCE(h.consecutive_failures, 0),
		       h.availability_reason,
		       COALESCE((SELECT COUNT(*)::int FROM pos_reconciliation_items reconciliation
	                  WHERE reconciliation.merchant_id = b.merchant_id
	                    AND reconciliation.provider_code = b.provider_code
	                    AND reconciliation.status = 'open'), 0),
	       COALESCE((SELECT COUNT(*)::int FROM pos_order_deliveries delivery
	                  WHERE delivery.merchant_id = b.merchant_id
	                    AND delivery.provider_code = b.provider_code
	                    AND delivery.status = 'failed'), 0),
	       COALESCE((SELECT COUNT(*)::int FROM pos_order_deliveries delivery
	                  WHERE delivery.merchant_id = b.merchant_id
	                    AND delivery.provider_code = b.provider_code
	                    AND delivery.status = 'pending'), 0)
		FROM pos_connector_bindings b
		LEFT JOIN pos_connector_health h ON h.provider_code = b.provider_code
		WHERE b.merchant_id = $1::uuid
		ORDER BY b.provider_code, b.branch_id NULLS FIRST`, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	status := &domain.MerchantPOSIntegrationStatus{
		MerchantID:             merchantID,
		CanonicalOwner:         "lancar",
		CatalogOwnership:       "LANCAR owns catalog identity, price, moderation and availability; POS is a projection target",
		InventoryOwnership:     "LANCAR owns stock and reservations; POS may acknowledge the projection but cannot mutate stock",
		CustomerAcceptanceRule: "POS receipt only means merchant system received the order; customer acceptance requires order-service merchant acceptance",
		Connectors:             make([]domain.MerchantPOSConnectorStatus, 0),
	}
	for rows.Next() {
		var connector domain.MerchantPOSConnectorStatus
		var branchID sql.NullString
		var capabilities []byte
		var checkedAt sql.NullTime
		var latency sql.NullInt64
		var reason sql.NullString
		if err := rows.Scan(&connector.ProviderCode, &connector.ProviderName, &branchID, &connector.Enabled,
			&connector.State, &capabilities, &checkedAt, &latency, &connector.ConsecutiveFailures,
			&reason, &connector.OpenReconciliation, &connector.FailedOrderDeliveries,
			&connector.PendingOrderDeliveries); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(capabilities, &connector.Capabilities)
		if branchID.Valid {
			connector.BranchID = branchID.String
		}
		if checkedAt.Valid {
			connector.LastCheckedAt = checkedAt.Time.UTC().Format("2006-01-02T15:04:05.999999999Z07:00")
		}
		if latency.Valid {
			connector.LastLatencyMS = latency.Int64
		}
		if reason.Valid {
			connector.AvailabilityReason = reason.String
		}
		status.Connectors = append(status.Connectors, connector)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return status, nil
}
