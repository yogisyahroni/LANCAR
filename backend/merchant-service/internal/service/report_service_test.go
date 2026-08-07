package service

import (
	"context"
	"strings"
	"testing"

	"tembus/merchant-service/internal/domain"
)

// ── mock report repo (embed interface → override method yang dipakai) ──

type mockReportRepo struct {
	domain.MerchantReportRepository
	salesReport    func(ctx context.Context, merchantID, period string) (*domain.SalesReportSummary, error)
	salesReportRows func(ctx context.Context, merchantID, period string) ([]*domain.SalesReportRow, error)
}

func (m *mockReportRepo) SalesReport(ctx context.Context, merchantID, period string) (*domain.SalesReportSummary, error) {
	return m.salesReport(ctx, merchantID, period)
}

func (m *mockReportRepo) SalesReportRows(ctx context.Context, merchantID, period string) ([]*domain.SalesReportRow, error) {
	return m.salesReportRows(ctx, merchantID, period)
}

func newReportTestService(merchant *domain.Merchant, summary *domain.SalesReportSummary, rows []*domain.SalesReportRow, repoErr error) *merchantServiceImpl {
	mr := &mockMerchantRepoForStruk{getByUserID: func(ctx context.Context, userID string) (*domain.Merchant, error) {
		if merchant == nil {
			return nil, nil
		}
		return merchant, nil
	}}
	rr := &mockReportRepo{
		salesReport: func(ctx context.Context, merchantID, period string) (*domain.SalesReportSummary, error) {
			if repoErr != nil {
				return nil, repoErr
			}
			return summary, nil
		},
		salesReportRows: func(ctx context.Context, merchantID, period string) ([]*domain.SalesReportRow, error) {
			if repoErr != nil {
				return nil, repoErr
			}
			return rows, nil
		},
	}
	return &merchantServiceImpl{merchantRepo: mr, reportRepo: rr}
}

func sampleReportSummary() *domain.SalesReportSummary {
	return &domain.SalesReportSummary{
		Period: "daily", TotalOrders: 3, GMVIDR: 150000, AvgOrderValueIDR: 50000,
		TopItems: []domain.TopSellingItem{
			{ItemName: "Nasi Goreng", Quantity: 5, RevenueIDR: 75000},
		},
	}
}

func sampleReportRows() []*domain.SalesReportRow {
	return []*domain.SalesReportRow{
		{OrderNumber: "TMBSABC123", CreatedAt: "2026-08-07T10:00:00Z", Status: "delivered",
			ItemName: "Nasi Goreng", Quantity: 2, ItemPrice: 15000, Subtotal: 30000, OrderTotalIDR: 40000},
	}
}

// ── tests ──

func TestGetSalesReport_PeriodInvalid(t *testing.T) {
	svc := newReportTestService(approvedMerchant(), sampleReportSummary(), nil, nil)
	_, err := svc.GetSalesReport(context.Background(), "user-1", "monthly")
	if err == nil || !strings.Contains(err.Error(), "daily atau weekly") {
		t.Fatalf("expected invalid period error, got: %v", err)
	}
}

func TestGetSalesReport_MerchantBelumTerdaftar(t *testing.T) {
	svc := newReportTestService(nil, sampleReportSummary(), nil, nil)
	_, err := svc.GetSalesReport(context.Background(), "user-1", "daily")
	if err == nil || !strings.Contains(err.Error(), "belum terdaftar") {
		t.Fatalf("expected 'belum terdaftar' error, got: %v", err)
	}
}

func TestGetSalesReport_MerchantPending(t *testing.T) {
	m := approvedMerchant()
	m.VerificationStatus = "pending"
	svc := newReportTestService(m, sampleReportSummary(), nil, nil)
	_, err := svc.GetSalesReport(context.Background(), "user-1", "daily")
	if err == nil || !strings.Contains(err.Error(), "belum disetujui") {
		t.Fatalf("expected 'belum disetujui' error, got: %v", err)
	}
}

func TestGetSalesReport_Sukses(t *testing.T) {
	svc := newReportTestService(approvedMerchant(), sampleReportSummary(), nil, nil)
	s, err := svc.GetSalesReport(context.Background(), "user-1", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.Period != "daily" {
		t.Fatalf("default period harus daily, got %s", s.Period)
	}
	if s.TotalOrders != 3 || s.GMVIDR != 150000 || s.AvgOrderValueIDR != 50000 {
		t.Fatalf("summary tidak sesuai: %+v", s)
	}
	if len(s.TopItems) != 1 || s.TopItems[0].ItemName != "Nasi Goreng" {
		t.Fatalf("top items tidak sesuai: %+v", s.TopItems)
	}
}

func TestExportSalesReportCSV_Format(t *testing.T) {
	svc := newReportTestService(approvedMerchant(), nil, sampleReportRows(), nil)
	csv, err := svc.ExportSalesReportCSV(context.Background(), "user-1", "weekly")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(csv), "\n")
	if len(lines) != 2 {
		t.Fatalf("expected header + 1 row, got %d lines", len(lines))
	}
	if !strings.HasPrefix(lines[0], "order_number,created_at") {
		t.Fatalf("header CSV salah: %q", lines[0])
	}
	if !strings.Contains(lines[1], "TMBSABC123") || !strings.Contains(lines[1], "40000") {
		t.Fatalf("row CSV salah: %q", lines[1])
	}
}

func TestExportSalesReportCSV_PeriodInvalid(t *testing.T) {
	svc := newReportTestService(approvedMerchant(), nil, sampleReportRows(), nil)
	_, err := svc.ExportSalesReportCSV(context.Background(), "user-1", "yearly")
	if err == nil || !strings.Contains(err.Error(), "daily atau weekly") {
		t.Fatalf("expected invalid period error, got: %v", err)
	}
}
