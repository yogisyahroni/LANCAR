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
		uploadBaseURL = "http://merchant-service:8085/uploads"
	}
	uploadSvc, err := service.NewMenuPhotoStorage(uploadDir, uploadBaseURL)
	if err != nil {
		log.Fatal("Could not init menu upload storage:", err)
	}

	merchantRepo := repository.NewPostgresMerchantRepository(db, db)
	menuRepo := repository.NewPostgresMenuItemRepository(db, db)
	orderRepo := repository.NewPostgresMerchantOrderRepository(db, db)
	reportRepo := repository.NewPostgresReportRepository(db, db)
	svc := service.NewMerchantService(merchantRepo, menuRepo, orderRepo, reportRepo)
	h := handler.NewMerchantHandler(svc, uploadSvc)

	// FB-099: promo merchant self-serve (dibiayai merchant, bukan duit PT)
	promoRepo := repository.NewPostgresMerchantPromoRepository(db, db)
	promoSvc := service.NewMerchantPromoService(promoRepo, menuRepo)
	promoH := handler.NewPromoHandler(promoSvc)

	// FB-092: auto-suspend toko saat dokumen pangan kedaluwarsa (re-KYC)
	foodDocsWorker := worker.NewFoodDocsExpiryWorker(merchantRepo)
	foodDocsWorker.Start()

	// FB-095: auto buka/tutup toko sesuai jam operasional (5 menit sekali)
	hoursWorker := worker.NewOperatingHoursWorker(merchantRepo)
	hoursWorker.Start()

	// Router
	mux := http.NewServeMux()

	// Serve foto menu (GET publik, cache immutable)
	mux.Handle("/uploads/", middleware.BaseChain(service.StaticUploadHandler(uploadDir)))

	// Pendaftaran & profil (FOOD-BIKE-045/018)
	mux.HandleFunc("/api/v1/merchant/register", middleware.BaseChain(h.RegisterMerchant))
	mux.HandleFunc("/api/v1/merchant/profile", middleware.BaseChain(func(w http.ResponseWriter, r *http.Request) {
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
	mux.HandleFunc("/api/v1/merchant/bank-account", middleware.BaseChain(h.UpdateBankAccount))
	mux.HandleFunc("/api/v1/merchant/toggle-open", middleware.BaseChain(h.ToggleOpen))
	// FB-107: pause sementara + resume — tidak mengubah is_open/jam operasional.
	mux.HandleFunc("/api/v1/merchant/pause", middleware.BaseChain(h.Pause))
	mux.HandleFunc("/api/v1/merchant/resume", middleware.BaseChain(h.Resume))
	mux.HandleFunc("/api/v1/merchant/food-docs", middleware.BaseChain(h.UpdateFoodDocs))

	// FB-110: upload foto menu (multipart → URL publik)
	mux.HandleFunc("/api/v1/merchant/menu/upload", middleware.BaseChain(h.UploadMenuItemPhoto))
	// FB-045: upload dokumen registrasi generic (KTP/foto toko/rekening)
	mux.HandleFunc("/api/v1/merchant/upload", middleware.BaseChain(h.UploadMerchantDoc))

	// Menu CRUD (FOOD-BIKE-018)
	mux.HandleFunc("/api/v1/merchant/menu", middleware.BaseChain(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			h.CreateMenuItem(w, r)
		case http.MethodGet:
			h.ListMenuItems(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/v1/merchant/menu/{id}", middleware.BaseChain(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPatch:
			h.UpdateMenuItem(w, r)
		case http.MethodDelete:
			h.DeleteMenuItem(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/v1/merchant/menu/{id}/availability", middleware.BaseChain(h.SetMenuItemAvailability))

	// FB-108: varian menu — GET lihat, PUT replace atomik (hapus+insert).
	mux.HandleFunc("/api/v1/merchant/menu/{id}/variants", middleware.BaseChain(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.GetMenuItemVariants(w, r)
		case http.MethodPut:
			h.ReplaceMenuItemVariants(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Promo merchant (FB-099): CRUD self-serve, tanpa approval admin
	mux.HandleFunc("/api/v1/merchant/promos", middleware.BaseChain(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			promoH.Create(w, r)
		case http.MethodGet:
			promoH.List(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/v1/merchant/promos/{id}", middleware.BaseChain(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPatch:
			promoH.Update(w, r)
		case http.MethodDelete:
			promoH.Delete(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/v1/merchant/promos/{id}/active", middleware.BaseChain(promoH.SetActive))

	// Order action (FOOD-BIKE-017/021)
	mux.HandleFunc("/api/v1/merchant/orders", middleware.BaseChain(h.ListOrders))
	mux.HandleFunc("/api/v1/merchant/orders/{id}/accept", middleware.BaseChain(h.AcceptOrder))
	mux.HandleFunc("/api/v1/merchant/orders/{id}/reject", middleware.BaseChain(h.RejectOrder))
	mux.HandleFunc("/api/v1/merchant/orders/{id}/struk", middleware.BaseChain(h.GetStruk))
	mux.HandleFunc("/api/v1/merchant/orders/{id}/items", middleware.BaseChain(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			h.GetOrderEdit(w, r)
			return
		}
		h.EditOrderItems(w, r)
	}))

	// Report penjualan (FB-086)
	mux.HandleFunc("/api/v1/merchant/reports", middleware.BaseChain(h.GetSalesReport))
	mux.HandleFunc("/api/v1/merchant/reports/export", middleware.BaseChain(h.ExportSalesReport))
	mux.HandleFunc("/api/v1/merchant/settlements", middleware.BaseChain(h.GetSettlements))

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
