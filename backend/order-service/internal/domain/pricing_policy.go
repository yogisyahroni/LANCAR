package domain

import "fmt"

// PricingComponentKind describes how a component participates in the
// customer, merchant, or courier calculation. Amounts are always expressed
// in the quote currency and are never supplied by the client.
type PricingComponentKind string

const (
	PricingComponentCustomerCharge     PricingComponentKind = "customer_charge"
	PricingComponentCustomerDiscount   PricingComponentKind = "customer_discount"
	PricingComponentCustomerAdjustment PricingComponentKind = "customer_adjustment"
	PricingComponentMerchantGross      PricingComponentKind = "merchant_gross"
	PricingComponentMerchantCommission PricingComponentKind = "merchant_commission"
	PricingComponentMerchantSubsidy    PricingComponentKind = "merchant_subsidy"
	PricingComponentCourierEarning     PricingComponentKind = "courier_earning"
)

// PricingComponent is the canonical, immutable line item stored in a quote
// snapshot. LabelKey is stable across locales; ComponentLabels on the
// snapshot supplies the market-specific presentation text.
type PricingComponent struct {
	Code            string               `json:"code"`
	AmountIDR       int64                `json:"amount_idr"`
	Kind            PricingComponentKind `json:"kind"`
	LabelKey        string               `json:"label_key"`
	CustomerVisible bool                 `json:"customer_visible"`
}

// PricingBreakdown is the cross-service financial contract for a quote. The
// first three totals are calculated from Components; PlatformAmountIDR is the
// residual after merchant and courier obligations, which makes all customer
// money accounted for without hidden fees. It may be negative when the
// platform funds a customer or merchant subsidy.
type PricingBreakdown struct {
	PolicyVersion   string             `json:"policy_version"`
	Currency        string             `json:"currency"`
	Market          string             `json:"market"`
	ServiceCode     string             `json:"service_code"`
	Components      []PricingComponent `json:"components"`
	ComponentLabels map[string]string  `json:"component_labels"`

	CustomerChargesIDR     int64 `json:"customer_charges_idr"`
	CustomerDiscountsIDR   int64 `json:"customer_discounts_idr"`
	CustomerAdjustmentsIDR int64 `json:"customer_adjustments_idr"`
	CustomerTotalIDR       int64 `json:"customer_total_idr"`
	MerchantGrossIDR       int64 `json:"merchant_gross_idr"`
	MerchantCommissionIDR  int64 `json:"merchant_commission_idr"`
	MerchantSubsidyIDR     int64 `json:"merchant_subsidy_idr"`
	MerchantPayableIDR     int64 `json:"merchant_payable_idr"`
	CourierEarningIDR      int64 `json:"courier_earning_idr"`
	PlatformAmountIDR      int64 `json:"platform_amount_idr"`
}

// DefaultPricingComponentLabels are presentation defaults only. Financial
// semantics use the stable LabelKey/Code values and do not change with a
// market translation.
func DefaultPricingComponentLabels() map[string]string {
	return map[string]string{
		"item_subtotal":          "Harga menu",
		"base_fare":              "Tarif dasar",
		"distance_fee":           "Biaya jarak",
		"weight_surcharge":       "Biaya ukuran/berat",
		"dynamic_adjustment":     "Penyesuaian permintaan",
		"insurance_fee":          "Asuransi",
		"delivery_fee":           "Biaya antar",
		"platform_fee":           "Biaya layanan",
		"tax":                    "Pajak",
		"toll_addon":             "Tol/add-on",
		"promo_discount":         "Diskon promo",
		"membership_subsidy":     "Subsidi membership",
		"merchant_commission":    "Komisi merchant",
		"merchant_promo_subsidy": "Subsidi promo merchant",
		"courier_earning":        "Pendapatan kurir",
		"rounding_adjustment":    "Pembulatan",
	}
}

