package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"tembus/order-service/internal/repository"
	"time"
)

type AnalyticsService interface {
	GetDashboardMetrics(ctx context.Context, start, end time.Time, zoneID string) (map[string]interface{}, error)
	GenerateCSVReport(ctx context.Context, start, end time.Time, zoneID string, reportType string) ([]byte, error)
	RefreshData(ctx context.Context) error
}

type analyticsService struct {
	repo repository.AnalyticsRepository
}

func NewAnalyticsService(repo repository.AnalyticsRepository) AnalyticsService {
	return &analyticsService{repo: repo}
}

func (s *analyticsService) GetDashboardMetrics(ctx context.Context, start, end time.Time, zoneID string) (map[string]interface{}, error) {
	revenue, err := s.repo.GetRevenueMetrics(ctx, start, end, zoneID)
	if err != nil {
		return nil, err
	}

	sla, err := s.repo.GetSLACompliance(ctx, start, end, zoneID)
	if err != nil {
		return nil, err
	}

	funnel, err := s.repo.GetOrderFunnel(ctx, start, end)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"revenue": revenue,
		"sla":     sla,
		"funnel":  funnel,
	}, nil
}

func (s *analyticsService) GenerateCSVReport(ctx context.Context, start, end time.Time, zoneID string, reportType string) ([]byte, error) {
	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)

	switch reportType {
	case "revenue":
		data, err := s.repo.GetRevenueMetrics(ctx, start, end, zoneID)
		if err != nil {
			return nil, err
		}
		writer.Write([]string{"Date", "Zone", "Model", "Total Orders", "Gross Revenue", "Surge Revenue", "MDR", "PPN"})
		for _, r := range data {
			writer.Write([]string{
				r.ReportDate.Format("2006-01-02"),
				r.ZoneName,
				r.Model,
				fmt.Sprintf("%d", r.TotalOrders),
				fmt.Sprintf("%d", r.GrossRevenue),
				fmt.Sprintf("%d", r.SurgeRevenue),
				fmt.Sprintf("%d", r.TotalMDR),
				fmt.Sprintf("%d", r.TotalPPN),
			})
		}
	case "sla":
		data, err := s.repo.GetSLACompliance(ctx, start, end, zoneID)
		if err != nil {
			return nil, err
		}
		writer.Write([]string{"Date", "Zone ID", "Courier ID", "Total Legs", "On-Time Legs", "Compliance %"})
		for _, r := range data {
			writer.Write([]string{
				r.ReportDate.Format("2006-01-02"),
				r.ZoneID,
				r.CourierID,
				fmt.Sprintf("%d", r.TotalLegs),
				fmt.Sprintf("%d", r.OnTimeLegs),
				fmt.Sprintf("%.2f", r.ComplianceRatePct),
			})
		}
	default:
		return nil, fmt.Errorf("invalid report type: %s", reportType)
	}

	writer.Flush()
	return buf.Bytes(), nil
}

func (s *analyticsService) RefreshData(ctx context.Context) error {
	return s.repo.RefreshMaterializedViews(ctx)
}
