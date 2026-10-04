package service

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"tembus/merchant-service/internal/domain"
)

type dashboardMerchantRepository struct {
	domain.MerchantRepository
	merchant  *domain.Merchant
	readiness *domain.MerchantAutoAcceptReadiness
}

func (r *dashboardMerchantRepository) GetByUserID(context.Context, string) (*domain.Merchant, error) {
	return r.merchant, nil
}

func (r *dashboardMerchantRepository) GetOperatingHours(context.Context, string) ([]domain.MerchantOperatingHour, error) {
	return nil, nil
}

func (r *dashboardMerchantRepository) ListSpecialClosures(context.Context, string) ([]domain.MerchantSpecialClosure, error) {
	return nil, nil
}

func (r *dashboardMerchantRepository) GetAutoAcceptReadiness(context.Context, string, string) (*domain.MerchantAutoAcceptReadiness, error) {
	return r.readiness, nil
}

type dashboardOrderRepository struct {
	domain.MerchantOrderRepository
	aggregateCounts *domain.MerchantOrderCounts
	branchCounts    *domain.MerchantOrderCounts
	aggregateOrders []*domain.MerchantOrderView
	branchOrders    []*domain.MerchantOrderView
}

func (r *dashboardOrderRepository) CountOperationalByMerchant(context.Context, string) (*domain.MerchantOrderCounts, error) {
	return r.aggregateCounts, nil
}

func (r *dashboardOrderRepository) ListByMerchant(context.Context, string, string, int, int) ([]*domain.MerchantOrderView, error) {
	return r.aggregateOrders, nil
}

func (r *dashboardOrderRepository) CountOperationalByMerchantBranch(context.Context, string, string) (*domain.MerchantOrderCounts, error) {
	return r.branchCounts, nil
}

func (r *dashboardOrderRepository) ListByMerchantBranch(context.Context, string, string, string, int, int) ([]*domain.MerchantOrderView, error) {
	return r.branchOrders, nil
}

type dashboardReportRepository struct {
	domain.MerchantReportRepository
	sales         *domain.SalesReportSummary
	finance       *domain.MerchantFinanceStatement
	branchSales   *domain.SalesReportSummary
	branchFinance *domain.MerchantFinanceStatement
}

func (r *dashboardReportRepository) SalesReport(context.Context, string, string) (*domain.SalesReportSummary, error) {
	return r.sales, nil
}

func (r *dashboardReportRepository) FinanceStatement(context.Context, string, int) (*domain.MerchantFinanceStatement, error) {
	return r.finance, nil
}

func (r *dashboardReportRepository) SalesReportByBranch(context.Context, string, string, string) (*domain.SalesReportSummary, error) {
	if r.branchSales == nil {
		return nil, errors.New("branch sales capability not configured")
	}
	return r.branchSales, nil
}

func (r *dashboardReportRepository) FinanceStatementByBranch(context.Context, string, string, int) (*domain.MerchantFinanceStatement, error) {
	if r.branchFinance == nil {
		return nil, errors.New("branch finance capability not configured")
	}
	return r.branchFinance, nil
}

func dashboardTestMerchant(branchID string, isOpen bool) *domain.Merchant {
	return &domain.Merchant{
		ID:                  "merchant-dashboard-1",
		UserID:              "owner-dashboard-1",
		BranchID:            branchID,
		OnboardingStatus:    "ACTIVE",
		VerificationStatus:  "approved",
		IsOpen:              isOpen,
		OperatingState:      domain.OperatingStateOpen,
		BankAccountVerified: true,
		MarketCode:          "ID-JK",
		OperatingTimezone:   "Asia/Jakarta",
	}
}

func dashboardTestReadiness(ready bool) *domain.MerchantAutoAcceptReadiness {
	return &domain.MerchantAutoAcceptReadiness{
		MenuReady:          ready,
		NotificationsReady: ready,
		CheckedAt:          time.Date(2026, time.October, 4, 12, 0, 0, 0, time.UTC),
	}
}

func TestGetDashboard_UsesAuthoritativeAggregateAndFinance(t *testing.T) {
	merchant := dashboardTestMerchant("", true)
	finance := &domain.MerchantFinanceStatement{HeldPayoutCount: 3, HeldPayoutMinor: 150000}
	orderCounts := &domain.MerchantOrderCounts{New: 2, NeedsAction: 1, Completed: 7}
	report := &dashboardReportRepository{
		sales:   &domain.SalesReportSummary{Period: "daily", TotalOrders: 7, GMVIDR: 700000},
		finance: finance,
	}
	orders := &dashboardOrderRepository{aggregateCounts: orderCounts}
	merchants := &dashboardMerchantRepository{merchant: merchant, readiness: dashboardTestReadiness(true)}

	dashboard, err := NewMerchantService(merchants, nil, orders, report).GetDashboard(context.Background(), merchant.UserID)
	if err != nil {
		t.Fatalf("GetDashboard() error = %v", err)
	}
	if dashboard.DataAsOf.IsZero() {
		t.Fatal("dashboard must expose a server observation timestamp")
	}
	if dashboard.Orders != orderCounts {
		t.Fatalf("dashboard orders = %#v, want authoritative repository projection %#v", dashboard.Orders, orderCounts)
	}
	if dashboard.Sales != report.sales || dashboard.Finance != finance {
		t.Fatal("dashboard must preserve the authoritative sales and finance read models")
	}
	if !dashboard.AutoAccept.Ready {
		t.Fatalf("auto-accept should be ready when outlet, menu, and notifications are ready: %#v", dashboard.AutoAccept)
	}
	if alertByCode(dashboard.Alerts, "payout_held") == nil {
		t.Fatalf("expected payout-held alert from finance aggregate, alerts = %#v", dashboard.Alerts)
	}
}

