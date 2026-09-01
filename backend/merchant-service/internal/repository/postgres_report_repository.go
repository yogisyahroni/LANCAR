package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"tembus/merchant-service/internal/domain"

	"github.com/lib/pq"
)

// postgresReportRepository — implementasi domain.MerchantReportRepository.
// Agregasi penjualan dari tabel orders + food_order_items (DB bersama tembus).
type postgresReportRepository struct {
	db     *sql.DB
	readDB *sql.DB
}

func NewPostgresReportRepository(db, readDB *sql.DB) domain.MerchantReportRepository {
	return &postgresReportRepository{db: db, readDB: readDB}
}

// periodFilter — klausa waktu untuk daily (hari ini) / weekly (7 hari terakhir).
// GMV = order delivered saja (penjualan riil merchant).
func periodFilter(period string) string {
	return periodFilterFor("o", period)
}

func periodFilterFor(alias, period string) string {
	if period == "weekly" {
		return fmt.Sprintf(`%s.created_at >= (NOW() - INTERVAL '7 days')`, alias)
	}
	return fmt.Sprintf(`%s.created_at >= date_trunc('day', NOW())`, alias)
}

func (r *postgresReportRepository) SalesReport(ctx context.Context, merchantID, period string) (*domain.SalesReportSummary, error) {
	filter := periodFilter(period)

	var summary domain.SalesReportSummary
	summary.Period = period

	// 1. Total order + GMV (delivered)
	err := r.readDB.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT COUNT(*), COALESCE(SUM(o.total_price_idr), 0)
		FROM orders o
		WHERE o.merchant_id = $1
		  AND o.service_sub_type = 'food_delivery'
		  AND o.status = 'delivered'
		  AND %s`, filter), merchantID).Scan(&summary.TotalOrders, &summary.GMVIDR)
	if err != nil {
		return nil, fmt.Errorf("sales report summary: %w", err)
	}
	if summary.TotalOrders > 0 {
		summary.AvgOrderValueIDR = summary.GMVIDR / int64(summary.TotalOrders)
	}

	// 1b. Metrik operasional: order masuk, acceptance/cancellation rate, dan
	// rating. Query terpisah menjaga definisi GMV tetap delivered-only.
	performanceFilter := periodFilterFor("o", period)
	var knownCustomerCount int
	if err := r.readDB.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT COUNT(*),
		       COUNT(*) FILTER (WHERE o.merchant_accepted_at IS NOT NULL),
		       COUNT(*) FILTER (WHERE o.status = 'cancelled'),
		       COUNT(*) FILTER (WHERE o.reject_reason IS NOT NULL)
		FROM orders o
		WHERE o.merchant_id = $1
		  AND o.service_sub_type = 'food_delivery'
		  AND %s`, performanceFilter), merchantID).Scan(
		&summary.Performance.TotalReceived,
		&summary.Performance.Accepted,
		&summary.Performance.Cancelled,
		&summary.Performance.RejectedByMerchant,
	); err != nil {
		return nil, fmt.Errorf("sales report performance orders: %w", err)
	}
	if summary.Performance.TotalReceived > 0 {
		denominator := float64(summary.Performance.TotalReceived)
		summary.Performance.AcceptanceRatePct = float64(summary.Performance.Accepted) / denominator * 100
		summary.Performance.CancellationRatePct = float64(summary.Performance.Cancelled) / denominator * 100
	}
	ratingFilter := periodFilterFor("r", period)
	if err := r.readDB.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT COALESCE(AVG(r.stars), 0), COUNT(*)
		FROM merchant_ratings r
		WHERE r.merchant_id = $1 AND %s`, ratingFilter), merchantID).Scan(
		&summary.Performance.AvgRating,
		&summary.Performance.RatingCount,
	); err != nil {
		return nil, fmt.Errorf("sales report performance ratings: %w", err)
	}

	// 1c. Analytics lanjutan tetap berasal dari transaksi periode ini. Customer
	// tanpa ID tidak dipaksa masuk ke metrik repeat agar denominator jujur.
	if err := r.readDB.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT COUNT(*) FILTER (WHERE customer_orders > 1), COUNT(*)
		FROM (
			SELECT o.customer_id, COUNT(*) AS customer_orders
			FROM orders o
			WHERE o.merchant_id = $1
			  AND o.service_sub_type = 'food_delivery'
			  AND o.status = 'delivered'
			  AND o.customer_id IS NOT NULL
			  AND %s
			GROUP BY o.customer_id
		) customer_totals`, filter), merchantID).Scan(
		&summary.Advanced.RepeatCustomerCount,
		&knownCustomerCount,
	); err != nil {
		return nil, fmt.Errorf("sales report repeat customers: %w", err)
	}
	if knownCustomerCount > 0 {
		summary.Advanced.RepeatCustomerRatePct = float64(summary.Advanced.RepeatCustomerCount) / float64(knownCustomerCount) * 100
	} else {
		summary.Advanced.RepeatCustomerRatePct = 0
	}

	var peakHour sql.NullInt64
	if err := r.readDB.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT EXTRACT(HOUR FROM (o.created_at AT TIME ZONE 'Asia/Jakarta'))::int
		FROM orders o
		WHERE o.merchant_id = $1
		  AND o.service_sub_type = 'food_delivery'
		  AND o.status = 'delivered'
		  AND %s
		GROUP BY EXTRACT(HOUR FROM (o.created_at AT TIME ZONE 'Asia/Jakarta'))
		ORDER BY COUNT(*) DESC, EXTRACT(HOUR FROM (o.created_at AT TIME ZONE 'Asia/Jakarta')) ASC
		LIMIT 1`, filter), merchantID).Scan(&peakHour); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("sales report peak hour: %w", err)
	}
	if peakHour.Valid {
		hour := int(peakHour.Int64)
		summary.Advanced.PeakOrderHour = &hour
	}

	var avgReady sql.NullFloat64
	if err := r.readDB.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT AVG(EXTRACT(EPOCH FROM (o.food_ready_at - o.merchant_accepted_at)) / 60.0)
		FROM orders o
		WHERE o.merchant_id = $1
		  AND o.service_sub_type = 'food_delivery'
		  AND o.status = 'delivered'
		  AND o.food_ready_at IS NOT NULL
		  AND o.merchant_accepted_at IS NOT NULL
		  AND %s`, filter), merchantID).Scan(&avgReady); err != nil {
		return nil, fmt.Errorf("sales report accepted ready time: %w", err)
	}
	if avgReady.Valid {
		minutes := avgReady.Float64
		summary.Advanced.AvgAcceptedReadyMins = &minutes
	}

	// 2. Item terlaris (top 10 by qty)
	rows, err := r.readDB.QueryContext(ctx, fmt.Sprintf(`
		SELECT f.item_name, SUM(f.quantity) AS qty, SUM(f.subtotal) AS revenue
		FROM orders o
		JOIN food_order_items f ON f.order_id = o.id
		WHERE o.merchant_id = $1
		  AND o.service_sub_type = 'food_delivery'
		  AND o.status = 'delivered'
		  AND %s
		GROUP BY f.item_name
		ORDER BY qty DESC
		LIMIT 10`, filter), merchantID)
	if err != nil {
		return nil, fmt.Errorf("sales report top items: %w", err)
	}
	defer rows.Close()

	summary.TopItems = []domain.TopSellingItem{}
	for rows.Next() {
		var it domain.TopSellingItem
		if err := rows.Scan(&it.ItemName, &it.Quantity, &it.RevenueIDR); err != nil {
			return nil, fmt.Errorf("scan top item: %w", err)
		}
		summary.TopItems = append(summary.TopItems, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("sales report top items rows: %w", err)
	}

	// 3. Pendapatan per hari untuk grafik Wawasan. Data diambil dari order
	// delivered riil; tidak ada titik/growth yang dibuat di sisi Android.
	breakdownDays := 1
	if period == "weekly" {
		breakdownDays = 7
	}
	breakdownRows, err := r.readDB.QueryContext(ctx, `
		WITH days AS (
			SELECT generate_series(
				date_trunc('day', NOW()) - ($2 - 1) * INTERVAL '1 day',
				date_trunc('day', NOW()),
				INTERVAL '1 day'
			)::date AS day
		)
		SELECT TO_CHAR(days.day, 'YYYY-MM-DD'),
		       COALESCE(SUM(o.total_price_idr), 0)
		FROM days
		LEFT JOIN orders o ON o.merchant_id = $1
		  AND o.service_sub_type = 'food_delivery'
		  AND o.status = 'delivered'
		  AND o.created_at >= days.day
		  AND o.created_at < days.day + INTERVAL '1 day'
		GROUP BY days.day
		ORDER BY days.day`, merchantID, breakdownDays)
	if err != nil {
		return nil, fmt.Errorf("sales report daily breakdown: %w", err)
	}
	defer breakdownRows.Close()
	summary.DailyBreakdown = []domain.SalesReportPoint{}
	for breakdownRows.Next() {
		var point domain.SalesReportPoint
		if err := breakdownRows.Scan(&point.Day, &point.RevenueIDR); err != nil {
			return nil, fmt.Errorf("scan sales report daily breakdown: %w", err)
		}
		summary.DailyBreakdown = append(summary.DailyBreakdown, point)
	}
	if err := breakdownRows.Err(); err != nil {
		return nil, fmt.Errorf("sales report daily breakdown rows: %w", err)
	}

	return &summary, nil
}

