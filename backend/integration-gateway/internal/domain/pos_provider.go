package domain

import (
	"context"
	"errors"
)

var (
	ErrPOSIdempotencyConflict = errors.New("POS idempotency key was already used for a different payload")
	ErrPOSDeliveryInProgress  = errors.New("POS delivery is already in progress")
)

// POSCapability identifies an independently selectable POS operation. A
// connector must only advertise capabilities it can execute.
type POSCapability string

const (
	POSCapabilityOrderReceipt  POSCapability = "order_receipt"
	POSCapabilityCatalogSync   POSCapability = "catalog_sync"
	POSCapabilityInventorySync POSCapability = "inventory_sync"
	POSCapabilityHealth        POSCapability = "health"
)

// POSOrderRequest is the canonical, provider-neutral order envelope. The
// payload is preserved as JSON so the gateway does not become a second order
// model or pricing source of truth.
type POSOrderRequest struct {
	MerchantID     string
	BranchID       string
	OrderID        string
	IdempotencyKey string
	Payload        []byte
}

type POSOrderReceipt struct {
	Accepted          bool   `json:"accepted"`
	ProviderReceiptID string `json:"provider_receipt_id,omitempty"`
	ProviderStatus    string `json:"provider_status,omitempty"`
}

type POSOrderReceiver interface {
	ReceiveOrder(ctx context.Context, req POSOrderRequest) (*POSOrderReceipt, error)
}

type POSCatalogSyncRequest struct {
	MerchantID       string
	BranchID         string
	ResourceID       string
	CanonicalVersion int64
	IdempotencyKey   string
	Payload          []byte
}

type POSInventorySyncRequest struct {
	MerchantID       string
	BranchID         string
	ResourceID       string
	CanonicalVersion int64
	IdempotencyKey   string
	Payload          []byte
}

type POSSynchronizationReceipt struct {
	Accepted          bool   `json:"accepted"`
	ProviderReceiptID string `json:"provider_receipt_id,omitempty"`
	ProviderStatus    string `json:"provider_status,omitempty"`
}

type POSCatalogSyncer interface {
	SyncCatalog(ctx context.Context, req POSCatalogSyncRequest) (*POSSynchronizationReceipt, error)
}

type POSInventorySyncer interface {
	SyncInventory(ctx context.Context, req POSInventorySyncRequest) (*POSSynchronizationReceipt, error)
}

type POSHealthChecker interface {
	CheckHealth(ctx context.Context) POSHealth
}

type POSHealth struct {
	ProviderCode        string          `json:"provider_code"`
	ProviderName        string          `json:"provider_name"`
	State               string          `json:"state"`
	Capabilities        []POSCapability `json:"capabilities"`
	LastCheckedAt       string          `json:"last_checked_at,omitempty"`
	LastLatencyMS       int64           `json:"last_latency_ms,omitempty"`
	ConsecutiveFailures int             `json:"consecutive_failures"`
	LastError           string          `json:"last_error,omitempty"`
	AvailabilityReason  string          `json:"availability_reason,omitempty"`
}

type POSProviderDescriptor struct {
	Code         string          `json:"code"`
	Name         string          `json:"name"`
	Capabilities []POSCapability `json:"capabilities"`
	Available    bool            `json:"available"`
	Reason       string          `json:"reason,omitempty"`
}

type POSProviderRegistration struct {
	Descriptor POSProviderDescriptor
	Order      POSOrderReceiver
	Catalog    POSCatalogSyncer
	Inventory  POSInventorySyncer
	Health     POSHealthChecker
}

type POSProviderRegistry interface {
	Get(code string) (POSProviderRegistration, bool)
	List() []POSProviderDescriptor
	Validate() error
	Health(ctx context.Context) []POSHealth
}

// POSOrderDelivery is the gateway's durable delivery projection. It is not a
// customer order state and must never be used to imply merchant acceptance.
type POSOrderDelivery struct {
	ID                  string `json:"id"`
	MerchantID          string `json:"merchant_id"`
	BranchID            string `json:"branch_id,omitempty"`
	OrderID             string `json:"order_id"`
	ProviderCode        string `json:"provider_code"`
	IdempotencyKey      string `json:"idempotency_key"`
	Status              string `json:"status"`
	MerchantReceived    bool   `json:"merchant_received"`
	CustomerOrderStatus string `json:"customer_order_status"`
	ProviderReceiptID   string `json:"provider_receipt_id,omitempty"`
	Attempts            int    `json:"attempts"`
	LastError           string `json:"last_error,omitempty"`
	CreatedAt           string `json:"created_at,omitempty"`
	UpdatedAt           string `json:"updated_at,omitempty"`
}

type POSSyncOperation struct {
	ID                string `json:"id"`
	MerchantID        string `json:"merchant_id"`
	BranchID          string `json:"branch_id,omitempty"`
	ProviderCode      string `json:"provider_code"`
	ResourceType      string `json:"resource_type"`
	ResourceID        string `json:"resource_id"`
	CanonicalVersion  int64  `json:"canonical_version"`
	Status            string `json:"status"`
	ProviderReceiptID string `json:"provider_receipt_id,omitempty"`
	Attempts          int    `json:"attempts"`
	LastError         string `json:"last_error,omitempty"`
}

type POSReconciliationItem struct {
	ID               string `json:"id"`
	MerchantID       string `json:"merchant_id"`
	BranchID         string `json:"branch_id,omitempty"`
	ProviderCode     string `json:"provider_code"`
	ResourceType     string `json:"resource_type"`
	ResourceID       string `json:"resource_id"`
	Status           string `json:"status"`
	LocalStatus      string `json:"local_status"`
	MerchantReceived bool   `json:"merchant_received"`
	Attempts         int    `json:"attempts"`
	Reason           string `json:"reason,omitempty"`
	UpdatedAt        string `json:"updated_at,omitempty"`
}

type POSRepository interface {
	BeginOrderDelivery(ctx context.Context, req POSOrderRequest, providerCode, requestHash string) (*POSOrderDelivery, bool, bool, error)
	FinishOrderDelivery(ctx context.Context, deliveryID, status, providerReceiptID, lastError string) error
	BeginSyncOperation(ctx context.Context, resourceType string, req POSCatalogSyncRequest, providerCode, requestHash string) (*POSSyncOperation, bool, bool, error)
	FinishSyncOperation(ctx context.Context, operationID, status, providerReceiptID, lastError string) error
	RecordHealth(ctx context.Context, health POSHealth) error
	ListHealth(ctx context.Context, merchantID string) ([]POSHealth, error)
	ListReconciliation(ctx context.Context, merchantID string, limit int) ([]POSReconciliationItem, error)
}
