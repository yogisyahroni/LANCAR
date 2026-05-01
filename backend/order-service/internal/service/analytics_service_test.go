package service_test

import (
	"context"
	"testing"
	"time"

	"lancar/order-service/internal/domain"
	"lancar/order-service/internal/service"
)

// MockAnalyticsRepository
type MockAnalyticsRepository struct {
	RefreshCalled bool
}

func (m *MockAnalyticsRepository) GetRevenueMetrics(ctx context.Context, start, end time.Time, zoneID string) ([]domain.RevenueMetrics, error) {
	return []domain.RevenueMetrics{{ReportDate: time.Now(), GrossRevenue: 1000}}, nil
}

func (m *MockAnalyticsRepository) GetSLACompliance(ctx context.Context, start, end time.Time, zoneID string) ([]domain.SLAComplianceMetrics, error) {
	return []domain.SLAComplianceMetrics{{ReportDate: time.Now(), TotalLegs: 10, OnTimeLegs: 10, ComplianceRatePct: 100.0}}, nil
}

func (m *MockAnalyticsRepository) GetCourierUtilization(ctx context.Context, start, end time.Time) ([]domain.CourierUtilizationMetrics, error) {
	return []domain.CourierUtilizationMetrics{{ReportDate: time.Now(), CourierID: "c1", OrdersCompleted: 5}}, nil
}

func (m *MockAnalyticsRepository) GetOrderFunnel(ctx context.Context, start, end time.Time) ([]domain.OrderFunnelMetrics, error) {
	return []domain.OrderFunnelMetrics{{ReportDate: time.Now(), Status: "Created", OrderCount: 10}}, nil
}

func (m *MockAnalyticsRepository) GetScanAccuracy(ctx context.Context, start, end time.Time) ([]domain.ScanAccuracyMetrics, error) {
	return []domain.ScanAccuracyMetrics{{ReportDate: time.Now(), ConfidenceBin: 0.9, ScanCount: 10}}, nil
}

func (m *MockAnalyticsRepository) RefreshMaterializedViews(ctx context.Context) error {
	m.RefreshCalled = true
	return nil
}

func TestAnalyticsService_GetDashboardMetrics(t *testing.T) {
	mockRepo := &MockAnalyticsRepository{}
	svc := service.NewAnalyticsService(mockRepo)

	ctx := context.Background()
	start := time.Now().AddDate(0, 0, -7)
	end := time.Now()

	metrics, err := svc.GetDashboardMetrics(ctx, start, end, "")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if metrics["revenue"] == nil {
		t.Errorf("Expected revenue metrics, got nil")
	}

	if metrics["sla"] == nil {
		t.Errorf("Expected SLA metrics, got nil")
	}
}

func TestAnalyticsService_RefreshData(t *testing.T) {
	mockRepo := &MockAnalyticsRepository{}
	svc := service.NewAnalyticsService(mockRepo)

	ctx := context.Background()
	err := svc.RefreshData(ctx)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if !mockRepo.RefreshCalled {
		t.Errorf("Expected RefreshMaterializedViews to be called")
	}
}

func TestAnalyticsService_GenerateCSVReport(t *testing.T) {
	mockRepo := &MockAnalyticsRepository{}
	svc := service.NewAnalyticsService(mockRepo)

	ctx := context.Background()
	start := time.Now().AddDate(0, 0, -7)
	end := time.Now()

	csvData, err := svc.GenerateCSVReport(ctx, start, end, "", "revenue")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if len(csvData) == 0 {
		t.Errorf("Expected CSV data, got empty")
	}
}
