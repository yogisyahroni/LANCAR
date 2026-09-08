package domain

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// TaxRule represents a tax configuration from the tax_rules table.
type TaxRule struct {
	ID               string     `json:"id" db:"id"`
	Code             string     `json:"code" db:"code"`
	Name             string     `json:"name" db:"name"`
	TaxType          string     `json:"tax_type" db:"tax_type"`
	EffectiveRatePct float64    `json:"effective_rate_pct" db:"effective_rate_pct"`
	StatutoryRatePct float64    `json:"statutory_rate_pct" db:"statutory_rate_pct"`
	DPPFormula       string     `json:"dpp_formula" db:"dpp_formula"`
	InvoiceRequired  bool       `json:"invoice_required" db:"invoice_required"`
	EffectiveFrom    time.Time  `json:"effective_from" db:"effective_from"`
	EffectiveTo      *time.Time `json:"effective_to" db:"effective_to"`
}

// TaxSnapshot represents the calculated tax for a specific transaction.
type TaxSnapshot struct {
	TaxRuleCode         string    `json:"tax_rule_code"`
	TaxRuleVersion      string    `json:"tax_rule_version"`
	TaxJurisdiction     string    `json:"tax_jurisdiction"`
	Currency            string    `json:"currency"`
	CurrencyMinorUnit   int       `json:"currency_minor_unit"`
	TaxEffectiveFrom    time.Time `json:"tax_effective_from"`
	PPNRateEffectivePct float64   `json:"ppn_rate_effective_pct"`
	PPNRateStatutoryPct float64   `json:"ppn_rate_statutory_pct"`
	DPPIDR              int64     `json:"dpp_idr"`
	PPNIDR              int64     `json:"ppn_idr"`
	DPPMinor            int64     `json:"dpp_minor"`
	PPNMinor            int64     `json:"ppn_minor"`
	TaxInvoiceRequired  bool      `json:"tax_invoice_required"`
	TaxInvoiceStatus    string    `json:"tax_invoice_status"`
}

// TaxEFakturExport represents a generated eFaktur export record.
type TaxEFakturExport struct {
	ID           string    `json:"id" db:"id"`
	TaxPeriod    string    `json:"tax_period" db:"tax_period"` // YYYY-MM
	ExportStatus string    `json:"export_status" db:"export_status"`
	TotalDPPIDR  int64     `json:"total_dpp_idr" db:"total_dpp_idr"`
	TotalPPNIDR  int64     `json:"total_ppn_idr" db:"total_ppn_idr"`
	ExportedBy   *string   `json:"exported_by" db:"exported_by"`
	FilePath     *string   `json:"file_path" db:"file_path"`
	Checksum     *string   `json:"checksum" db:"checksum"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

// EFakturDetailRecord represents a single transaction line for eFaktur export.
type EFakturDetailRecord struct {
	TransactionDate time.Time `db:"transaction_date"`
	ReferenceNumber string    `db:"reference_number"`
	CustomerName    string    `db:"customer_name"`
	CustomerAddress string    `db:"customer_address"`
	CustomerNPWP    string    `db:"customer_npwp"`
	DPP             int64     `db:"dpp"`
	PPN             int64     `db:"ppn"`
}

// TaxRepository handles data access for tax rules.
type TaxRepository interface {
	GetActiveRuleByCode(ctx context.Context, code string) (*TaxRule, error)
	GetDefaultPPNRule(ctx context.Context) (*TaxRule, error)
	SaveEFakturExport(ctx context.Context, export *TaxEFakturExport) error
	GetEFakturExportByPeriod(ctx context.Context, period string) (*TaxEFakturExport, error)
	UpdateEFakturExportStatus(ctx context.Context, id string, status string) error
	AggregateTaxByPeriod(ctx context.Context, period string) (totalDPP int64, totalPPN int64, err error)
	GetEFakturDetailsByPeriod(ctx context.Context, period string, fallbackNPWP string, fallbackProviderAddress string) ([]EFakturDetailRecord, error)
	HasNPWP(ctx context.Context, userID string) (bool, error)
}

// TaxService handles the business logic for calculating taxes.
type TaxService interface {
	CalculateOrderTax(ctx context.Context, totalGMVIDR int64, platformFeeIDR int64, isAggregator bool) (TaxSnapshot, error)
	CalculatePaymentMDRTax(ctx context.Context, mdrAmountIDR int64) (TaxSnapshot, error)
	GenerateEFakturExport(ctx context.Context, period string, requestedBy string) (*TaxEFakturExport, error)
	UpdateEFakturStatus(ctx context.Context, exportID string, status string) error
}

// MoneyTaxService is an optional extension implemented by tax engines that
// support non-IDR markets. Keeping it separate preserves compatibility with
// existing test doubles and legacy integrations.
type MoneyTaxService interface {
	CalculateOrderTaxMoney(ctx context.Context, total, platformFee Money, isAggregator bool, jurisdiction string) (TaxSnapshot, error)
	CalculatePaymentMDRTaxMoney(ctx context.Context, mdr Money, jurisdiction string) (TaxSnapshot, error)
}

// CalculateTaxSnapshot applies a versioned, jurisdiction-scoped tax rule to
// an integer money amount. The rate is converted to a decimal string before
// arithmetic, so the result is not dependent on binary float rounding.
func CalculateTaxSnapshot(rule TaxRule, taxable Money, jurisdiction string) (TaxSnapshot, error) {
	if err := taxable.Validate(); err != nil {
		return TaxSnapshot{}, err
	}
	if rule.Code == "" || rule.EffectiveFrom.IsZero() {
		return TaxSnapshot{}, fmt.Errorf("tax rule code and effective date are required")
	}
	if strings.TrimSpace(jurisdiction) == "" {
		return TaxSnapshot{}, fmt.Errorf("tax jurisdiction is required")
	}
	tax, err := taxable.MultiplyPercent(rule.EffectiveRatePct)
	if err != nil {
		return TaxSnapshot{}, err
	}
	return TaxSnapshot{
		TaxRuleCode:         rule.Code,
		TaxRuleVersion:      fmt.Sprintf("%s@%s", rule.Code, rule.EffectiveFrom.UTC().Format("20060102T150405Z")),
		TaxJurisdiction:     jurisdiction,
		Currency:            taxable.Currency,
		CurrencyMinorUnit:   taxable.MinorUnit,
		TaxEffectiveFrom:    rule.EffectiveFrom.UTC(),
		PPNRateEffectivePct: rule.EffectiveRatePct,
		PPNRateStatutoryPct: rule.StatutoryRatePct,
		DPPIDR:              legacyIDRAmount(taxable),
		PPNIDR:              legacyIDRAmount(tax),
		DPPMinor:            taxable.AmountMinor,
		PPNMinor:            tax.AmountMinor,
		TaxInvoiceRequired:  rule.InvoiceRequired,
		TaxInvoiceStatus:    "unissued",
	}, nil
}

func legacyIDRAmount(m Money) int64 {
	if m.Currency == "IDR" {
		return m.AmountMinor
	}
	return 0
}
