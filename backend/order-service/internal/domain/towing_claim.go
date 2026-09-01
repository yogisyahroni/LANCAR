package domain

import (
	"context"
	"errors"
	"time"
)

var ErrInvalidTowingDamageClaim = errors.New("invalid towing damage claim")

const (
	TowingDamageClaimStatusSubmitted = "submitted"
	TowingDamageClaimStatusApproved  = "approved"
	TowingDamageClaimStatusRejected  = "rejected"
	TowingDamageClaimStatusPaid      = "paid"

	TowingLiabilityPending  = "pending"
	TowingLiabilityOperator = "operator"
	TowingLiabilityPlatform = "platform"
	TowingLiabilityCustomer = "customer"
	TowingLiabilityShared   = "shared"
	TowingLiabilityRejected = "rejected"

	TowingCompensationSettlement = "settlement"
	TowingCompensationInsurance  = "insurance"
	TowingCompensationReserve    = "platform_reserve"
)

type TowingDamageClaim struct {
	ID                    string     `json:"id" db:"id"`
	OrderID               string     `json:"order_id" db:"order_id"`
	TowingReportID        string     `json:"towing_report_id" db:"towing_report_id"`
	VehicleID             string     `json:"vehicle_id" db:"vehicle_id"`
	OperatorID            string     `json:"operator_id" db:"operator_id"`
	Status                string     `json:"status" db:"status"`
	Severity              string     `json:"severity" db:"severity"`
	ClaimAmountIDR        int64      `json:"claim_amount_idr" db:"claim_amount_idr"`
	ApprovedAmountIDR     int64      `json:"approved_amount_idr" db:"approved_amount_idr"`
	LiabilityDecision     string     `json:"liability_decision" db:"liability_decision"`
	LiabilityDecidedBy    *string    `json:"liability_decided_by,omitempty" db:"liability_decided_by"`
	LiabilityDecidedAt    *time.Time `json:"liability_decided_at,omitempty" db:"liability_decided_at"`
	LiabilityReason       *string    `json:"liability_reason,omitempty" db:"liability_reason"`
	CompensationChannel   *string    `json:"compensation_channel,omitempty" db:"compensation_channel"`
	CompensationReference *string    `json:"compensation_reference,omitempty" db:"compensation_reference"`
	CompensatedAt         *time.Time `json:"compensated_at,omitempty" db:"compensated_at"`
	CreatedAt             time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at" db:"updated_at"`
}

type SubmitTowingDamageClaimRequest struct {
	OrderID        string `json:"order_id"`
	Severity       string `json:"severity"`
	ClaimAmountIDR int64  `json:"claim_amount_idr"`
}

type DecideTowingDamageClaimRequest struct {
	ClaimID           string `json:"claim_id"`
	LiabilityDecision string `json:"liability_decision"`
	ApprovedAmountIDR int64  `json:"approved_amount_idr"`
	LiabilityReason   string `json:"liability_reason"`
}

type ReconcileTowingDamageCompensationRequest struct {
	ClaimID               string `json:"claim_id"`
	CompensationChannel   string `json:"compensation_channel"`
	CompensationReference string `json:"compensation_reference"`
}

type TowingDamageClaimRepository interface {
	CreateTowingDamageClaim(ctx context.Context, req *SubmitTowingDamageClaimRequest, operatorID string) (*TowingDamageClaim, error)
	GetTowingDamageClaim(ctx context.Context, claimID string) (*TowingDamageClaim, error)
	GetTowingDamageClaimByOrderID(ctx context.Context, orderID string) (*TowingDamageClaim, error)
	DecideTowingDamageClaim(ctx context.Context, req *DecideTowingDamageClaimRequest, reviewerID string) (*TowingDamageClaim, error)
	ReconcileTowingDamageCompensation(ctx context.Context, req *ReconcileTowingDamageCompensationRequest, reviewerID string) (*TowingDamageClaim, error)
}

type TowingDamageClaimService interface {
	SubmitClaim(ctx context.Context, req *SubmitTowingDamageClaimRequest, operatorID string) (*TowingDamageClaim, error)
	GetClaim(ctx context.Context, claimID string) (*TowingDamageClaim, error)
	GetClaimByOrderID(ctx context.Context, orderID string) (*TowingDamageClaim, error)
	DecideClaim(ctx context.Context, req *DecideTowingDamageClaimRequest, reviewerID string) (*TowingDamageClaim, error)
	ReconcileCompensation(ctx context.Context, req *ReconcileTowingDamageCompensationRequest, reviewerID string) (*TowingDamageClaim, error)
}
