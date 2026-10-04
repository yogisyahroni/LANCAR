package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"tembus/merchant-service/internal/domain"
)

const dashboardRecentOrderLimit = 5

// GetDashboard composes the merchant home read model from authoritative
// merchant, order, report and finance repositories. It intentionally keeps
// unavailable financial sections nullable instead of converting an upstream
// failure into a misleading zero.
func (s *merchantServiceImpl) GetDashboard(ctx context.Context, userID string) (*domain.MerchantDashboard, error) {
	if s.merchantRepo == nil || s.orderRepo == nil {
		return nil, errors.New("dashboard repository not wired")
	}
	merchant, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if merchant == nil {
		return nil, errors.New("merchant belum terdaftar")
	}

	now := time.Now().UTC()
	dashboard := &domain.MerchantDashboard{
		Merchant:     merchant,
		Orders:       &domain.MerchantOrderCounts{},
		RecentOrders: []*domain.MerchantOrderView{},
		Alerts:       []*domain.MerchantDashboardAlert{},
		Warnings:     []string{},
		DataAsOf:     now,
		Scope: domain.MerchantDashboardScope{
			Level:            "merchant_aggregate",
			MerchantID:       merchant.ID,
			SelectedBranchID: dashboardSelectedBranch(ctx, merchant),
			BranchCount:      1,
			BranchScoped:     false,
			Note:             "Ringkasan order dan keuangan saat ini bersumber pada level bisnis; filter per outlet menunggu kolom branch_id pada order.",
		},
	}

	if s.accessRepo != nil {
		if branches, branchErr := s.accessRepo.ListBranches(ctx, merchant.ID); branchErr != nil {
			dashboard.Warnings = append(dashboard.Warnings, "Daftar outlet belum dapat dimuat; ringkasan tetap ditampilkan pada level bisnis.")
		} else if len(branches) > 0 {
			dashboard.Scope.BranchCount = len(branches)
		}
	}
	operating, operatingErr := s.merchantRepo.GetOperatingHours(ctx, merchant.ID)
	closures, closureErr := s.merchantRepo.ListSpecialClosures(ctx, merchant.ID)
	if operatingErr != nil || closureErr != nil {
		dashboard.Warnings = append(dashboard.Warnings, "Jadwal khusus toko belum dapat dimuat.")
	} else {
		dashboard.Operating = &domain.MerchantOperatingHoursResponse{Hours: operating, Closures: closures}
	}

	branchScoped := false
	selectedBranchID := dashboard.Scope.SelectedBranchID
	if selectedBranchID != "" {
		if access := domain.MerchantAccessFromContext(ctx); access.BranchID != "" && s.accessRepo != nil {
			if branch, branchErr := s.accessRepo.GetBranch(ctx, merchant.ID, selectedBranchID); branchErr != nil || branch == nil || !branch.IsActive {
				return nil, fmt.Errorf("outlet tidak tersedia untuk merchant ini")
			}
		}
		if scopedRepo, ok := s.orderRepo.(domain.MerchantBranchScopedOrderRepository); ok {
			if dashboard.Orders, err = scopedRepo.CountOperationalByMerchantBranch(ctx, merchant.ID, selectedBranchID); err != nil {
				return nil, fmt.Errorf("load dashboard outlet order counts: %w", err)
			}
			if dashboard.RecentOrders, err = scopedRepo.ListByMerchantBranch(ctx, merchant.ID, selectedBranchID, "", dashboardRecentOrderLimit, 0); err != nil {
				dashboard.Warnings = append(dashboard.Warnings, "Pesanan outlet terbaru belum dapat dimuat.")
				dashboard.RecentOrders = []*domain.MerchantOrderView{}
			}
			dashboard.Scope.Level = "branch"
			dashboard.Scope.BranchScoped = true
			dashboard.Scope.Note = "Ringkasan ini hanya mencakup outlet yang sedang dipilih."
			branchScoped = true
		}
	}
	if !branchScoped {
		if dashboard.Orders, err = s.orderRepo.CountOperationalByMerchant(ctx, merchant.ID); err != nil {
			return nil, fmt.Errorf("load dashboard order counts: %w", err)
		}
		if dashboard.RecentOrders, err = s.orderRepo.ListByMerchant(ctx, merchant.ID, "", dashboardRecentOrderLimit, 0); err != nil {
			dashboard.Warnings = append(dashboard.Warnings, "Pesanan terbaru belum dapat dimuat.")
			dashboard.RecentOrders = []*domain.MerchantOrderView{}
		}
	}

	dashboard.AutoAccept = s.dashboardAutoAcceptReadiness(ctx, merchant, userID, dashboard)

	if branchScoped {
		dashboard.Warnings = append(dashboard.Warnings, "Ringkasan penjualan dan pencairan masih tersedia pada level bisnis.")
	} else if s.dashboardCanViewReports(ctx, userID, merchant) {
		if s.reportRepo == nil {
			dashboard.Warnings = append(dashboard.Warnings, "Ringkasan penjualan belum tersedia.")
		} else if sales, salesErr := s.reportRepo.SalesReport(ctx, merchant.ID, "daily"); salesErr != nil {
			dashboard.Warnings = append(dashboard.Warnings, "Ringkasan penjualan belum dapat dimuat.")
		} else {
			dashboard.Sales = sales
		}

		if financeRepo, ok := s.reportRepo.(domain.MerchantFinanceRepository); ok {
			if finance, financeErr := financeRepo.FinanceStatement(ctx, merchant.ID, 20); financeErr != nil {
				dashboard.Warnings = append(dashboard.Warnings, "Ringkasan pencairan belum dapat dimuat.")
			} else {
				dashboard.Finance = finance
			}
		}
	}
	s.appendDashboardAlerts(ctx, dashboard, merchant)

	return dashboard, nil
}

