package domain

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

type InsuranceStatus string

type InsuranceClaimStatus string

const (
	InsuranceStatusActive                    InsuranceStatus = "active"
	InsuranceStatusExpired                   InsuranceStatus = "expired"
	InsuranceStatusPending                   InsuranceStatus = "pending"
	InsuranceStatusCancelled                 InsuranceStatus = "cancelled"
	InsuranceStatusClaimed                   InsuranceStatus = "claimed"
	InsuranceStatusVoid                      InsuranceStatus = "void"
	InsuranceStatusPendingProviderActivation InsuranceStatus = "pending_provider_activation"
)

var (
	ErrOrderInsuranceNotFound = errors.New("order insurance not found")
	ErrInsuranceClaimNotFound = errors.New("insurance claim not found")
	ErrInsuranceClaimExists   = errors.New("insurance claim already exists")
	ErrInsuranceClaimInvalid  = errors.New("invalid insurance claim")
)

const (
	InsuranceClaimStatusSubmitted   InsuranceClaimStatus = "submitted"
	InsuranceClaimStatusUnderReview InsuranceClaimStatus = "under_review"
	InsuranceClaimStatusApproved    InsuranceClaimStatus = "approved"
	InsuranceClaimStatusRejected    InsuranceClaimStatus = "rejected"
	InsuranceClaimStatusPaid        InsuranceClaimStatus = "paid"
)

type CourierInsurance struct {
	ID                uuid.UUID       `json:"id" db:"id"`
	CourierID         uuid.UUID       `json:"courier_id" db:"courier_id"`
	Type              string          `json:"type" db:"type"` // 'bpjs_tk' | 'accident' | 'package'
	Provider          string          `json:"provider" db:"provider"`
	PolicyNumber      string          `json:"policy_number" db:"policy_number"`
	CoverageIDR       int             `json:"coverage_idr" db:"coverage_idr"`
	PremiumMonthlyIDR int             `json:"premium_monthly_idr" db:"premium_monthly_idr"`
	CompanyShareIDR   int             `json:"company_share_idr" db:"company_share_idr"`
	CourierShareIDR   int             `json:"courier_share_idr" db:"courier_share_idr"`
	Status            InsuranceStatus `json:"status" db:"status"`
	ValidFrom         time.Time       `json:"valid_from" db:"valid_from"`
	ValidUntil        *time.Time      `json:"valid_until" db:"valid_until"`
	CreatedAt         time.Time       `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at" db:"updated_at"`
}

type OrderInsurance struct {
	ID            uuid.UUID       `json:"id" db:"id"`
	OrderID       uuid.UUID       `json:"order_id" db:"order_id"`
	DeclaredValue int             `json:"declared_value" db:"declared_value"`
	PremiumFee    int             `json:"premium_fee" db:"premium_fee"`
	CoverageLimit int             `json:"coverage_limit" db:"coverage_limit"`
	Status        InsuranceStatus `json:"status" db:"status"`
	Provider      string          `json:"provider" db:"provider"`
	ClaimID       *string         `json:"claim_id" db:"claim_id"`
	CreatedAt     time.Time       `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at" db:"updated_at"`
}

// OrderInsuranceClaim is the provider-neutral internal handoff record. It is
// intentionally separate from a provider claim number: providerClaimID stays
// empty until a real insurer adapter acknowledges the claim.
type OrderInsuranceClaim struct {
	ID               uuid.UUID            `json:"id" db:"id"`
	OrderInsuranceID uuid.UUID            `json:"order_insurance_id" db:"order_insurance_id"`
	OrderID          uuid.UUID            `json:"order_id" db:"order_id"`
	ClaimantID       uuid.UUID            `json:"claimant_id" db:"claimant_id"`
	Reason           string               `json:"reason" db:"reason"`
	ClaimedAmount    int                  `json:"claimed_amount" db:"claimed_amount"`
	EvidenceURLs     json.RawMessage      `json:"evidence_urls" db:"evidence_urls"`
	Status           InsuranceClaimStatus `json:"status" db:"status"`
	ProviderClaimID  *string              `json:"provider_claim_id,omitempty" db:"provider_claim_id"`
	ReviewedAt       *time.Time           `json:"reviewed_at,omitempty" db:"reviewed_at"`
	ResolutionNote   *string              `json:"resolution_note,omitempty" db:"resolution_note"`
	CreatedAt        time.Time            `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time            `json:"updated_at" db:"updated_at"`
}

type InsuranceRepository interface {
	CreateCourierInsurance(ctx context.Context, ins *CourierInsurance) error
	GetCourierInsurance(ctx context.Context, courierID uuid.UUID, insuranceType string) (*CourierInsurance, error)
	UpdateCourierInsuranceStatus(ctx context.Context, id uuid.UUID, status InsuranceStatus) error
	GetExpiringCourierInsurances(ctx context.Context, daysBefore int) ([]CourierInsurance, error)

	CreateOrderInsurance(ctx context.Context, ins *OrderInsurance) error
	GetOrderInsurance(ctx context.Context, orderID uuid.UUID) (*OrderInsurance, error)
	GetOrderInsuranceForCustomer(ctx context.Context, orderID, customerID uuid.UUID) (*OrderInsurance, error)
	CreateOrderInsuranceClaim(ctx context.Context, claim *OrderInsuranceClaim) error
	GetOrderInsuranceClaim(ctx context.Context, orderID, claimantID uuid.UUID) (*OrderInsuranceClaim, error)
}

type InsuranceService interface {
	EnrollBPJSTK(ctx context.Context, courierID uuid.UUID) (*CourierInsurance, error)
	CalculateOrderPremium(ctx context.Context, declaredValue int) (premium int, coverageLimit int)
	CreateOrderInsurance(ctx context.Context, orderID uuid.UUID, declaredValue int) (*OrderInsurance, error)
	SubmitOrderInsuranceClaim(ctx context.Context, orderID, claimantID uuid.UUID, reason string, claimedAmount int, evidenceURLs json.RawMessage) (*OrderInsuranceClaim, error)
	GetOrderInsuranceClaim(ctx context.Context, orderID, claimantID uuid.UUID) (*OrderInsuranceClaim, error)
	ProcessInsuranceReminders(ctx context.Context) error
}
