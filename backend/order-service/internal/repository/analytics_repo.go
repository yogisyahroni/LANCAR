package repository

import (
	"context"
	"github.com/jmoiron/sqlx"
	"lancar/order-service/internal/domain"
	"time"
)

type AnalyticsRepository interface {
	GetRevenueMetrics(ctx context.Context, start, end time.Time, zoneID string) ([]domain.RevenueMetrics, error)
	GetSLACompliance(ctx context.Context, start, end time.Time, zoneID string) ([]domain.SLAComplianceMetrics, error)
	GetCourierUtilization(ctx context.Context, start, end time.Time) ([]domain.CourierUtilizationMetrics, error)
	GetOrderFunnel(ctx context.Context, start, end time.Time) ([]domain.OrderFunnelMetrics, error)
	GetScanAccuracy(ctx context.Context, start, end time.Time) ([]domain.ScanAccuracyMetrics, error)
	RefreshMaterializedViews(ctx context.Context) error
}

type postgresAnalyticsRepository struct {
	db *sqlx.DB
}

func NewAnalyticsRepository(db *sqlx.DB) AnalyticsRepository {
	return &postgresAnalyticsRepository{db: db}
}

func (r *postgresAnalyticsRepository) GetRevenueMetrics(ctx context.Context, start, end time.Time, zoneID string) ([]domain.RevenueMetrics, error) {
	query := `SELECT report_date, zone_id, zone_name, model, total_orders, gross_revenue, surge_revenue, total_mdr, total_ppn 
	          FROM mv_daily_revenue 
	          WHERE report_date >= $1 AND report_date <= $2`
	args := []interface{}{start, end}
	if zoneID != "" {
		query += " AND zone_id = $3"
		args = append(args, zoneID)
	}
	query += " ORDER BY report_date DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []domain.RevenueMetrics
	for rows.Next() {
		var m domain.RevenueMetrics
		if err := rows.Scan(&m.ReportDate, &m.ZoneID, &m.ZoneName, &m.Model, &m.TotalOrders, &m.GrossRevenue, &m.SurgeRevenue, &m.TotalMDR, &m.TotalPPN); err != nil {
			return nil, err
		}
		results = append(results, m)
	}
	return results, nil
}

func (r *postgresAnalyticsRepository) GetSLACompliance(ctx context.Context, start, end time.Time, zoneID string) ([]domain.SLAComplianceMetrics, error) {
	query := `SELECT report_date, zone_id, courier_id, total_legs, on_time_legs, compliance_rate_pct 
	          FROM mv_sla_compliance 
	          WHERE report_date >= $1 AND report_date <= $2`
	args := []interface{}{start, end}
	if zoneID != "" {
		query += " AND zone_id = $3"
		args = append(args, zoneID)
	}
	query += " ORDER BY report_date DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []domain.SLAComplianceMetrics
	for rows.Next() {
		var m domain.SLAComplianceMetrics
		if err := rows.Scan(&m.ReportDate, &m.ZoneID, &m.CourierID, &m.TotalLegs, &m.OnTimeLegs, &m.ComplianceRatePct); err != nil {
			return nil, err
		}
		results = append(results, m)
	}
	return results, nil
}

func (r *postgresAnalyticsRepository) GetCourierUtilization(ctx context.Context, start, end time.Time) ([]domain.CourierUtilizationMetrics, error) {
	query := `SELECT report_date, courier_id, orders_completed, active_hours 
	          FROM mv_courier_utilization 
	          WHERE report_date >= $1 AND report_date <= $2 
	          ORDER BY report_date DESC`
	
	rows, err := r.db.QueryContext(ctx, query, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []domain.CourierUtilizationMetrics
	for rows.Next() {
		var m domain.CourierUtilizationMetrics
		if err := rows.Scan(&m.ReportDate, &m.CourierID, &m.OrdersCompleted, &m.ActiveHours); err != nil {
			return nil, err
		}
		results = append(results, m)
	}
	return results, nil
}

func (r *postgresAnalyticsRepository) GetOrderFunnel(ctx context.Context, start, end time.Time) ([]domain.OrderFunnelMetrics, error) {
	query := `SELECT report_date, status, order_count 
	          FROM mv_order_funnel 
	          WHERE report_date >= $1 AND report_date <= $2 
	          ORDER BY report_date DESC, status ASC`
	
	rows, err := r.db.QueryContext(ctx, query, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []domain.OrderFunnelMetrics
	for rows.Next() {
		var m domain.OrderFunnelMetrics
		if err := rows.Scan(&m.ReportDate, &m.Status, &m.OrderCount); err != nil {
			return nil, err
		}
		results = append(results, m)
	}
	return results, nil
}

func (r *postgresAnalyticsRepository) GetScanAccuracy(ctx context.Context, start, end time.Time) ([]domain.ScanAccuracyMetrics, error) {
	query := `SELECT report_date, confidence_bin, scan_count 
	          FROM mv_scan_accuracy 
	          WHERE report_date >= $1 AND report_date <= $2 
	          ORDER BY report_date DESC, confidence_bin ASC`
	
	rows, err := r.db.QueryContext(ctx, query, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []domain.ScanAccuracyMetrics
	for rows.Next() {
		var m domain.ScanAccuracyMetrics
		if err := rows.Scan(&m.ReportDate, &m.ConfidenceBin, &m.ScanCount); err != nil {
			return nil, err
		}
		results = append(results, m)
	}
	return results, nil
}

func (r *postgresAnalyticsRepository) RefreshMaterializedViews(ctx context.Context) error {
	views := []string{"mv_daily_revenue", "mv_sla_compliance", "mv_courier_utilization", "mv_order_funnel", "mv_scan_accuracy"}
	for _, v := range views {
		if _, err := r.db.ExecContext(ctx, "REFRESH MATERIALIZED VIEW CONCURRENTLY "+v); err != nil {
			// Fallback to non-concurrent if not indexed yet or first time
			if _, err := r.db.ExecContext(ctx, "REFRESH MATERIALIZED VIEW "+v); err != nil {
				return err
			}
		}
	}
	return nil
}
