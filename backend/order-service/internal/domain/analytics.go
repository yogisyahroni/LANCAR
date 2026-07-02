package domain

import (
	"time"
)

type AnalyticsReportType string

const (
	ReportTypeCSV AnalyticsReportType = "csv"
	ReportTypePDF AnalyticsReportType = "pdf"
)

type RevenueMetrics struct {
	ReportDate   time.Time `json:"report_date"`
	ZoneID       string    `json:"zone_id"`
	ZoneName     string    `json:"zone_name"`
	Model        string    `json:"model"`
	TotalOrders  int       `json:"total_orders"`
	GrossRevenue int       `json:"gross_revenue"`
	SurgeRevenue int       `json:"surge_revenue"`
	TotalMDR     int       `json:"total_mdr"`
	TotalPPN     int       `json:"total_ppn"`
}

type SLAComplianceMetrics struct {
	ReportDate        time.Time `json:"report_date"`
	ZoneID            string    `json:"zone_id"`
	CourierID         string    `json:"courier_id"`
	TotalLegs         int       `json:"total_legs"`
	OnTimeLegs        int       `json:"on_time_legs"`
	ComplianceRatePct float64   `json:"compliance_rate_pct"`
}

type CourierUtilizationMetrics struct {
	ReportDate      time.Time `json:"report_date"`
	CourierID       string    `json:"courier_id"`
	OrdersCompleted int       `json:"orders_completed"`
	ActiveHours     float64   `json:"active_hours"`
}

type OrderFunnelMetrics struct {
	ReportDate time.Time `json:"report_date"`
	Status     string    `json:"status"`
	OrderCount int       `json:"order_count"`
}

type ScanAccuracyMetrics struct {
	ReportDate    time.Time `json:"report_date"`
	ConfidenceBin float64   `json:"confidence_bin"`
	ScanCount     int       `json:"scan_count"`
}

type ReportRequest struct {
	Type      AnalyticsReportType `json:"type"`
	StartDate time.Time           `json:"start_date"`
	EndDate   time.Time           `json:"end_date"`
	ZoneID    string              `json:"zone_id,omitempty"`
}
