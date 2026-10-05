package middleware

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// MutationAuditEvent is the metadata persisted for an authenticated merchant
// mutation. Request bodies are intentionally excluded so credentials and
// customer PII cannot enter the audit stream.
type MutationAuditEvent struct {
	ActorID       string
	ActorRole     string
	TenantID      string
	BusinessID    string
	OutletID      string
	Action        string
	Resource      string
	ObjectID      string
	Result        string
	FailureReason string
	Status        int
	CorrelationID string
	RequestID     string
	IP            string
}

// MutationAuditRecorder is kept behind an interface so middleware behavior can
// be tested without a database while production uses the canonical audit_logs
// table.
type MutationAuditRecorder interface {
	RecordMutation(ctx context.Context, event MutationAuditEvent) error
}

// SQLMutationAuditRecorder appends merchant mutation metadata to the shared,
// append-only audit stream. The merchant ID is resolved server-side from the
// authenticated actor; it is never accepted from a client query parameter.
type SQLMutationAuditRecorder struct {
	db *sql.DB
}

func NewSQLMutationAuditRecorder(db *sql.DB) MutationAuditRecorder {
	if db == nil {
		return nil
	}
	return &SQLMutationAuditRecorder{db: db}
}

func (r *SQLMutationAuditRecorder) RecordMutation(ctx context.Context, event MutationAuditEvent) error {
	if r == nil || r.db == nil {
		return errors.New("merchant audit recorder database is not configured")
	}
	actorID, err := uuid.Parse(strings.TrimSpace(event.ActorID))
	if err != nil {
		return fmt.Errorf("audit actor id is invalid: %w", err)
	}

	tenantID, effectiveRole, err := r.resolveScope(ctx, actorID, event.OutletID, event.TenantID)
	if err != nil {
		return err
	}
	actorRole := firstNonEmpty(effectiveRole, event.ActorRole)
	objectID := firstNonEmpty(event.ObjectID, tenantID)

	payload, err := json.Marshal(map[string]string{
		"actor_role":     actorRole,
		"tenant_id":      tenantID,
		"business_id":    firstNonEmpty(event.BusinessID, tenantID),
		"outlet_id":      strings.TrimSpace(event.OutletID),
		"resource":       strings.TrimSpace(event.Resource),
		"object_id":      objectID,
		"result":         strings.TrimSpace(event.Result),
		"failure_reason": strings.TrimSpace(event.FailureReason),
		"status":         fmt.Sprintf("%d", event.Status),
		"correlation_id": strings.TrimSpace(event.CorrelationID),
		"request_id":     strings.TrimSpace(event.RequestID),
		"ip":             strings.TrimSpace(event.IP),
	})
	if err != nil {
		return fmt.Errorf("marshal merchant audit payload: %w", err)
	}

	var targetID interface{}
	if parsed, parseErr := uuid.Parse(objectID); parseErr == nil {
		targetID = parsed
	} else if parsed, parseErr := uuid.Parse(tenantID); parseErr == nil {
		targetID = parsed
	}

	_, err = r.db.ExecContext(ctx, `
		INSERT INTO audit_logs (actor_id, action, target_id, payload, merchant_id, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())`,
		actorID,
		strings.TrimSpace(event.Action),
		targetID,
		string(payload),
		tenantID,
	)
	if err != nil {
		return fmt.Errorf("persist merchant audit event: %w", err)
	}
	return nil
}

func (r *SQLMutationAuditRecorder) resolveScope(ctx context.Context, actorID uuid.UUID, outletID, requestedTenantID string) (string, string, error) {
	requestedTenantID = strings.TrimSpace(requestedTenantID)
	outletID = strings.TrimSpace(outletID)
	if requestedTenantID != "" {
		if _, err := uuid.Parse(requestedTenantID); err != nil {
			return "", "", fmt.Errorf("audit tenant id is invalid: %w", err)
		}
		if outletID != "" {
			if _, err := uuid.Parse(outletID); err != nil {
				return "", "", fmt.Errorf("audit outlet id is invalid: %w", err)
			}
		}
		return requestedTenantID, "", nil
	}

	if outletID != "" {
		outletUUID, err := uuid.Parse(outletID)
		if err != nil {
			return "", "", fmt.Errorf("audit outlet id is invalid: %w", err)
		}
		var tenantID, role string
		err = r.db.QueryRowContext(ctx, `
			SELECT merchant_id, effective_role
			FROM (
				SELECT b.merchant_id, 'owner' AS effective_role, 0 AS priority
				FROM merchant_branches b
				JOIN merchants m ON m.id = b.merchant_id
				WHERE b.id = $1 AND m.user_id = $2
				UNION ALL
				SELECT b.merchant_id, s.role AS effective_role, 1 AS priority
				FROM merchant_branches b
				JOIN merchant_staff s ON s.merchant_id = b.merchant_id
				WHERE b.id = $1 AND s.user_id = $2 AND s.status = 'active'
			) scoped
			ORDER BY priority
			LIMIT 1`, outletUUID, actorID).Scan(&tenantID, &role)
		if err != nil {
			return "", "", fmt.Errorf("resolve merchant audit outlet scope: %w", err)
		}
		return tenantID, role, nil
	}

	var tenantID, role string
	var err error
	err = r.db.QueryRowContext(ctx, `
		SELECT merchant_id, effective_role
		FROM (
			SELECT m.id AS merchant_id, 'owner' AS effective_role, 0 AS priority, m.updated_at
			FROM merchants m
			WHERE m.user_id = $1
			UNION ALL
			SELECT s.merchant_id, s.role AS effective_role, 1 AS priority, s.updated_at
			FROM merchant_staff s
			WHERE s.user_id = $1 AND s.status = 'active'
		) scoped
		ORDER BY priority, updated_at DESC
		LIMIT 1`, actorID).Scan(&tenantID, &role)
	if err != nil {
		return "", "", fmt.Errorf("resolve merchant audit tenant: %w", err)
	}
	return tenantID, role, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