// Settlements — riwayat pencairan merchant (FB-113), terbaru dulu.
// Tanggal diformat ke string via TO_CHAR supaya scan sederhana.
func (r *postgresReportRepository) Settlements(ctx context.Context, merchantID string, limit int) ([]*domain.SettlementRecord, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT ms.id,
		       ms.order_id::text,
		       ms.payment_link_id,
		       ms.gross_item_price_idr,
		       ms.merchant_fee_idr,
		       COALESCE(ms.merchant_promo_discount_idr, 0),
		       ms.net_payout_idr,
		       ms.status,
		       TO_CHAR(ms.holding_release_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       TO_CHAR(ms.settled_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       ms.disbursement_ref,
		       ms.failure_reason,
		       TO_CHAR(ms.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM merchant_settlements ms
		WHERE ms.merchant_id = $1
		ORDER BY ms.created_at DESC
		LIMIT $2
	`, merchantID, limit)
	if err != nil {
		return nil, fmt.Errorf("settlements query: %w", err)
	}
	defer rows.Close()

	records := []*domain.SettlementRecord{}
	for rows.Next() {
		var (
			rec              domain.SettlementRecord
			holding, settled sql.NullString
		)
		if err := rows.Scan(
			&rec.ID,
			&rec.OrderID,
			&rec.PaymentLinkID,
			&rec.GrossItemPriceIDR,
			&rec.MerchantFeeIDR,
			&rec.PromoDiscountIDR,
			&rec.NetPayoutIDR,
			&rec.Status,
			&holding,
			&settled,
			&rec.DisbursementRef,
			&rec.FailureReason,
			&rec.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan settlement: %w", err)
		}
		if holding.Valid {
			rec.HoldingReleaseAt = &holding.String
		}
		if settled.Valid {
			rec.SettledAt = &settled.String
		}
		records = append(records, &rec)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("settlements rows: %w", err)
	}
	return records, nil
}

// TaxSummary mengagregasi snapshot pajak order food delivered merchant.
// Snapshot order dipakai langsung; rate pajak saat ini tidak diterapkan ulang.
func (r *postgresReportRepository) TaxSummary(ctx context.Context, merchantID string) (domain.MerchantTaxSummary, error) {
	var summary domain.MerchantTaxSummary
	err := r.readDB.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(COALESCE(o.dpp_idr, 0)), 0),
		       COALESCE(SUM(COALESCE(o.ppn_idr, 0)), 0),
		       COUNT(*) FILTER (WHERE COALESCE(o.tax_invoice_required, FALSE)),
		       COUNT(*) FILTER (WHERE COALESCE(o.tax_invoice_status, 'unissued') IN ('draft', 'exported', 'submitted', 'accepted'))
		FROM orders o
		WHERE o.merchant_id = $1
		  AND o.service_sub_type = 'food_delivery'
		  AND o.status = 'delivered'`, merchantID).Scan(
		&summary.TaxableSalesIDR,
		&summary.PPNIDR,
		&summary.InvoiceRequired,
		&summary.InvoiceIssued,
	)
	if err != nil {
		return domain.MerchantTaxSummary{}, fmt.Errorf("merchant tax summary: %w", err)
	}
	return summary, nil
}

// CreateWithdrawal — simpan permintaan pencairan saldo merchant (M7).
func (r *postgresReportRepository) CreateWithdrawal(ctx context.Context, w *domain.MerchantWithdrawalRequest) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO merchant_withdrawal_requests
			(merchant_id, user_id, amount_idr, bank_name, bank_account_number, bank_account_holder, idempotency_key)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, w.MerchantID, w.UserID, w.AmountIDR, w.BankName, w.BankAccountNumber, w.BankAccountHolder, w.IdempotencyKey)
	if err != nil {
		return fmt.Errorf("insert withdrawal: %w", err)
	}
	return nil
}

