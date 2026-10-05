package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"tembus/merchant-service/internal/featureflags"
	"tembus/merchant-service/internal/handler"
	_ "tembus/merchant-service/internal/handler/docs"
	"tembus/merchant-service/internal/infrastructure"
	"tembus/merchant-service/internal/middleware"
	"tembus/merchant-service/internal/repository"
	"tembus/merchant-service/internal/service"
	"tembus/merchant-service/internal/worker"
	"tembus/merchant-service/pkg/logger"
	"tembus/merchant-service/pkg/sentry"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	httpSwagger "github.com/swaggo/http-swagger"
)

// @title TEMBUS Merchant Service API
// @version 1.0
// @description API untuk merchant food delivery: pendaftaran, profil, menu, dan accept/reject order.
// @host localhost:8085
// @BasePath /api/v1
// @securityDefinitions.apikey Bearer
// @in header
// @name Authorization

func isProductionRuntime() bool {
	return strings.EqualFold(os.Getenv("ENVIRONMENT"), "production") ||
		strings.EqualFold(os.Getenv("NODE_ENV"), "production")
}

func validateProductionSecrets() {
	if !isProductionRuntime() {
		return
	}
	url := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if url == "" {
		log.Fatal("DATABASE_URL is required in production")
	}
	if strings.Contains(url, "localhost") || strings.Contains(url, "127.0.0.1") {
		log.Fatal("DATABASE_URL must not point to localhost in production")
	}
}