func TestGetDashboard_BranchScopeDoesNotPretendBusinessFinanceIsOutletScoped(t *testing.T) {
	merchant := dashboardTestMerchant("branch-dashboard-1", true)
	branchCounts := &domain.MerchantOrderCounts{New: 4, Preparing: 2}
	orders := &dashboardOrderRepository{
		aggregateCounts: &domain.MerchantOrderCounts{New: 99},
		branchCounts:    branchCounts,
		branchOrders:    []*domain.MerchantOrderView{{ID: "branch-order-1"}},
	}
	merchants := &dashboardMerchantRepository{merchant: merchant, readiness: dashboardTestReadiness(true)}
	report := &dashboardReportRepository{
		sales:   &domain.SalesReportSummary{Period: "daily", TotalOrders: 99},
		finance: &domain.MerchantFinanceStatement{HeldPayoutCount: 99},
	}

	dashboard, err := NewMerchantService(merchants, nil, orders, report).GetDashboard(context.Background(), merchant.UserID)
	if err != nil {
		t.Fatalf("GetDashboard() error = %v", err)
	}
	if dashboard.Scope.Level != "branch" || !dashboard.Scope.BranchScoped || dashboard.Scope.SelectedBranchID != merchant.BranchID {
		t.Fatalf("unexpected branch scope: %#v", dashboard.Scope)
	}
	if dashboard.Orders != branchCounts {
		t.Fatalf("dashboard orders = %#v, want branch projection %#v", dashboard.Orders, branchCounts)
	}
	if len(dashboard.RecentOrders) != 1 || dashboard.RecentOrders[0].ID != "branch-order-1" {
		t.Fatalf("dashboard recent orders = %#v, want branch order projection", dashboard.RecentOrders)
	}
	if dashboard.Sales != nil || dashboard.Finance != nil {
		t.Fatalf("business-level finance must not be presented as outlet-scoped: sales=%#v finance=%#v", dashboard.Sales, dashboard.Finance)
	}
	if !containsDashboardWarning(dashboard.Warnings, "outlet") {
		t.Fatalf("expected explicit outlet scope warning, warnings = %#v", dashboard.Warnings)
	}
}

func TestGetDashboard_BranchScopeUsesAuthoritativeBranchSalesAndFinance(t *testing.T) {
	merchant := dashboardTestMerchant("branch-dashboard-2", true)
	branchSales := &domain.SalesReportSummary{Period: "daily", TotalOrders: 3, GMVIDR: 240000}
	branchFinance := &domain.MerchantFinanceStatement{
		ScopeLevel: "branch",
		BranchID:   merchant.BranchID,
		ScopeNote:  "order-linked only",
	}
	report := &dashboardReportRepository{branchSales: branchSales, branchFinance: branchFinance}
	orders := &dashboardOrderRepository{
		aggregateCounts: &domain.MerchantOrderCounts{New: 80},
		branchCounts:    &domain.MerchantOrderCounts{New: 3},
	}
	merchants := &dashboardMerchantRepository{merchant: merchant, readiness: dashboardTestReadiness(true)}

	dashboard, err := NewMerchantService(merchants, nil, orders, report).GetDashboard(context.Background(), merchant.UserID)
	if err != nil {
		t.Fatalf("GetDashboard() error = %v", err)
	}
	if dashboard.Sales != branchSales || dashboard.Finance != branchFinance {
		t.Fatalf("dashboard must use outlet-scoped authoritative reports: sales=%#v finance=%#v", dashboard.Sales, dashboard.Finance)
	}
	if dashboard.Finance.ScopeLevel != "branch" || dashboard.Finance.BranchID != merchant.BranchID {
		t.Fatalf("finance scope metadata = %#v", dashboard.Finance)
	}
	if containsDashboardWarning(dashboard.Warnings, "Ringkasan penjualan outlet") || containsDashboardWarning(dashboard.Warnings, "Ringkasan keuangan outlet") {
		t.Fatalf("unexpected missing branch report warning: %#v", dashboard.Warnings)
	}
}

func TestGetDashboard_AutoAcceptFailsClosedWhenOutletIsNotOpen(t *testing.T) {
	merchant := dashboardTestMerchant("", false)
	orders := &dashboardOrderRepository{aggregateCounts: &domain.MerchantOrderCounts{}}
	merchants := &dashboardMerchantRepository{merchant: merchant, readiness: dashboardTestReadiness(true)}

	dashboard, err := NewMerchantService(merchants, nil, orders, nil).GetDashboard(context.Background(), merchant.UserID)
	if err != nil {
		t.Fatalf("GetDashboard() error = %v", err)
	}
	if dashboard.AutoAccept.Ready {
		t.Fatal("auto-accept must fail closed while the outlet is closed")
	}
	if !containsDashboardReason(dashboard.AutoAccept.BlockingReasons, "Toko harus aktif") {
		t.Fatalf("expected closed-outlet blocking reason, reasons = %#v", dashboard.AutoAccept.BlockingReasons)
	}
	if alertByCode(dashboard.Alerts, "auto_accept_not_ready") == nil {
		t.Fatalf("expected auto-accept readiness alert, alerts = %#v", dashboard.Alerts)
	}
}

func alertByCode(alerts []*domain.MerchantDashboardAlert, code string) *domain.MerchantDashboardAlert {
	for _, alert := range alerts {
		if alert != nil && alert.Code == code {
			return alert
		}
	}
	return nil
}

func containsDashboardWarning(warnings []string, expected string) bool {
	for _, warning := range warnings {
		if strings.Contains(warning, expected) {
			return true
		}
	}
	return false
}

func containsDashboardReason(reasons []string, expected string) bool {
	for _, reason := range reasons {
		if strings.Contains(reason, expected) {
			return true
		}
	}
	return false
}