// ListWithdrawals — riwayat permintaan pencairan merchant (M7), terbaru dulu.
func (r *postgresReportRepository) ListWithdrawals(ctx context.Context, merchantID string, limit int) ([]*domain.MerchantWithdrawalRecord, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT id, amount_idr, bank_name, bank_account_number, bank_account_holder,
		       status, rejection_reason, disbursement_ref,
		       TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM merchant_withdrawal_requests
		WHERE merchant_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, merchantID, limit)
	if err != nil {
		return nil, fmt.Errorf("list withdrawals: %w", err)
	}
	defer rows.Close()

	records := []*domain.MerchantWithdrawalRecord{}
	for rows.Next() {
		var (
			rec     domain.MerchantWithdrawalRecord
			reject  sql.NullString
			disbRef sql.NullString
		)
		if err := rows.Scan(
			&rec.ID, &rec.AmountIDR, &rec.BankName, &rec.BankAccountNumber,
			&rec.BankAccountHolder, &rec.Status, &reject, &disbRef, &rec.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan withdrawal: %w", err)
		}
		if reject.Valid {
			rec.RejectionReason = &reject.String
		}
		if disbRef.Valid {
			rec.DisbursementRef = &disbRef.String
		}
		records = append(records, &rec)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("withdrawals rows: %w", err)
	}
	return records, nil
}

