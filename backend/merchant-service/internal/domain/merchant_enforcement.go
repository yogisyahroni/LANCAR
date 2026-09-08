package domain

import (
	"context"
	"time"
)

// MerchantEnforcementAction is the server-authoritative policy overlay used
// to stop new discovery/checkout work without rewriting active orders.
type MerchantEnforcementAction struct {
	ID                 string     `json:"id"`
	MerchantID         string     `json:"merchant_id"`
	Scope              string     `json:"scope"`
	TargetBranchID     *string    `json:"target_branch_id,omitempty"`
	TargetBranchName   string     `json:"target_branch_name,omitempty"`
	TargetMenuItemID   *string    `json:"target_menu_item_id,omitempty"`
	TargetMenuItemName string     `json:"target_menu_item_name,omitempty"`
	Capability         string     `json:"capability,omitempty"`
	ReasonCategory     string     `json:"reason_category"`
	ReasonDetail       string     `json:"reason_detail"`
	MerchantMessage    string     `json:"merchant_message,omitempty"`
	RemediationMessage string     `json:"remediation_message,omitempty"`
	DisclosureLevel    string     `json:"disclosure_level"`
	EffectiveFrom      time.Time  `json:"effective_from"`
	EffectiveUntil     *time.Time `json:"effective_until,omitempty"`
	SafeOrderPolicy    string     `json:"safe_order_policy"`
	Status             string     `json:"status"`
	ActiveOrderCount   int        `json:"active_order_count"`
	AppealEligible     bool       `json:"appeal_eligible"`
	CreatedBy          string     `json:"created_by"`
	RevokedBy          *string    `json:"revoked_by,omitempty"`
	RevokedAt          *time.Time `json:"revoked_at,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type MerchantEnforcementAppeal struct {
	ID                  string     `json:"id"`
	EnforcementActionID string     `json:"enforcement_action_id"`
	MerchantID          string     `json:"merchant_id"`
	Reason              string     `json:"reason"`
	Status              string     `json:"status"`
	ReviewNote          string     `json:"review_note,omitempty"`
	SubmittedAt         time.Time  `json:"submitted_at"`
	ReviewedAt          *time.Time `json:"reviewed_at,omitempty"`
	ReviewedBy          *string    `json:"reviewed_by,omitempty"`
}

type MerchantEnforcementAppealRequest struct {
	EnforcementActionID string `json:"enforcement_action_id"`
	Reason              string `json:"reason"`
}

type MerchantEnforcementStatus struct {
	MerchantID  string                      `json:"merchant_id"`
	Actions     []MerchantEnforcementAction `json:"active_actions"`
	Appeals     []MerchantEnforcementAppeal `json:"appeals"`
	Policy      map[string]string           `json:"policy"`
	ServerTruth bool                        `json:"server_authoritative"`
}

// MerchantEnforcementRepository is the optional PostgreSQL policy overlay.
// Keeping it separate preserves existing service test doubles and keeps
// policy ownership inside the merchant bounded context.
type MerchantEnforcementRepository interface {
	Refresh(ctx context.Context) error
	GetForMerchant(ctx context.Context, merchantID string) (*MerchantEnforcementStatus, error)
	SubmitAppeal(ctx context.Context, merchantID, actionID, reason string) (*MerchantEnforcementAppeal, error)
}