func main() {
	_ = godotenv.Load("../../.env")
	validateProductionSecrets()

	logger.Info("Starting merchant-service", "environment", os.Getenv("ENVIRONMENT"))
	sentry.Init()
	defer sentry.Flush()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal("Could not connect to database:", err)
	}
	defer db.Close()

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(time.Minute * 5)

	if err := db.Ping(); err != nil {
		log.Fatal("Database is unreachable:", err)
	}
	middleware.LogJSON("info", "database connection established", map[string]interface{}{})
	auditRecorder := middleware.NewSQLMutationAuditRecorder(db)
	withAudit := func(h http.HandlerFunc) http.HandlerFunc {
		return middleware.BaseChainWithAudit(auditRecorder, h)
	}

	// Feature Flag Reader (pola service lain)
	_ = featureflags.NewFlagReader(db)

	// Wire Layers
	// FB-110: upload foto menu (local storage, pola auth-service)
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "/app/public/uploads"
	}
	uploadBaseURL := os.Getenv("UPLOAD_PUBLIC_URL")
	if uploadBaseURL == "" {
		// FB-110: URL publik harus bisa diakses device/web (bukan internal docker).
		// Dev/staging: via gateway localhost:8080 → /merchant-uploads (path unik,
		// bentrok dengan /uploads admin-service di gateway).
		uploadBaseURL = "http://localhost:8080/merchant-uploads"
	}
	uploadSvc, err := service.NewMenuPhotoStorage(uploadDir, uploadBaseURL)
	if err != nil {
		log.Fatal("Could not init menu upload storage:", err)
	}

	merchantRepo := repository.NewPostgresMerchantRepository(db, db)
	menuRepo := repository.NewPostgresMenuItemRepository(db, db)
	orderRepo := repository.NewPostgresMerchantOrderRepository(db, db)
	reportRepo := repository.NewPostgresReportRepository(db, db)
	staffRepo := repository.NewPostgresMerchantStaffRepository(db, db)
	accessRepo := repository.NewPostgresMerchantAccessRepository(db, db)
	auditRepo := repository.NewPostgresMerchantAuditRepository(db)
	integrationRepo := repository.NewPostgresMerchantIntegrationRepository(db)
	svc := service.NewMerchantServiceWithGovernance(merchantRepo, menuRepo, orderRepo, reportRepo, accessRepo, menuRepo, integrationRepo)
	staffSvc := service.NewStaffService(merchantRepo, staffRepo, infrastructure.NewStaffNotifier(), accessRepo)
	accessSvc := service.NewMerchantAccessService(merchantRepo, staffRepo, accessRepo)
	searchRepo := repository.NewPostgresMerchantSearchRepository(db)
	searchSvc := service.NewMerchantSearchService(accessSvc, searchRepo)
	h := handler.NewMerchantHandler(svc, uploadSvc, integrationRepo)
	staffH := handler.NewStaffHandler(h, staffSvc)
	accessH := handler.NewMerchantAccessHandler(h, accessSvc)
	auditH := handler.NewMerchantAuditHandler(h, auditRepo, accessSvc)
	searchH := handler.NewMerchantSearchHandler(h, searchSvc)

	// FB-099: promo merchant self-serve (dibiayai merchant, bukan duit PT)
	promoRepo := repository.NewPostgresMerchantPromoRepository(db, db)
	promoSvc := service.NewMerchantPromoService(promoRepo, menuRepo, merchantRepo, accessRepo)
	promoH := handler.NewPromoHandler(promoSvc)
	// MERCH-2026-007: merchant-funded paid visibility uses the existing
	// promo_campaigns registry with an explicit product boundary.
	adsRepo := repository.NewPostgresMerchantAdsRepository(db, db)
	adsSvc := service.NewMerchantAdsService(adsRepo, merchantRepo, accessRepo)
	adsH := handler.NewMerchantAdsHandler(adsSvc)

	// FB-092: auto-suspend toko saat dokumen pangan kedaluwarsa (re-KYC)
	foodDocsWorker := worker.NewFoodDocsExpiryWorker(merchantRepo)
	foodDocsWorker.Start()

	// FB-095: auto buka/tutup toko sesuai jam operasional (5 menit sekali)
	hoursWorker := worker.NewOperatingHoursWorker(merchantRepo)
	hoursWorker.Start()

	// Router
	mux := http.NewServeMux()

	// Serve foto menu (GET publik, cache immutable)
	mux.Handle("/merchant-uploads/", withAudit(service.StaticUploadHandler(uploadDir)))

	// Pendaftaran & profil (FOOD-BIKE-045/018)
	mux.HandleFunc("/api/v1/merchant/register", withAudit(h.RegisterMerchant))
	// MERCH-2026-002: server-authoritative portal tenant and branch context.
	mux.HandleFunc("/api/v1/merchant/context", withAudit(accessH.GetPortalContext))
	mux.HandleFunc("/api/v1/merchant/dashboard", withAudit(h.GetDashboard))
	mux.HandleFunc("/api/v1/merchant/search", withAudit(searchH.Search))
	mux.HandleFunc("/api/v1/merchant/profile", withAudit(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.GetProfile(w, r)
		case http.MethodPatch:
			h.UpdateProfile(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	// FB-114: update rekening bank untuk payout.
	mux.HandleFunc("/api/v1/merchant/bank-account", withAudit(h.UpdateBankAccount))
	mux.HandleFunc("/api/v1/merchant/toggle-open", withAudit(h.ToggleOpen))
	mux.HandleFunc("/api/v1/merchant/order-settings/auto-accept", withAudit(h.SetAutoAcceptOrders))
	// FB-107: pause sementara + resume — tidak mengubah is_open/jam operasional.
	mux.HandleFunc("/api/v1/merchant/pause", withAudit(h.Pause))
	mux.HandleFunc("/api/v1/merchant/resume", withAudit(h.Resume))
	mux.HandleFunc("/api/v1/merchant/busy", withAudit(h.Busy))
	mux.HandleFunc("/api/v1/merchant/operating-state/{id}/override", withAudit(h.OverrideOperatingState))
	mux.HandleFunc("/api/v1/merchant/food-docs", withAudit(h.UpdateFoodDocs))
	mux.HandleFunc("/api/v1/merchant/operating-hours", withAudit(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.GetOperatingHours(w, r)
		case http.MethodPut:
			h.ReplaceOperatingHours(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/v1/merchant/operating-hours/closures", withAudit(h.CreateSpecialClosure))
	mux.HandleFunc("/api/v1/merchant/operating-hours/closures/{id}", withAudit(h.DeleteSpecialClosure))

	// FB-110: upload foto menu (multipart → URL publik)
	mux.HandleFunc("/api/v1/merchant/menu/upload", withAudit(h.UploadMenuItemPhoto))
	// FB-045: upload dokumen registrasi generic (KTP/foto toko/rekening)
	mux.HandleFunc("/api/v1/merchant/upload", withAudit(h.UploadMerchantDoc))

	// Menu CRUD (FOOD-BIKE-018)
	mux.HandleFunc("/api/v1/merchant/menu-categories", withAudit(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			h.CreateMenuCategory(w, r)
		case http.MethodGet:
			h.ListMenuCategories(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/v1/merchant/menu-categories/{id}", withAudit(h.UpdateMenuCategory))
	mux.HandleFunc("/api/v1/merchant/menu/import", withAudit(h.ImportMenuCSV))
	mux.HandleFunc("/api/v1/merchant/menu/readiness", withAudit(h.GetCatalogReadiness))
	mux.HandleFunc("/api/v1/merchant/menu/publications", withAudit(h.ListCatalogPublications))
	mux.HandleFunc("/api/v1/merchant/menu/publish", withAudit(h.PublishCatalog))
	mux.HandleFunc("/api/v1/merchant/menu/rollback", withAudit(h.RollbackCatalog))
	mux.HandleFunc("/api/v1/merchant/menu/outlet-overrides", withAudit(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.ListMenuItemOutletOverrides(w, r)
		case http.MethodPut:
			h.UpsertMenuItemOutletOverride(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/v1/merchant/menu", withAudit(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			h.CreateMenuItem(w, r)
		case http.MethodGet:
			h.ListMenuItems(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/v1/merchant/menu/{id}", withAudit(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPatch:
			h.UpdateMenuItem(w, r)
		case http.MethodDelete:
			h.DeleteMenuItem(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/v1/merchant/menu/{id}/availability", withAudit(h.SetMenuItemAvailability))
	mux.HandleFunc("/api/v1/merchant/menu/{id}/inventory", withAudit(h.UpdateMenuInventory))

	// FB-108: varian menu — GET lihat, PUT replace atomik (hapus+insert).
	mux.HandleFunc("/api/v1/merchant/menu/{id}/variants", withAudit(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.GetMenuItemVariants(w, r)
		case http.MethodPut:
			h.ReplaceMenuItemVariants(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/v1/merchant/menu/{id}/moderation", withAudit(h.ModerateMenuItem))

	// Promo merchant (FB-099): CRUD self-serve, tanpa approval admin
	mux.HandleFunc("/api/v1/merchant/promos", withAudit(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			promoH.Create(w, r)
		case http.MethodGet:
			promoH.List(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/v1/merchant/promos/{id}", withAudit(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPatch:
			promoH.Update(w, r)
		case http.MethodDelete:
			promoH.Delete(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/v1/merchant/promos/{id}/active", withAudit(promoH.SetActive))

	// Order action (FOOD-BIKE-017/021)
	mux.HandleFunc("/api/v1/merchant/orders", withAudit(h.ListOrders))
	mux.HandleFunc("/api/v1/merchant/orders/counts", withAudit(h.GetOrderCounts))
	mux.HandleFunc("/api/v1/merchant/orders/{id}", withAudit(h.GetOrderDetail))
	mux.HandleFunc("/api/v1/merchant/orders/{id}/accept", withAudit(h.AcceptOrder))
	mux.HandleFunc("/api/v1/merchant/orders/{id}/ready", withAudit(h.MarkReady))
	mux.HandleFunc("/api/v1/merchant/orders/{id}/reject", withAudit(h.RejectOrder))
	mux.HandleFunc("/api/v1/merchant/orders/{id}/cancel", withAudit(h.CancelOrder))
	mux.HandleFunc("/api/v1/merchant/orders/{id}/struk", withAudit(h.GetStruk))
	mux.HandleFunc("/api/v1/merchant/orders/{id}/items/unavailable", withAudit(h.PartialRejectOrder))
	mux.HandleFunc("/api/v1/merchant/orders/{id}/substitution", withAudit(h.ProposeFoodSubstitution))
	mux.HandleFunc("/api/v1/merchant/orders/{id}/items", withAudit(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			h.GetOrderEdit(w, r)
			return
		}
		h.EditOrderItems(w, r)
	}))
	mux.HandleFunc("/api/v1/merchant/integrations/pos", withAudit(h.GetPOSIntegrationStatus))

	// Report penjualan (FB-086)
	mux.HandleFunc("/api/v1/merchant/reports", withAudit(h.GetSalesReport))
	mux.HandleFunc("/api/v1/merchant/reports/export", withAudit(h.ExportSalesReport))
	mux.HandleFunc("/api/v1/merchant/settlements", withAudit(h.GetSettlements))
	mux.HandleFunc("/api/v1/merchant/finance-statement", withAudit(h.GetFinanceStatement))
	mux.HandleFunc("/api/v1/merchant/finance-statement/export", withAudit(h.ExportFinanceStatementCSV))
	mux.HandleFunc("/api/v1/merchant/ads", withAudit(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			adsH.Create(w, r)
		case http.MethodGet:
			adsH.List(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/v1/merchant/ads/performance", withAudit(adsH.Performance))
	mux.HandleFunc("/api/v1/merchant/ads/{id}/active", withAudit(adsH.SetActive))
	// MERCH-2026-006: versioned operational quality score and appeal/review path.
	mux.HandleFunc("/api/v1/merchant/quality-score", withAudit(h.GetQualityScore))
	mux.HandleFunc("/api/v1/merchant/quality-score/appeals", withAudit(h.SubmitQualityAppeal))
	mux.HandleFunc("/api/v1/merchant/quality-score/appeals/{id}/review", withAudit(h.ReviewQualityAppeal))
	// MERCH-2026-008: suspension policy visibility and merchant appeal path.
	mux.HandleFunc("/api/v1/merchant/enforcement", withAudit(h.GetEnforcementStatus))
	mux.HandleFunc("/api/v1/merchant/enforcement/appeals", withAudit(h.SubmitEnforcementAppeal))
	mux.HandleFunc("/api/v1/merchant/reviews", withAudit(h.GetCustomerReviews))
	mux.HandleFunc("/api/v1/merchant/reviews/{id}/reply", withAudit(h.ReplyToCustomerReview))
	mux.HandleFunc("/api/v1/merchant/withdraw", withAudit(h.RequestWithdrawal))
	mux.HandleFunc("/api/v1/merchant/withdrawals", withAudit(h.ListWithdrawals))

	// MERCH-2026-002: branch ownership, scoped staff access and device sessions.
	mux.HandleFunc("/api/v1/merchant/branches/{id}", withAudit(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			accessH.CreateBranch(w, r)
		case http.MethodGet:
			accessH.ListBranches(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/v1/merchant/branches/{id}/{branchId}", withAudit(accessH.UpdateBranch))
	mux.HandleFunc("/api/v1/merchant/branches/{id}/staff/{staffId}", withAudit(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			accessH.AssignStaffBranches(w, r)
		case http.MethodGet:
			accessH.ListStaffBranches(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/v1/merchant/device-sessions/{id}", withAudit(accessH.CreateDeviceSession))
	mux.HandleFunc("/api/v1/merchant/device-sessions/{id}/{sessionId}", withAudit(accessH.RevokeDeviceSession))
	mux.HandleFunc("/api/v1/merchant/security-approvals/{id}", withAudit(accessH.CreateSecurityApproval))
	mux.HandleFunc("/api/v1/merchant/security-approvals/{id}/{approvalId}/approve", withAudit(accessH.ApproveSecurityApproval))
	mux.HandleFunc("/api/v1/merchant/audit-logs", withAudit(auditH.List))

	// ── Staff Management (M1, CORPORATE ONLY) ──
	// NOTE: route di-namespaced ke /merchant/staff/{id} (bukan /merchant/{id}/staff)
	// karena Go 1.22+ ServeMux panic: /merchant/{id}/staff bentrok dg /merchant/menu/{id}
	// (path /merchant/menu/staff ambigu). Handler tetap baca PathValue("id")/"staffId".
	// Owner invite / list: /merchant/staff/{id}
	mux.HandleFunc("/api/v1/merchant/staff/{id}", withAudit(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			staffH.Invite(w, r)
		case http.MethodGet:
			staffH.List(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	// Staff accept invite (token): /merchant/staff/accept
	mux.HandleFunc("/api/v1/merchant/staff/accept", withAudit(staffH.AcceptInvite))
	// Owner update role/status: /merchant/staff/{id}/{staffId}
	mux.HandleFunc("/api/v1/merchant/staff/{id}/{staffId}", withAudit(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPatch:
			staffH.Update(w, r)
		case http.MethodDelete:
			// Delete = revoke (soft, status revoked).
			staffH.Update(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Health Check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})

	// Swagger (non-production)
	if strings.ToLower(os.Getenv("SWAGGER_ENABLED")) != "false" || !isProductionRuntime() {
		mux.Handle("/swagger/", httpSwagger.WrapHandler)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8085"
	}

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	middleware.LogJSON("info", "server starting", map[string]interface{}{"port": port})
	if err := server.ListenAndServe(); err != nil {
		log.Fatal("Server failed to start:", err)
	}
}
