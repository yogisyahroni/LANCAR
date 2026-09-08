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

// MerchantIntegrationRepository exposes a read-only projection owned by the
// Integration Gateway. Merchant state and customer order state stay in their
// existing services.
type MerchantIntegrationRepository interface {
	GetPOSStatusByOwnerUser(ctx context.Context, ownerUserID string) (*MerchantPOSIntegrationStatus, error)
}