func dashboardSelectedBranch(ctx context.Context, merchant *domain.Merchant) string {
	if access := domain.MerchantAccessFromContext(ctx); access.BranchID != "" {
		return access.BranchID
	}
	return merchant.BranchID
}

func (s *merchantServiceImpl) dashboardCanViewReports(ctx context.Context, userID string, merchant *domain.Merchant) bool {
	if merchant.UserID == userID {
		return true
	}
	if s.accessRepo == nil {
		return false
	}
	access := domain.MerchantAccessFromContext(ctx)
	if access.SessionToken == "" || access.BranchID == "" || access.DeviceID == "" {
		return false
	}
	access.RequiredPermission = domain.PermViewReports
	_, err := s.accessRepo.AuthorizeDeviceSession(ctx, domain.MerchantSessionAuthorization{
		UserID: userID, MerchantID: merchant.ID, BranchID: access.BranchID,
		DeviceID: access.DeviceID, SessionToken: access.SessionToken,
		RequiredPermission: domain.PermViewReports,
	})
	return err == nil
}

func (s *merchantServiceImpl) dashboardAutoAcceptReadiness(ctx context.Context, merchant *domain.Merchant, userID string, dashboard *domain.MerchantDashboard) domain.MerchantAutoAcceptReadiness {
	readiness := domain.MerchantAutoAcceptReadiness{CheckedAt: dashboard.DataAsOf}
	readiness.OutletReady = merchantOnboardingActive(merchant) && merchant.IsOpen && merchant.OperatingState != domain.OperatingStatePaused && merchant.OperatingState != domain.OperatingStateTempClosed && merchant.OperatingState != domain.OperatingStateHoliday && (merchant.PausedUntil == nil || !merchant.PausedUntil.After(dashboard.DataAsOf))

	provider, ok := s.merchantRepo.(domain.MerchantAutoAcceptReadinessRepository)
	if !ok {
		readiness.BlockingReasons = append(readiness.BlockingReasons, "Kesiapan menu dan notifikasi belum dapat diverifikasi server.")
		dashboard.Warnings = append(dashboard.Warnings, "Kontrol terima otomatis belum dapat diaktifkan sampai pemeriksaan server tersedia.")
	} else if stored, err := provider.GetAutoAcceptReadiness(ctx, merchant.ID, userID); err != nil {
		readiness.BlockingReasons = append(readiness.BlockingReasons, "Pemeriksaan kesiapan menu dan notifikasi gagal.")
		dashboard.Warnings = append(dashboard.Warnings, "Pemeriksaan terima otomatis belum selesai.")
	} else {
		readiness.MenuReady = stored.MenuReady
		readiness.NotificationsReady = stored.NotificationsReady
		readiness.CheckedAt = stored.CheckedAt
		readiness.BlockingReasons = append(readiness.BlockingReasons, stored.BlockingReasons...)
	}
	readiness.BlockingReasons = uniqueDashboardStrings(append(readiness.BlockingReasons, autoAcceptBlockingReasons(readiness)...))
	readiness.Ready = readiness.OutletReady && readiness.MenuReady && readiness.NotificationsReady
	return readiness
}

