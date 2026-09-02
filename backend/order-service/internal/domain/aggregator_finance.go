package domain

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type ProviderInvoiceStatus string

const (
	ProviderInvoiceStatusPending    ProviderInvoiceStatus = "PENDING_RECONCILIATION"
	ProviderInvoiceStatusReconciled ProviderInvoiceStatus = "RECONCILED"
	ProviderInvoiceStatusApproved   ProviderInvoiceStatus = "APPROVED"
	ProviderInvoiceStatusDisputed   ProviderInvoiceStatus = "DISPUTED"
	ProviderInvoiceStatusPaid       ProviderInvoiceStatus = "PAID"
)

type DiscrepancyType string

const (
	DiscrepancyTypeMatched          DiscrepancyType = "MATCHED"
	DiscrepancyTypeOvercharge       DiscrepancyType = "OVERCHARGE"
	DiscrepancyTypeUndercharge      DiscrepancyType = "UNDERCHARGE"
	DiscrepancyTypeMissingAWB       DiscrepancyType = "MISSING_AWB"
	DiscrepancyTypeDuplicateBilling DiscrepancyType = "DUPLICATE_BILLING"
)

type ProviderInvoice struct {
	ID                  uuid.UUID             `json:"id"`
	InvoiceNumber       string                `json:"invoice_number"`
	ProviderName        string                `json:"provider_name"`
	BillingPeriodStart  time.Time             `json:"billing_period_start"`
	BillingPeriodEnd    time.Time             `json:"billing_period_end"`
	TotalClaimedIDR     int64                 `json:"total_claimed_idr"`
	TotalMatchedIDR     int64                 `json:"total_matched_idr"`
	TotalDiscrepancyIDR int64                 `json:"total_discrepancy_idr"`
	Status              ProviderInvoiceStatus `json:"status"`
	Notes               string                `json:"notes"`
	CreatedBy           *uuid.UUID            `json:"created_by,omitempty"`
	ApprovedBy          *uuid.UUID            `json:"approved_by,omitempty"`
	ApprovedAt          *time.Time            `json:"approved_at,omitempty"`
	CreatedAt           time.Time             `json:"created_at"`
	UpdatedAt           time.Time             `json:"updated_at"`
	Items               []ProviderInvoiceItem `json:"items,omitempty"`
}

type ProviderInvoiceItem struct {
	ID               uuid.UUID       `json:"id"`
	InvoiceID        uuid.UUID       `json:"invoice_id"`
	AWBNumber        string          `json:"awb_number"`
	OrderID          *uuid.UUID      `json:"order_id,omitempty"`
	ClaimedAmountIDR int64           `json:"claimed_amount_idr"`
	ExpectedNetIDR   int64           `json:"expected_net_cost_idr"`
	DiscrepancyIDR   int64           `json:"discrepancy_idr"`
	DiscrepancyType  DiscrepancyType `json:"discrepancy_type"`
	ResolutionStatus string          `json:"resolution_status"`
	ResolutionNotes  string          `json:"resolution_notes"`
	CreatedAt        time.Time       `json:"created_at"`
}

type LogisticsExceptionPolicy struct {
	ID             uuid.UUID      `json:"id"`
	PolicyCode     string         `json:"policy_code"`
	PolicyName     string         `json:"policy_name"`
	ExceptionType  string         `json:"exception_type"` // RETURN, FAILED_DELIVERY, LOST_CLAIM, DAMAGED_CLAIM
	ProviderName   string         `json:"provider_name"`
	FeeBorneBy     string         `json:"fee_borne_by"` // MERCHANT, CUSTOMER, PLATFORM, PROVIDER
	FeeAmountIDR   int64          `json:"fee_amount_idr"`
	FeePctOrder    float64        `json:"fee_pct_order"`
	IsActive       bool           `json:"is_active"`
	ConfigMetadata map[string]any `json:"config_metadata"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

type LogisticsExceptionClaim struct {
	ID                      uuid.UUID       `json:"id"`
	OrderID                 uuid.UUID       `json:"order_id"`
	AWBNumber               string          `json:"awb_number"`
	ExceptionType           string          `json:"exception_type"`
	ProviderName            string          `json:"provider_name"`
	ClaimAmountIDR          int64           `json:"claim_amount_idr"`
	ItemValueIDR            int64           `json:"item_value_idr"`
	InsuranceCoverageIDR    int64           `json:"insurance_coverage_idr"`
	ProviderPayoutIDR       int64           `json:"provider_payout_idr"`
	CustomerCompensationIDR int64           `json:"customer_compensation_idr"`
	MerchantCompensationIDR int64           `json:"merchant_compensation_idr"`
	LedgerJournalID         *uuid.UUID      `json:"ledger_journal_id,omitempty"`
	Status                  string          `json:"status"` // SUBMITTED, APPROVED, REJECTED, PAID, COMPENSATED
	ProviderClaimReference  string          `json:"provider_claim_reference,omitempty"`
	FeeBorneBy              string          `json:"fee_borne_by,omitempty"`
	EvidenceURLs            json.RawMessage `json:"evidence_urls,omitempty"`
	Notes                   string          `json:"notes"`
	ResolvedAt              *time.Time      `json:"resolved_at,omitempty"`
	CreatedAt               time.Time       `json:"created_at"`
	UpdatedAt               time.Time       `json:"updated_at"`
}

type AggregatorFinanceRepository interface {
	CreateInvoice(ctx context.Context, inv *ProviderInvoice, items []ProviderInvoiceItem) error
	GetInvoiceByID(ctx context.Context, id uuid.UUID) (*ProviderInvoice, error)
	ListInvoices(ctx context.Context, providerName string, status string, limit, offset int) ([]*ProviderInvoice, error)
	UpdateInvoiceStatus(ctx context.Context, id uuid.UUID, status ProviderInvoiceStatus, totalMatched, totalDiscrepancy int64, approvedBy *uuid.UUID) error
	UpdateInvoiceItems(ctx context.Context, items []ProviderInvoiceItem) error

	GetPolicyByTypeAndProvider(ctx context.Context, exceptionType, providerName string) (*LogisticsExceptionPolicy, error)
	ListPolicies(ctx context.Context) ([]*LogisticsExceptionPolicy, error)
	CreateOrUpdatePolicy(ctx context.Context, pol *LogisticsExceptionPolicy) error

	CreateClaim(ctx context.Context, claim *LogisticsExceptionClaim) error
	GetClaimByID(ctx context.Context, id uuid.UUID) (*LogisticsExceptionClaim, error)
	ListClaims(ctx context.Context, status string, limit, offset int) ([]*LogisticsExceptionClaim, error)
	UpdateClaimStatus(ctx context.Context, id uuid.UUID, status string, journalID *uuid.UUID) error

	GetOrderAndNetCostByAWB(ctx context.Context, awbNumber string) (*uuid.UUID, int64, error)
}

type AggregatorFinanceService interface {
	CreateInvoice(ctx context.Context, inv *ProviderInvoice, items []ProviderInvoiceItem) error
	ReconcileInvoice(ctx context.Context, invoiceID uuid.UUID) (*ProviderInvoice, error)
	ApproveInvoice(ctx context.Context, invoiceID uuid.UUID, approverID uuid.UUID) error
	SubmitClaim(ctx context.Context, claim *LogisticsExceptionClaim) (*LogisticsExceptionClaim, error)
	ResolveClaim(ctx context.Context, claimID uuid.UUID, status string) error
}
