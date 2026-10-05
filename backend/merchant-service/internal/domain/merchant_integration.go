package domain

import "context"

type MerchantPOSConnectorStatus struct {
	ProviderCode           string   `json:"provider_code"`
	ProviderName           string   `json:"provider_name"`
	BranchID               string   `json:"branch_id,omitempty"`
	Enabled                bool     `json:"enabled"`
	State                  string   `json:"state"`
	Capabilities           []string `json:"capabilities"`
	LastCheckedAt          string   `json:"last_checked_at,omitempty"`
	LastLatencyMS          int64    `json:"last_latency_ms,omitempty"`
	ConsecutiveFailures    int      `json:"consecutive_failures"`
	AvailabilityReason     string   `json:"availability_reason,omitempty"`
	OpenReconciliation     int      `json:"open_reconciliation"`
	FailedOrderDeliveries  int      `json:"failed_order_deliveries"`
	PendingOrderDeliveries int      `json:"pending_order_deliveries"`
}

type MerchantPOSIntegrationStatus struct {
	MerchantID             string                       `json:"merchant_id"`
	CanonicalOwner         string                       `json:"canonical_owner"`
	CatalogOwnership       string                       `json:"catalog_ownership"`
	InventoryOwnership     string                       `json:"inventory_ownership"`
	CustomerAcceptanceRule string                       `json:"customer_acceptance_rule"`
	Connectors             []MerchantPOSConnectorStatus `json:"connectors"`
}

type MerchantPOSReconciliationItem struct {
	ID               string `json:"id"`
	ProviderCode     string `json:"provider_code"`
	BranchID         string `json:"branch_id,omitempty"`
	ResourceType     string `json:"resource_type"`
	ResourceID       string `json:"resource_id"`
	LocalStatus      string `json:"local_status"`
	MerchantReceived bool   `json:"merchant_received"`
	Attempts         int    `json:"attempts"`
	Reason           string `json:"reason,omitempty"`
	FirstSeenAt      string `json:"first_seen_at"`
	LastSeenAt       string `json:"last_seen_at"`
}

// MerchantIntegrationRepository exposes a read-only projection owned by the
// Integration Gateway. Merchant state and customer order state stay in their
// existing services.
type MerchantIntegrationRepository interface {
	GetPOSStatusByOwnerUser(ctx context.Context, ownerUserID string) (*MerchantPOSIntegrationStatus, error)
	ListPOSReconciliationByOwnerUser(ctx context.Context, ownerUserID string, limit int) ([]MerchantPOSReconciliationItem, error)
}
