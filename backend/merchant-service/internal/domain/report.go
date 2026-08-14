package domain

import "context"

// ─────────────────────────────────────────────
// FB-086 — Merchant Report Penjualan
// Rekap order, GMV, item terlaris + export CSV.
// Periode: daily (hari ini) | weekly (7 hari terakhir).
// GMV hanya menghitung order berstatus delivered (penjualan riil,
// order batal/gagal tidak masuk pendapatan merchant).
// ─────────────────────────────────────────────

// SalesReportRow — baris transaksi per order (dipakai export CSV).
type SalesReportRow struct {
	OrderNumber   string `json:"order_number"`
	CreatedAt     string `json:"created_at"`
	Status        string `json:"status"`
	ItemName      string `json:"item_name"`
	Quantity      int    `json:"quantity"`
	ItemPrice     int64  `json:"item_price"`
	Subtotal      int64  `json:"subtotal"`
	OrderTotalIDR int64  `json:"order_total_idr"`
}

// TopSellingItem — item terlaris dalam periode (top 10 by qty).
type TopSellingItem struct {
	ItemName   string `json:"item_name"`
	Quantity   int    `json:"quantity"`
	RevenueIDR int64  `json:"revenue_idr"`
}

// SalesReportSummary — ringkasan penjualan periode.
type SalesReportSummary struct {
	Period            string           `json:"period"` // daily | weekly
	TotalOrders       int              `json:"total_orders"`
	GMVIDR            int64            `json:"gmv_idr"`
	AvgOrderValueIDR  int64            `json:"avg_order_value_idr"`
	TopItems          []TopSellingItem `json:"top_items"`
}

// MerchantReportRepository — agregasi penjualan merchant (FB-086).
type MerchantReportRepository interface {
	// SalesReport ambil ringkasan penjualan merchant untuk periode.
	SalesReport(ctx context.Context, merchantID, period string) (*SalesReportSummary, error)
	// SalesReportRows ambil baris transaksi detail (untuk export CSV).
	SalesReportRows(ctx context.Context, merchantID, period string) ([]*SalesReportRow, error)
	// Settlements ambil riwayat pencairan/payout merchant (FB-113),
	// terbaru dulu, dibatasi [limit] baris.
	Settlements(ctx context.Context, merchantID string, limit int) ([]*SettlementRecord, error)
	// CreateWithdrawal buat permintaan pencairan saldo merchant (M7).
	CreateWithdrawal(ctx context.Context, w *MerchantWithdrawalRequest) error
	// ListWithdrawals riwayat permintaan pencairan merchant (M7), terbaru dulu.
	ListWithdrawals(ctx context.Context, merchantID string, limit int) ([]*MerchantWithdrawalRecord, error)
}

// ─────────────────────────────────────────────
// FB-113 — Settlement / Payout Merchant
// Riwayat pencairan dari tabel merchant_settlements (cron 5 menit).
// Status: HOLDING → PROCESSING → COMPLETED | FAILED | DISPUTED.
// ─────────────────────────────────────────────

// SettlementRecord — satu baris riwayat pencairan merchant.
type SettlementRecord struct {
	ID                string  `json:"id"`
	OrderID           string  `json:"order_id"`
	PaymentLinkID     string  `json:"payment_link_id"`
	GrossItemPriceIDR int64   `json:"gross_item_price_idr"`
	MerchantFeeIDR    int64   `json:"merchant_fee_idr"`
	PromoDiscountIDR  int64   `json:"promo_discount_idr,omitempty"`
	NetPayoutIDR      int64   `json:"net_payout_idr"`
	Status            string  `json:"status"`
	HoldingReleaseAt  *string `json:"holding_release_at,omitempty"`
	SettledAt         *string `json:"settled_at,omitempty"`
	DisbursementRef   *string `json:"disbursement_ref,omitempty"`
	FailureReason     *string `json:"failure_reason,omitempty"`
	CreatedAt         string  `json:"created_at"`
}

// SettlementSummary — ringkasan + riwayat (respons endpoint settlements).
type SettlementSummary struct {
	// TotalIDR total yang sudah CAIR (COMPLETED).
	TotalIDR int64 `json:"total_idr"`
	// HoldingIDR total yang masih ditahan (HOLDING/PROCESSING).
	HoldingIDR int64 `json:"holding_idr"`
	// AvailableIDR saldo yang bisa ditarik = TotalIDR - HoldingIDR (M7).
	AvailableIDR int64 `json:"available_idr"`
	Records      []*SettlementRecord `json:"records"`
}

// MerchantWithdrawalRequest — input ajukan pencairan saldo merchant (M7).
type MerchantWithdrawalRequest struct {
	MerchantID       string
	UserID           string
	AmountIDR        int64  `json:"amount_idr"`
	BankName         string `json:"bank_name"`
	BankAccountNumber string `json:"bank_account_number"`
	BankAccountHolder string `json:"bank_account_holder"`
	IdempotencyKey   string `json:"-"`
}

// MerchantWithdrawalRecord — record permintaan pencairan (response/riwayat).
type MerchantWithdrawalRecord struct {
	ID               string `json:"id"`
	AmountIDR        int64  `json:"amount_idr"`
	BankName         string `json:"bank_name"`
	BankAccountNumber string `json:"bank_account_number"`
	BankAccountHolder string `json:"bank_account_holder"`
	Status           string `json:"status"`
	RejectionReason  *string `json:"rejection_reason,omitempty"`
	DisbursementRef  *string `json:"disbursement_ref,omitempty"`
	CreatedAt        string `json:"created_at"`
}

// CreateMerchantWithdrawalInput — payload dari handler (validasi di service).
type CreateMerchantWithdrawalInput struct {
	AmountIDR         int64  `json:"amount_idr"`
	BankName          string `json:"bank_name"`
	BankAccountNumber string `json:"bank_account_number"`
	BankAccountHolder string `json:"bank_account_holder"`
	IdempotencyKey    string `json:"idempotency_key"`
}
