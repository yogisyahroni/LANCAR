package repository

import (
	"context"
	"database/sql"
	"fmt"

	"tembus/merchant-service/internal/domain"
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
	if period == "weekly" {
		return `o.created_at >= (NOW() - INTERVAL '7 days')`
	}
	return `o.created_at >= date_trunc('day', NOW())`
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

	return &summary, nil
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
