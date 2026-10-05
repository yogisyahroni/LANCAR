package domain

import (
	"context"
	"time"
)

// MerchantAuditEntry is a redacted, tenant-scoped view of a mutation audit
// event. The raw payload is intentionally never exposed to the Merchant Web.
type MerchantAuditEntry struct {
	ID            string    `json:"id"`
	ActorID       string    `json:"actor_id"`
	ActorRole     string    `json:"actor_role,omitempty"`
	Action        string    `json:"action"`
	Resource      string    `json:"resource,omitempty"`
	ObjectID      string    `json:"object_id,omitempty"`
	TargetID      string    `json:"target_id,omitempty"`
	OutletID      string    `json:"outlet_id,omitempty"`
	Result        string    `json:"result"`
	FailureReason string    `json:"failure_reason,omitempty"`
	Status        int       `json:"status"`
	CorrelationID string    `json:"correlation_id,omitempty"`
	RequestID     string    `json:"request_id,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

type MerchantAuditRepository interface {
	List(ctx context.Context, merchantID, outletID string, limit, offset int) ([]MerchantAuditEntry, int, error)
}
