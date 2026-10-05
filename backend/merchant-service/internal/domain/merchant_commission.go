package domain

import "context"

// MerchantCommissionTerms is the server-authoritative food commission policy
// currently applicable to a merchant.  The portal displays this read model;
// it never recalculates a fee or changes an order's historical snapshot.
type MerchantCommissionTerms struct {
	MerchantID            string  `json:"merchant_id"`
	BusinessType          string  `json:"business_type"`
	MarketCode            string  `json:"market_code"`
	ServiceCode           string  `json:"service_code"`
	CommissionBasis       string  `json:"commission_basis"`
	CurrentCommissionPct  float64 `json:"current_commission_percent"`
	StandardCommissionPct float64 `json:"standard_commission_percent"`
	FixedFeeIDR           int64   `json:"fixed_fee_idr"`
	ProgramCode           string  `json:"program_code"`
	ProgramLabel          string  `json:"program_label"`
	Source                string  `json:"source"`
	ContractID            *string `json:"contract_id,omitempty"`
	ContractVersion       string  `json:"contract_version"`
	EffectiveFrom         *string `json:"effective_from,omitempty"`
	EffectiveTo           *string `json:"effective_to,omitempty"`
	CompletedFoodOrders   int64   `json:"completed_food_orders"`
	CompletedOrderCap     *int64  `json:"completed_order_cap,omitempty"`
	RemainingOrderCap     *int64  `json:"remaining_order_cap,omitempty"`
	FallbackCommissionPct float64 `json:"fallback_commission_percent"`
}

// MerchantCommercialTermsRepository is an optional report-repository
// extension. Keeping it separate means existing report doubles do not need to
// implement commercial-policy reads they do not use.
type MerchantCommercialTermsRepository interface {
	CurrentMerchantCommissionTerms(ctx context.Context, merchantID, marketCode string) (*MerchantCommissionTerms, error)
}