// Recalculate derives the stakeholder totals from explicit components. It is
// intentionally pure so settlement/order code can re-check a persisted quote
// snapshot before using it.
func (p PricingBreakdown) Recalculate() (PricingBreakdown, error) {
	if p.PolicyVersion == "" || p.Currency == "" || p.ServiceCode == "" {
		return PricingBreakdown{}, fmt.Errorf("pricing policy metadata is incomplete")
	}
	seen := make(map[string]struct{}, len(p.Components))
	var result PricingBreakdown = p
	result.CustomerChargesIDR = 0
	result.CustomerDiscountsIDR = 0
	result.CustomerAdjustmentsIDR = 0
	result.MerchantGrossIDR = 0
	result.MerchantCommissionIDR = 0
	result.MerchantSubsidyIDR = 0
	result.CourierEarningIDR = 0

	for _, component := range p.Components {
		if component.Code == "" {
			return PricingBreakdown{}, fmt.Errorf("pricing component code is required")
		}
		if _, exists := seen[component.Code]; exists {
			return PricingBreakdown{}, fmt.Errorf("duplicate pricing component %q", component.Code)
		}
		seen[component.Code] = struct{}{}
		if component.Kind != PricingComponentCustomerAdjustment && component.AmountIDR < 0 {
			return PricingBreakdown{}, fmt.Errorf("pricing component %q cannot be negative", component.Code)
		}
		switch component.Kind {
		case PricingComponentCustomerCharge:
			result.CustomerChargesIDR += component.AmountIDR
		case PricingComponentCustomerDiscount:
			result.CustomerDiscountsIDR += component.AmountIDR
		case PricingComponentCustomerAdjustment:
			result.CustomerAdjustmentsIDR += component.AmountIDR
		case PricingComponentMerchantGross:
			result.MerchantGrossIDR += component.AmountIDR
		case PricingComponentMerchantCommission:
			result.MerchantCommissionIDR += component.AmountIDR
		case PricingComponentMerchantSubsidy:
			result.MerchantSubsidyIDR += component.AmountIDR
		case PricingComponentCourierEarning:
			result.CourierEarningIDR += component.AmountIDR
		default:
			return PricingBreakdown{}, fmt.Errorf("unknown pricing component kind %q", component.Kind)
		}
	}

	result.CustomerTotalIDR = result.CustomerChargesIDR - result.CustomerDiscountsIDR + result.CustomerAdjustmentsIDR
	result.MerchantPayableIDR = result.MerchantGrossIDR - result.MerchantCommissionIDR - result.MerchantSubsidyIDR
	result.PlatformAmountIDR = result.CustomerTotalIDR - result.MerchantPayableIDR - result.CourierEarningIDR
	if result.CustomerTotalIDR < 0 || result.MerchantPayableIDR < 0 {
		return PricingBreakdown{}, fmt.Errorf("pricing reconciliation produced a negative stakeholder amount")
	}
	return result, nil
}

// Validate checks that stored derived totals still match the immutable
// component list. A mismatch means the quote must be rejected/requoted.
func (p PricingBreakdown) Validate() error {
	calculated, err := p.Recalculate()
	if err != nil {
		return err
	}
	if p.CustomerChargesIDR != calculated.CustomerChargesIDR ||
		p.CustomerDiscountsIDR != calculated.CustomerDiscountsIDR ||
		p.CustomerAdjustmentsIDR != calculated.CustomerAdjustmentsIDR ||
		p.CustomerTotalIDR != calculated.CustomerTotalIDR ||
		p.MerchantGrossIDR != calculated.MerchantGrossIDR ||
		p.MerchantCommissionIDR != calculated.MerchantCommissionIDR ||
		p.MerchantSubsidyIDR != calculated.MerchantSubsidyIDR ||
		p.MerchantPayableIDR != calculated.MerchantPayableIDR ||
		p.CourierEarningIDR != calculated.CourierEarningIDR ||
		p.PlatformAmountIDR != calculated.PlatformAmountIDR {
		return fmt.Errorf("pricing component totals do not reconcile")
	}
	return nil
}
