package domain

import (
	"context"
	"time"
)

// TaxRule represents a tax configuration from the tax_rules table.
type TaxRule struct {
	ID                 string     `json:"id" db:"id"`
	Code               string     `json:"code" db:"code"`
	Name               string     `json:"name" db:"name"`
	TaxType            string     `json:"tax_type" db:"tax_type"`
	EffectiveRatePct   float64    `json:"effective_rate_pct" db:"effective_rate_pct"`
	StatutoryRatePct   float64    `json:"statutory_rate_pct" db:"statutory_rate_pct"`
	DPPFormula         string     `json:"dpp_formula" db:"dpp_formula"`
	InvoiceRequired    bool       `json:"invoice_required" db:"invoice_required"`
	EffectiveFrom      time.Time  `json:"effective_from" db:"effective_from"`
	EffectiveTo        *time.Time `json:"effective_to" db:"effective_to"`
}

// TaxSnapshot represents the calculated tax for a specific transaction.
type TaxSnapshot struct {
	TaxRuleCode          string  `json:"tax_rule_code"`
	PPNRateEffectivePct  float64 `json:"ppn_rate_effective_pct"`
	PPNRateStatutoryPct  float64 `json:"ppn_rate_statutory_pct"`
	DPPIDR               int64   `json:"dpp_idr"`
	PPNIDR               int64   `json:"ppn_idr"`
	TaxInvoiceRequired   bool    `json:"tax_invoice_required"`
	TaxInvoiceStatus     string  `json:"tax_invoice_status"`
}

// TaxEFakturExport represents a generated eFaktur export record.
type TaxEFakturExport struct {
	ID            string    `json:"id" db:"id"`
	TaxPeriod     string    `json:"tax_period" db:"tax_period"` // YYYY-MM
	ExportStatus  string    `json:"export_status" db:"export_status"`
	TotalDPPIDR   int64     `json:"total_dpp_idr" db:"total_dpp_idr"`
	TotalPPNIDR   int64     `json:"total_ppn_idr" db:"total_ppn_idr"`
	ExportedBy    *string   `json:"exported_by" db:"exported_by"`
	FilePath      *string   `json:"file_path" db:"file_path"`
	Checksum      *string   `json:"checksum" db:"checksum"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time `json:"updated_at" db:"updated_at"`
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
