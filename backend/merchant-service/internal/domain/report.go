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
}