func autoAcceptBlockingReasons(readiness domain.MerchantAutoAcceptReadiness) []string {
	reasons := make([]string, 0, 3)
	if !readiness.OutletReady {
		reasons = append(reasons, "Toko harus aktif dan tidak sedang dijeda.")
	}
	if !readiness.MenuReady {
		reasons = append(reasons, "Minimal satu menu aktif dan tersedia wajib ada.")
	}
	if !readiness.NotificationsReady {
		reasons = append(reasons, "Notifikasi pesanan merchant harus aktif pada perangkat terdaftar.")
	}
	return reasons
}

func (s *merchantServiceImpl) appendDashboardAlerts(ctx context.Context, dashboard *domain.MerchantDashboard, merchant *domain.Merchant) {
	if s.menuRepo != nil {
		if items, err := s.menuRepo.ListByMerchant(ctx, merchant.ID, 500, 0); err != nil {
			dashboard.Warnings = append(dashboard.Warnings, "Status ketersediaan menu belum dapat dimuat.")
		} else {
			soldOut := 0
			for _, item := range items {
				if item != nil && (item.Status == domain.MenuItemStatusSoldOut || !item.IsAvailable) {
					soldOut++
				}
			}
			if soldOut > 0 {
				dashboard.Alerts = append(dashboard.Alerts, &domain.MerchantDashboardAlert{
					Code: "menu_sold_out", Severity: "warning", Title: "Ada menu yang sedang habis",
					Description: fmt.Sprintf("%d menu tidak tersedia untuk dipesan. Perbarui ketersediaan sebelum jam ramai.", soldOut), ActionPath: "/menu",
				})
			}
		}
	}

	if s.integrationRepo != nil {
		if integration, err := s.integrationRepo.GetPOSStatusByOwnerUser(ctx, merchant.UserID); err != nil {
			dashboard.Warnings = append(dashboard.Warnings, "Status perangkat kasir belum dapat dimuat.")
		} else {
			for _, connector := range integration.Connectors {
				if !connector.Enabled || connector.State == "connected" || connector.State == "healthy" {
					continue
				}
				code, title := "pos_disconnected", "Perangkat kasir perlu diperiksa"
				if connector.State == "degraded" || connector.State == "unhealthy" {
					code, title = "provider_incident", "Penyedia integrasi sedang bermasalah"
				}
				dashboard.Alerts = append(dashboard.Alerts, &domain.MerchantDashboardAlert{
					Code: code, Severity: "warning", Title: title,
					Description: fmt.Sprintf("%s tidak terhubung (%s). Pesanan tetap diproses oleh TEMBUS sampai integrasi pulih.", connector.ProviderName, connector.State), ActionPath: "/integrasi",
				})
			}
		}
	}

	if qualityRepo, ok := s.reportRepo.(domain.MerchantQualityReadRepository); ok {
		quality, qualityErr := qualityRepo.LatestQualityScore(ctx, merchant.ID)
		if qualityErr != nil {
			dashboard.Warnings = append(dashboard.Warnings, "Indikator kualitas toko belum dapat dimuat.")
		} else if quality != nil && quality.Score < 70 {
			dashboard.Alerts = append(dashboard.Alerts, &domain.MerchantDashboardAlert{
				Code: "quality_degraded", Severity: "warning", Title: "Kualitas operasional perlu diperiksa",
				Description: fmt.Sprintf("Skor kualitas terbaru %.2f dari 100. Buka laporan kualitas untuk melihat penyebab dan langkah perbaikan.", quality.Score), ActionPath: "/laporan",
			})
		}
	}

	if merchant.HalalExpiryDate != nil || merchant.SppIrtExpiryDate != nil || merchant.BpomExpiryDate != nil {
		if merchantFoodDocumentExpired(merchant) {
			dashboard.Alerts = append(dashboard.Alerts, &domain.MerchantDashboardAlert{
				Code: "food_document_expired", Severity: "warning", Title: "Dokumen usaha perlu diperbarui",
				Description: "Salah satu dokumen usaha sudah kedaluwarsa. Perbarui dokumen untuk menjaga kelayakan operasional.", ActionPath: "/pengaturan",
			})
		}
	}

	if !merchant.BankAccountVerified {
		dashboard.Alerts = append(dashboard.Alerts, &domain.MerchantDashboardAlert{
			Code: "bank_unverified", Severity: "warning", Title: "Rekening belum terverifikasi",
			Description: "Pencairan dapat tertahan sampai rekening usaha diverifikasi.", ActionPath: "/profil/rekening",
		})
	}
	if dashboard.Finance != nil {
		held := 0
		for _, entry := range dashboard.Finance.Entries {
			if entry != nil && (strings.EqualFold(entry.Status, "holding") || strings.EqualFold(entry.Status, "processing")) {
				held++
			}
		}
		if held > 0 {
			dashboard.Alerts = append(dashboard.Alerts, &domain.MerchantDashboardAlert{
				Code: "payout_held", Severity: "warning", Title: "Ada pencairan yang masih ditahan",
				Description: fmt.Sprintf("%d transaksi payout masih menunggu proses settlement. Periksa halaman keuangan untuk detailnya.", held), ActionPath: "/keuangan",
			})
		}
		if len(dashboard.Finance.Discrepancies) > 0 {
			dashboard.Alerts = append(dashboard.Alerts, &domain.MerchantDashboardAlert{
				Code: "finance_reconciliation", Severity: "warning", Title: "Ada transaksi yang perlu direkonsiliasi",
				Description: fmt.Sprintf("%d perbedaan pencatatan menunggu pemeriksaan.", len(dashboard.Finance.Discrepancies)), ActionPath: "/keuangan",
			})
		}
	}
	if !dashboard.AutoAccept.Ready {
		dashboard.Alerts = append(dashboard.Alerts, &domain.MerchantDashboardAlert{
			Code: "auto_accept_not_ready", Severity: "info", Title: "Terima otomatis belum siap",
			Description: strings.Join(dashboard.AutoAccept.BlockingReasons, " "), ActionPath: "/",
		})
	}
	if len(dashboard.Warnings) > 0 {
		dashboard.Alerts = append(dashboard.Alerts, &domain.MerchantDashboardAlert{
			Code: "dashboard_data_warning", Severity: "warning", Title: "Sebagian data belum tersedia",
			Description: "Beberapa ringkasan perlu dimuat ulang karena sumber data belum merespons.",
		})
	}
}

func merchantFoodDocumentExpired(merchant *domain.Merchant) bool {
	today := time.Now().UTC().Format("2006-01-02")
	for _, expiry := range []*string{merchant.HalalExpiryDate, merchant.SppIrtExpiryDate, merchant.BpomExpiryDate} {
		if expiry != nil && strings.TrimSpace(*expiry) != "" && strings.TrimSpace(*expiry) < today {
			return true
		}
	}
	return false
}

func uniqueDashboardStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}
