package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"tembus/merchant-service/internal/domain"
)

type postgresMerchantAuditRepository struct {
	db *sql.DB
}

func NewPostgresMerchantAuditRepository(db *sql.DB) domain.MerchantAuditRepository {
	return &postgresMerchantAuditRepository{db: db}
}

// List returns only events written for the resolved merchant. Outlet filtering
// is deliberately optional: an empty outlet means all outlets in the same
// merchant tenant, never all tenants.
func (r *postgresMerchantAuditRepository) List(ctx context.Context, merchantID, outletID string, limit, offset int) ([]domain.MerchantAuditEntry, int, error) {
	if r == nil || r.db == nil {
		return nil, 0, fmt.Errorf("merchant audit repository database is not configured")
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	const filter = `
		FROM audit_logs
		WHERE merchant_id = $1
		  AND ($2 = '' OR COALESCE(payload::jsonb ->> 'outlet_id', '') = $2)`
	var total int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) `+filter, merchantID, outletID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count merchant audit events: %w", err)
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, actor_id, action, target_id, payload, created_at `+filter+`
		ORDER BY created_at DESC, id DESC
		LIMIT $3 OFFSET $4`, merchantID, outletID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list merchant audit events: %w", err)
	}
	defer rows.Close()

	entries := make([]domain.MerchantAuditEntry, 0, limit)
	for rows.Next() {
		var entry domain.MerchantAuditEntry
		var targetID sql.NullString
		var payload sql.NullString
		if err := rows.Scan(&entry.ID, &entry.ActorID, &entry.Action, &targetID, &payload, &entry.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan merchant audit event: %w", err)
		}
		if targetID.Valid {
			entry.TargetID = targetID.String
		}
	decodeMerchantAuditPayload(&entry, payload.String)
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate merchant audit events: %w", err)
	}
	return entries, total, nil
}

func decodeMerchantAuditPayload(entry *domain.MerchantAuditEntry, raw string) {
	var fields map[string]string
	if err := json.Unmarshal([]byte(raw), &fields); err != nil {
		return
	}
	entry.ActorRole = fields["actor_role"]
	entry.Resource = fields["resource"]
	entry.ObjectID = fields["object_id"]
	entry.OutletID = fields["outlet_id"]
	entry.Result = fields["result"]
	entry.FailureReason = fields["failure_reason"]
	entry.CorrelationID = fields["correlation_id"]
	entry.RequestID = fields["request_id"]
	if value := strings.TrimSpace(fields["status"]); value != "" {
		entry.Status, _ = strconv.Atoi(value)
	}
}
