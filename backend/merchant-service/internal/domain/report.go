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

// SalesReportPoint — pendapatan delivered per hari untuk grafik Wawasan.
// Hari tanpa transaksi tetap dikembalikan dengan nilai 0.
type SalesReportPoint struct {
	Day        string `json:"day"`
	RevenueIDR int64  `json:"revenue_idr"`
}

// SalesReportSummary — ringkasan penjualan periode.
type SalesReportSummary struct {
	Period           string             `json:"period"` // daily | weekly
	TotalOrders      int                `json:"total_orders"`
	GMVIDR           int64              `json:"gmv_idr"`
	AvgOrderValueIDR int64              `json:"avg_order_value_idr"`
	TopItems         []TopSellingItem   `json:"top_items"`
	DailyBreakdown   []SalesReportPoint `json:"daily_breakdown"`
}

// MerchantReview — satu review customer yang sudah tersimpan di merchant_ratings.
// Nama customer hanya dipakai sebagai display name; data kontak tidak pernah
// dikembalikan ke aplikasi merchant.
type MerchantReview struct {
	ID           string               `json:"id"`
	OrderNumber  string               `json:"order_number,omitempty"`
	ReviewerName string               `json:"reviewer_name"`
	Stars        int                  `json:"stars"`
	Comment      string               `json:"comment,omitempty"`
	Tags         []string             `json:"tags,omitempty"`
	CreatedAt    string               `json:"created_at"`
	Reply        *MerchantReviewReply `json:"reply,omitempty"`
}

// MerchantReviewReply — tanggapan merchant yang benar-benar tersimpan untuk
// satu rating. Tidak ada fallback reply dari mock ZIP.
type MerchantReviewReply struct {
	ID        string `json:"id"`
	Body      string `json:"body"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// MerchantRatingBucket — jumlah rating per bintang untuk visualisasi ringkasan.
type MerchantRatingBucket struct {
	Stars int `json:"stars"`
	Count int `json:"count"`
}

// MerchantReviewsResponse — ringkasan rating + halaman review real.
type MerchantReviewsResponse struct {
	AvgRating          float64                `json:"avg_rating"`
	RatingCount        int                    `json:"rating_count"`
	Reviews            []*MerchantReview      `json:"reviews"`
	RatingDistribution []MerchantRatingBucket `json:"rating_distribution"`
	Page               int                    `json:"page"`
	PageSize           int                    `json:"page_size"`
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
	// Reviews mengambil review customer yang sudah tersimpan, terbaru dulu.
	Reviews(ctx context.Context, merchantID string, limit, offset int) ([]*MerchantReview, error)
	// RatingDistribution menghitung semua bucket bintang merchant.
	RatingDistribution(ctx context.Context, merchantID string) ([]MerchantRatingBucket, error)
	// UpsertReviewReply menyimpan tanggapan merchant untuk review miliknya.
	UpsertReviewReply(ctx context.Context, merchantID, userID, reviewID, body string) (*MerchantReviewReply, error)
}

// CreateMerchantReviewReplyInput — payload reply dari aplikasi merchant.
type CreateMerchantReviewReplyInput struct {
	Body string `json:"body"`
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
	AvailableIDR int64               `json:"available_idr"`
	Records      []*SettlementRecord `json:"records"`
}

// MerchantWithdrawalRequest — input ajukan pencairan saldo merchant (M7).
type MerchantWithdrawalRequest struct {
	MerchantID        string
	UserID            string
	AmountIDR         int64  `json:"amount_idr"`
	BankName          string `json:"bank_name"`
	BankAccountNumber string `json:"bank_account_number"`
	BankAccountHolder string `json:"bank_account_holder"`
	IdempotencyKey    string `json:"-"`
}

// MerchantWithdrawalRecord — record permintaan pencairan (response/riwayat).
type MerchantWithdrawalRecord struct {
	ID                string  `json:"id"`
	AmountIDR         int64   `json:"amount_idr"`
	BankName          string  `json:"bank_name"`
	BankAccountNumber string  `json:"bank_account_number"`
	BankAccountHolder string  `json:"bank_account_holder"`
	Status            string  `json:"status"`
	RejectionReason   *string `json:"rejection_reason,omitempty"`
	DisbursementRef   *string `json:"disbursement_ref,omitempty"`
	CreatedAt         string  `json:"created_at"`
}

// CreateMerchantWithdrawalInput — payload dari handler (validasi di service).
type CreateMerchantWithdrawalInput struct {
	AmountIDR         int64  `json:"amount_idr"`
	BankName          string `json:"bank_name"`
	BankAccountNumber string `json:"bank_account_number"`
	BankAccountHolder string `json:"bank_account_holder"`
	IdempotencyKey    string `json:"idempotency_key"`
}