// Reviews mengambil review merchant dari merchant_ratings. Query hanya join
// full_name dan order_number untuk kebutuhan tampilan; email/phone tidak ikut.
func (r *postgresReportRepository) Reviews(ctx context.Context, merchantID string, limit, offset int) ([]*domain.MerchantReview, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT r.id::text,
		       COALESCE(o.order_number, ''),
		       COALESCE(NULLIF(u.full_name, ''), 'Customer'),
		       r.stars,
		       COALESCE(r.comment, ''),
		       r.tags,
		       TO_CHAR(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       reply.id::text,
		       reply.body,
		       TO_CHAR(reply.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       TO_CHAR(reply.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM merchant_ratings r
		JOIN users u ON u.id = r.rated_by
		LEFT JOIN orders o ON o.id = r.order_id
		LEFT JOIN merchant_rating_replies reply ON reply.merchant_rating_id = r.id
		WHERE r.merchant_id = $1
		ORDER BY r.created_at DESC
		LIMIT $2 OFFSET $3
	`, merchantID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("merchant reviews query: %w", err)
	}
	defer rows.Close()

	reviews := []*domain.MerchantReview{}
	for rows.Next() {
		var review domain.MerchantReview
		var comment, createdAt, replyID, replyBody, replyCreatedAt, replyUpdatedAt sql.NullString
		var tags pq.StringArray
		if err := rows.Scan(&review.ID, &review.OrderNumber, &review.ReviewerName,
			&review.Stars, &comment, &tags, &createdAt, &replyID, &replyBody, &replyCreatedAt, &replyUpdatedAt); err != nil {
			return nil, fmt.Errorf("scan merchant review: %w", err)
		}
		if comment.Valid {
			review.Comment = comment.String
		}
		if createdAt.Valid {
			review.CreatedAt = createdAt.String
		}
		if tags != nil {
			review.Tags = []string(tags)
		}
		if replyID.Valid {
			review.Reply = &domain.MerchantReviewReply{
				ID: replyID.String, Body: replyBody.String,
				CreatedAt: replyCreatedAt.String, UpdatedAt: replyUpdatedAt.String,
			}
		}
		reviews = append(reviews, &review)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("merchant reviews rows: %w", err)
	}
	return reviews, nil
}

func (r *postgresReportRepository) RatingDistribution(ctx context.Context, merchantID string) ([]domain.MerchantRatingBucket, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT stars, COUNT(*)
		FROM merchant_ratings
		WHERE merchant_id = $1
		GROUP BY stars
		ORDER BY stars DESC
	`, merchantID)
	if err != nil {
		return nil, fmt.Errorf("merchant rating distribution query: %w", err)
	}
	defer rows.Close()
	buckets := []domain.MerchantRatingBucket{}
	for rows.Next() {
		var bucket domain.MerchantRatingBucket
		if err := rows.Scan(&bucket.Stars, &bucket.Count); err != nil {
			return nil, fmt.Errorf("scan merchant rating distribution: %w", err)
		}
		buckets = append(buckets, bucket)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("merchant rating distribution rows: %w", err)
	}
	return buckets, nil
}

func (r *postgresReportRepository) UpsertReviewReply(ctx context.Context, merchantID, userID, reviewID, body string) (*domain.MerchantReviewReply, error) {
	var reply domain.MerchantReviewReply
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO merchant_rating_replies (merchant_rating_id, merchant_id, author_user_id, body)
		SELECT rating.id, rating.merchant_id, $2, $3
		FROM merchant_ratings rating
		WHERE rating.id = $1 AND rating.merchant_id = $4
		ON CONFLICT (merchant_rating_id) DO UPDATE
		SET body = EXCLUDED.body, author_user_id = EXCLUDED.author_user_id, updated_at = NOW()
		RETURNING id::text, body,
		          TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		          TO_CHAR(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
	`, reviewID, userID, body, merchantID).Scan(&reply.ID, &reply.Body, &reply.CreatedAt, &reply.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("review tidak ditemukan atau bukan milik merchant")
	}
	if err != nil {
		return nil, fmt.Errorf("upsert merchant review reply: %w", err)
	}
	return &reply, nil
}

func (r *postgresReportRepository) SalesReportRows(ctx context.Context, merchantID, period string) ([]*domain.SalesReportRow, error) {
	filter := periodFilter(period)

	rows, err := r.readDB.QueryContext(ctx, fmt.Sprintf(`
		SELECT o.order_number,
		       COALESCE(to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
		       o.status,
		       f.item_name,
		       f.quantity,
		       f.item_price,
		       f.subtotal,
		       o.total_price_idr
		FROM orders o
		JOIN food_order_items f ON f.order_id = o.id
		WHERE o.merchant_id = $1
		  AND o.service_sub_type = 'food_delivery'
		  AND o.status = 'delivered'
		  AND %s
		ORDER BY o.created_at DESC, f.created_at ASC`, filter), merchantID)
	if err != nil {
		return nil, fmt.Errorf("sales report rows: %w", err)
	}
	defer rows.Close()

	out := []*domain.SalesReportRow{}
	for rows.Next() {
		var rw domain.SalesReportRow
		if err := rows.Scan(&rw.OrderNumber, &rw.CreatedAt, &rw.Status, &rw.ItemName,
			&rw.Quantity, &rw.ItemPrice, &rw.Subtotal, &rw.OrderTotalIDR); err != nil {
			return nil, fmt.Errorf("scan report row: %w", err)
		}
		out = append(out, &rw)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("sales report rows err: %w", err)
	}
	return out, nil
}
