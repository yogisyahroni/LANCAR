package domain

import "time"

// MerchantAutoAcceptReadiness is the server-side gate for immediately
// accepting paid food orders. A client may display the reasons, but it cannot
// bypass this decision.
type MerchantAutoAcceptReadiness struct {
	OutletReady        bool      `json:"outlet_ready"`
	MenuReady          bool      `json:"menu_ready"`
	NotificationsReady bool      `json:"notifications_ready"`
	Ready              bool      `json:"ready"`
	BlockingReasons    []string  `json:"blocking_reasons,omitempty"`
	CheckedAt          time.Time `json:"checked_at"`
}

type MerchantDashboardScope struct {
	Level            string `json:"level"`
	MerchantID       string `json:"merchant_id"`
	SelectedBranchID string `json:"selected_branch_id,omitempty"`
	BranchCount      int    `json:"branch_count"`
	BranchScoped     bool   `json:"branch_scoped"`
	Note             string `json:"note,omitempty"`
}

type MerchantDashboardAlert struct {
	Code        string `json:"code"`
	Severity    string `json:"severity"`
	Title       string `json:"title"`
	Description string `json:"description"`
	ActionPath  string `json:"action_path,omitempty"`
}

// MerchantDashboard is the single read model used by the merchant home
// screen. Every section is sourced from the same merchant-service request and
// carries one server observation timestamp; unavailable values stay nullable.
type MerchantDashboard struct {
	Merchant     *Merchant                   `json:"merchant"`
	Scope        MerchantDashboardScope      `json:"scope"`
	Orders       *MerchantOrderCounts        `json:"orders"`
	RecentOrders []*MerchantOrderView        `json:"recent_orders"`
	Sales        *SalesReportSummary         `json:"sales,omitempty"`
	Finance      *MerchantFinanceStatement   `json:"finance,omitempty"`
	AutoAccept   MerchantAutoAcceptReadiness `json:"auto_accept"`
	Alerts       []*MerchantDashboardAlert   `json:"alerts"`
	Warnings     []string                    `json:"warnings,omitempty"`
	DataAsOf     time.Time                   `json:"data_as_of"`
}
