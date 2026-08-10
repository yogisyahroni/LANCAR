package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"tembus/merchant-service/internal/domain"
)

// ── mock report repo (embed interface → override method yang dipakai) ──

type mockReportRepo struct {
	domain.MerchantReportRepository
	salesReport    func(ctx context.Context, merchantID, period string) (*domain.SalesReportSummary, error)
	salesReportRows func(ctx context.Context, merchantID, period string) ([]*domain.SalesReportRow, error)
	settlements    func(ctx context.Context, merchantID string, limit int) ([]*domain.SettlementRecord, error)
}

func (m *mockReportRepo) SalesReport(ctx context.Context, merchantID, period string) (*domain.SalesReportSummary, error) {
	return m.salesReport(ctx, merchantID, period)
}

func (m *mockReportRepo) SalesReportRows(ctx context.Context, merchantID, period string) ([]*domain.SalesReportRow, error) {
	return m.salesReportRows(ctx, merchantID, period)
}

func (m *mockReportRepo) Settlements(ctx context.Context, merchantID string, limit int) ([]*domain.SettlementRecord, error) {
	return m.settlements(ctx, merchantID, limit)
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

// ── FB-113: ListSettlements ──

func newSettlementTestService(merchant *domain.Merchant, records []*domain.SettlementRecord, repoErr error) *merchantServiceImpl {
	mr := &mockMerchantRepoForStruk{getByUserID: func(ctx context.Context, userID string) (*domain.Merchant, error) {
		if merchant == nil {
			return nil, nil
		}
		return merchant, nil
	}}
	rr := &mockReportRepo{
		salesReport: func(ctx context.Context, merchantID, period string) (*domain.SalesReportSummary, error) {
			return nil, nil
		},
		salesReportRows: func(ctx context.Context, merchantID, period string) ([]*domain.SalesReportRow, error) {
			return nil, nil
		},
		settlements: func(ctx context.Context, merchantID string, limit int) ([]*domain.SettlementRecord, error) {
			if repoErr != nil {
				return nil, repoErr
			}
			return records, nil
		},
	}
	return &merchantServiceImpl{merchantRepo: mr, reportRepo: rr}
}

func sampleSettlementRecords() []*domain.SettlementRecord {
	settled := "2026-08-08T10:00:00Z"
	holding := "2026-08-08T11:00:00Z"
	ref := "TRX-REF-001"
	return []*domain.SettlementRecord{
		{ID: "s1", OrderID: "o1", PaymentLinkID: "PL-1", GrossItemPriceIDR: 150000,
			MerchantFeeIDR: 5000, NetPayoutIDR: 145000, Status: "COMPLETED",
			SettledAt: &settled, DisbursementRef: &ref, CreatedAt: "2026-08-07T10:00:00Z"},
		{ID: "s2", OrderID: "o2", PaymentLinkID: "PL-2", GrossItemPriceIDR: 90000,
			MerchantFeeIDR: 3000, NetPayoutIDR: 87000, Status: "HOLDING",
			HoldingReleaseAt: &holding, CreatedAt: "2026-08-08T11:00:00Z"},
	}
}

func TestListSettlements_MerchantBelumTerdaftar(t *testing.T) {
	svc := newSettlementTestService(nil, nil, nil)
	_, err := svc.ListSettlements(context.Background(), "user-1")
	if err == nil || !strings.Contains(err.Error(), "belum terdaftar") {
		t.Fatalf("expected 'belum terdaftar' error, got: %v", err)
	}
}

func TestListSettlements_MerchantPending(t *testing.T) {
	m := approvedMerchant()
	m.VerificationStatus = "pending"
	svc := newSettlementTestService(m, nil, nil)
	_, err := svc.ListSettlements(context.Background(), "user-1")
	if err == nil || !strings.Contains(err.Error(), "belum disetujui") {
		t.Fatalf("expected 'belum disetujui' error, got: %v", err)
	}
}

func TestListSettlements_SuksesTotalCairDanDitahan(t *testing.T) {
	svc := newSettlementTestService(approvedMerchant(), sampleSettlementRecords(), nil)
	s, err := svc.ListSettlements(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(s.Records) != 2 {
		t.Fatalf("expected 2 records, got %d", len(s.Records))
	}
	if s.TotalIDR != 145000 {
		t.Fatalf("total cair harus 145000, got %d", s.TotalIDR)
	}
	if s.HoldingIDR != 87000 {
		t.Fatalf("total ditahan harus 87000, got %d", s.HoldingIDR)
	}
	if s.Records[0].Status != "COMPLETED" || s.Records[0].DisbursementRef == nil {
		t.Fatalf("record pertama tidak sesuai: %+v", s.Records[0])
	}
}

func TestListSettlements_RepoError(t *testing.T) {
	svc := newSettlementTestService(approvedMerchant(), nil, errors.New("db down"))
	_, err := svc.ListSettlements(context.Background(), "user-1")
	if err == nil || !strings.Contains(err.Error(), "db down") {
		t.Fatalf("expected repo error, got: %v", err)
	}
}
