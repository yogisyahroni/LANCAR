package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"strings"

	"context"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/featureflags"
	"tembus/order-service/internal/handler"
	"tembus/order-service/internal/infrastructure"
	"tembus/order-service/internal/infrastructure/eventbus"
	notificationinfra "tembus/order-service/internal/infrastructure/notification"
	"tembus/order-service/internal/infrastructure/payment_gateway"
	"tembus/order-service/internal/infrastructure/queue"
	"tembus/order-service/internal/middleware"
	"tembus/order-service/internal/repository"
	"tembus/order-service/internal/service"
	"tembus/order-service/internal/worker"
	"time"

	"tembus/order-service/pkg/logger"
	"tembus/order-service/pkg/sentry"

	"github.com/jmoiron/sqlx"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	httpSwagger "github.com/swaggo/http-swagger"
	_ "tembus/order-service/internal/handler/docs"
)

// @title TEMBUS Order Service API
// @version 1.0
// @description API for Order Management, Courier Dispatch, and Tracking.
// @termsOfService http://swagger.io/terms/

// @contact.name API Support
// @contact.url http://www.tembus.id/support
// @contact.email support@tembus.id

// @license.name Apache 2.0
// @license.url http://www.apache.org/licenses/LICENSE-2.0.html

// @host localhost:8083
// @BasePath /api/v1
// @securityDefinitions.apikey Bearer
// @in header
// @name Authorization

func isProductionRuntime() bool {
	return strings.EqualFold(os.Getenv("ENVIRONMENT"), "production") ||
		strings.EqualFold(os.Getenv("NODE_ENV"), "production")
}

func containsWeakMarker(value string, markers []string) bool {
	normalizedValue := strings.ToLower(value)
	for _, marker := range markers {
		if strings.Contains(normalizedValue, marker) {
			return true
		}
	}
	return false
}

func requireStrongSecret(name string, minLength int) {
	value := strings.TrimSpace(os.Getenv(name))
	weakMarkers := []string{
		"changeme",
		"change_me",
		"placeholder",
		"example",
		"your-secret-key",
		"your_secret",
		"tembus_secret_key_change_me",
	}

	if value == "" {
		log.Fatalf("%s is required in production", name)
	}
	if len(value) < minLength {
		log.Fatalf("%s must be at least %d characters in production", name, minLength)
	}
	if containsWeakMarker(value, weakMarkers) {
		log.Fatalf("%s contains a weak placeholder marker", name)
	}
}

func requireProductionURL(name string) {
	value := strings.TrimSpace(os.Getenv(name))
	weakMarkers := []string{
		"localhost",
		"127.0.0.1",
		"0.0.0.0",
		"guest:guest",
		"password_url_encoded",
		"password_raw",
		"redis_password_url_encoded",
		"rabbitmq_password_url_encoded",
		"changeme",
		"change_me",
		"placeholder",
		"example",
	}

	if value == "" {
		log.Fatalf("%s is required in production", name)
	}
	if containsWeakMarker(value, weakMarkers) {
		log.Fatalf("%s must not point to localhost, guest credentials, or placeholder values in production", name)
	}
}

func validateProductionSecrets() {
	if !isProductionRuntime() {
		return
	}

	requireProductionURL("DATABASE_URL")
	requireProductionURL("READ_DATABASE_URL")
	requireProductionURL("REDIS_URL")
	requireProductionURL("RABBITMQ_URL")
	requireStrongSecret("JWT_SECRET", 32)

	if strings.EqualFold(os.Getenv("MIDTRANS_ENV"), "production") {
		requireStrongSecret("MIDTRANS_SERVER_KEY", 16)
	}
}

func main() {
	// Load environment variables
	_ = godotenv.Load("../../.env", "../../../.env")
	validateProductionSecrets()

	// LAUNCH-1: Structured JSON logging (configured via LOG_LEVEL, LOG_FORMAT, LOG_SERVICE env)
	logger.Info("Starting order-service",
		"environment", os.Getenv("ENVIRONMENT"),
		"log_level", os.Getenv("LOG_LEVEL"),
	)

	// LAUNCH-2: Sentry error tracking (disabled if SENTRY_DSN not set)
	sentry.Init()
	defer sentry.Flush()

	// Database connections
	dbConn := os.Getenv("DATABASE_URL")
	readDbConn := os.Getenv("READ_DATABASE_URL")
	if readDbConn == "" {
		readDbConn = dbConn // Fallback to primary if replica is not defined
	}

	db, err := sql.Open("postgres", dbConn)
	if err != nil {
		log.Fatal("Failed to connect to primary database:", err)
	}
	defer db.Close()
	middleware.SetDB(db)

	readDB, err := sql.Open("postgres", readDbConn)
	if err != nil {
		log.Fatal("Failed to connect to read database:", err)
	}
	defer readDB.Close()

	// Redis connection
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		if isProductionRuntime() {
			log.Fatal("REDIS_URL is required in production")
		}
		redisURL = "redis://localhost:6379"
	}
	redisOpts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("Failed to parse Redis URL: %v", err)
	}
	rdb := redis.NewClient(redisOpts)
	defer rdb.Close()

	// Maps API Key
	mapsKey := os.Getenv("TOMTOM_SERVER_API_KEY")
	if mapsKey == "" {
		mapsKey = os.Getenv("TOMTOM_API_KEY")
	}

	// Repositories
	configRepo := repository.NewPostgresConfigRepo(sqlx.NewDb(db, "postgres"), sqlx.NewDb(readDB, "postgres"))
	pgRepo := repository.NewPostgresRepository(db, readDB, configRepo)
	redisRepo := repository.NewRedisRepository(rdb)
	mapsRepo, err := repository.NewMapsRepository(mapsKey)
	if err != nil {
		log.Fatal("Failed to initialize maps repository:", err)
	}
	paymentRepo := repository.NewPostgresPaymentRepo(sqlx.NewDb(db, "postgres"))
	payoutRepo := repository.NewPostgresPayoutRepo(sqlx.NewDb(db, "postgres"), sqlx.NewDb(readDB, "postgres"))
	refundRepo := repository.NewPostgresRefundRepo(sqlx.NewDb(db, "postgres"), sqlx.NewDb(readDB, "postgres"))
	slaRepo := repository.NewPostgresSLARepo(sqlx.NewDb(db, "postgres"), sqlx.NewDb(readDB, "postgres"))
	insuranceRepo := repository.NewInsuranceRepository(sqlx.NewDb(db, "postgres"))
	relayRepo := repository.NewRelayRepository(sqlx.NewDb(db, "postgres"), rdb)
	analyticsRepo := repository.NewAnalyticsRepository(sqlx.NewDb(readDB, "postgres")) // Analytics uses read replica
	paymentLinkRepo := repository.NewPaymentLinkRepository(db)
	resiTemplateRepo := repository.NewResiTemplateRepository(db)
	midtransConfig := payment_gateway.MidtransConfig{
		ServerKey: os.Getenv("MIDTRANS_SERVER_KEY"),
		IsProd:    os.Getenv("MIDTRANS_ENV") == "production",
	}
	paymentGw := payment_gateway.NewMidtransGateway(midtransConfig)
	payoutGw := payment_gateway.NewUnavailablePayoutGateway()
	refundGw := payment_gateway.NewWalletRefundGateway(os.Getenv("PAYMENT_SERVICE_URL"), pgRepo)

	// Feature Flags
	flagReader := featureflags.NewFlagReader(db, readDB, rdb)
	defer flagReader.Close()

	// Infrastructure
	eb := eventbus.NewRedisEventBus(rdb)

	rabbitmqURL := os.Getenv("RABBITMQ_URL")
	if rabbitmqURL == "" {
		if isProductionRuntime() {
			log.Fatal("RABBITMQ_URL is required in production")
		}
		rabbitmqURL = "amqp://guest:guest@localhost:5672/"
	}
	tq, err := queue.NewRabbitMQQueue(rabbitmqURL)
	if err != nil {
		log.Printf("Warning: Failed to connect to RabbitMQ: %v. Running without task queue.", err)
	} else {
		defer tq.Close()
	}

	notifRepo := repository.NewPostgresNotificationRepo(sqlx.NewDb(db, "postgres"))
	trackingRepo := repository.NewPostgresTrackingRepo(sqlx.NewDb(db, "postgres"))
	sosRepo := repository.NewPostgresSosRepo(sqlx.NewDb(db, "postgres"))
	chatRepo := repository.NewChatRepository(sqlx.NewDb(db, "postgres"))

	var datalakePub domain.GPSDatalakePublisher
	if rabbitmqURL != "" {
		dp, err := queue.NewGPSDatalakePublisher(rabbitmqURL)
		if err != nil {
			log.Printf("Warning: Failed to connect to RabbitMQ for Datalake Publisher: %v", err)
		} else {
			datalakePub = dp
			defer dp.Close()
		}
	}

	notificationSvc := service.NewNotificationService(notifRepo, tq)
	trackingSvc := service.NewTrackingService(trackingRepo, pgRepo, pgRepo, eb, datalakePub)
	sosSvc := service.NewSosService(sosRepo, notificationSvc)

	// Services
	ledgerRepo := repository.NewPostgresLedgerRepository(db)
	taxRepo := repository.NewPostgresTaxRepository(sqlx.NewDb(db, "postgres"), sqlx.NewDb(readDB, "postgres"))
	taxSvc := service.NewTaxService(taxRepo, configRepo)
	pricingSvc := service.NewPricingService(pgRepo, mapsRepo, redisRepo, flagReader, configRepo)
	meetingPointSvc := service.NewMeetingPointService(pgRepo, mapsRepo, redisRepo)
	orderSvc := service.NewOrderService(pgRepo, pgRepo, redisRepo, pgRepo, relayRepo, eb, tq, flagReader, notificationSvc, configRepo, ledgerRepo, taxSvc)
	paymentSvc := service.NewPaymentService(paymentRepo, pgRepo, paymentGw, configRepo, taxSvc)
	payoutSvc := service.NewPayoutService(payoutRepo, payoutGw, relayRepo, taxRepo, configRepo, ledgerRepo)
	// Food delivery (FOOD-BIKE-073): inject food repository untuk CreateFoodOrder
	foodRepo := repository.NewFoodRepository(db, readDB, configRepo)
	orderSvc.SetFoodRepository(foodRepo)
	// FB-082: piutang cancellation fee merchant (dipotong dari settlement berikutnya)
	merchantCancelFeeRepo := repository.NewMerchantCancellationFeeRepository(db, readDB)
	// FB-080: refund partial per item butuh foodRepo (snapshot food_order_items)
	// FB-082: cancelFeeRepo utk piutang cancellation fee merchant
	refundSvc := service.NewRefundService(refundRepo, pgRepo, paymentRepo, refundGw, redisRepo, ledgerRepo, foodRepo, merchantCancelFeeRepo)
	orderSvc.SetRefundService(refundSvc)
	slaSvc := service.NewSLAService(slaRepo, notificationSvc, payoutRepo)
	insuranceSvc := service.NewInsuranceService(insuranceRepo, notificationSvc, configRepo)
	relayScoreSvc := service.NewRelayScoreService(relayRepo)
	analyticsSvc := service.NewAnalyticsService(analyticsRepo)
	paymentLinkSvc := service.NewPaymentLinkService(
		paymentLinkRepo,
		pricingSvc,
		orderSvc,
		pgRepo,                                        // orderRepo — untuk UpdateOrderAWB
		paymentGw,
		notificationSvc,
		infrastructure.NewIntegrationGatewayClient(configRepo), // awbClient — HTTP ke integration-gateway
		configRepo,
	)
	chatSvc := service.NewChatService(chatRepo, eb)
	resiSvc := service.NewResiService(pgRepo, resiTemplateRepo)
	productCatalogRepo := repository.NewProductCatalogRepository(db)
	productCatalogSvc := service.NewProductCatalogService(productCatalogRepo, configRepo)
	merchantSettlementRepo := repository.NewMerchantSettlementRepository(db)
	merchantSettlementSvc := service.NewMerchantSettlementService(
		merchantSettlementRepo,
		configRepo,
		notificationSvc,
		infrastructure.NewIntegrationGatewayClient(configRepo),
		ledgerRepo,
		merchantCancelFeeRepo,
	)
	// FOOD-BIKE-067: order-service ScanPackage perlu akses settlement service
	// untuk order food delivered (escrow tanpa payment link).
	orderSvc.SetMerchantSettlementService(merchantSettlementSvc)
	// FOOD-BIKE-025/027/068: driver incentive (penalty anti-ghosting + tutup poin)
	driverIncentiveRepo := repository.NewDriverIncentiveRepository(db, readDB)
	penaltySvc := service.NewDriverPenaltyService(driverIncentiveRepo, configRepo)
	pointsSvc := service.NewDriverPointsService(driverIncentiveRepo, configRepo)
	orderSvc.SetDriverIncentiveServices(pointsSvc, penaltySvc)
	// FOOD-BIKE-064: push FCM — register device token + notif merchant order masuk
	deviceTokenRepo := repository.NewDeviceTokenRepository(db, readDB)
	pushSvc := service.NewPushService(deviceTokenRepo, pgRepo)
	paymentSvc.SetPushService(pushSvc)
	deviceTokenHandler := handler.NewDeviceTokenHandler(deviceTokenRepo)
	aggregatorFinanceRepo := repository.NewAggregatorFinanceRepository(db)
	aggregatorFinanceSvc := service.NewAggregatorFinanceService(aggregatorFinanceRepo, ledgerRepo)

	// Handlers
	orderHandler := handler.NewOrderHandler(pricingSvc, orderSvc, meetingPointSvc)
	adminHandler := handler.NewAdminHandler(meetingPointSvc, pricingSvc)
	wsHandler := handler.NewWSHandler(eb)
	paymentHandler := handler.NewPaymentHandler(paymentSvc)
	payoutHandler := handler.NewPayoutHandler(payoutSvc)
	refundHandler := handler.NewRefundHandler(refundSvc)
	slaHandler := handler.NewSLAHandler(slaSvc)
	trackingHandler := handler.NewTrackingHandler(trackingSvc)
	aggregatorFinanceHandler := handler.NewAggregatorFinanceHandler(aggregatorFinanceSvc, aggregatorFinanceRepo)
	notificationHandler := handler.NewNotificationHandler(notificationSvc)
	insuranceHandler := handler.NewInsuranceHandler(insuranceSvc)
	relayHandler := handler.NewRelayHandler(relayScoreSvc)
	analyticsHandler := handler.NewAnalyticsHandler(analyticsSvc)
	paymentLinkHandler := handler.NewPaymentLinkHandler(paymentLinkSvc, configRepo)
	chatHandler := handler.NewChatHandler(chatSvc)
	sosHandler := handler.NewSosHandler(sosSvc)
	resiHandler := handler.NewResiHandler(resiSvc)
	productCatalogHandler := handler.NewProductCatalogHandler(productCatalogSvc)
	deliveryWebhookHandler := handler.NewDeliveryWebhookHandler(merchantSettlementSvc)
	taxHandler := handler.NewTaxHandler(taxSvc)
	// FB-077: tips driver — semua service (parcel/tambal/towing/food)
	tipRepo := repository.NewPostgresTipRepo(sqlx.NewDb(db, "postgres"), sqlx.NewDb(readDB, "postgres"))
	tipSvc := service.NewTipService(tipRepo, pgRepo, refundGw)
	tipHandler := handler.NewTipHandler(tipSvc)
	// FB-083: refund tip otomatis saat order batal
	orderSvc.SetTipService(tipSvc)

	// FB-078: voucher redeem customer — validate/preview + apply di create order
	voucherRepo := repository.NewPostgresVoucherRepo(sqlx.NewDb(db, "postgres"), sqlx.NewDb(readDB, "postgres"))
	voucherSvc := service.NewVoucherService(voucherRepo)
	voucherHandler := handler.NewVoucherHandler(voucherSvc)
	orderSvc.SetVoucherService(voucherSvc)

	// Tambal Ban & Towing Services
	settlementRepo := repository.NewSettlementRepository(db)
	availabilityRepo := repository.NewAvailabilityRepository(db)
	serviceReportRepo := repository.NewServiceReportRepository(db)
	settlementSvc := service.NewSettlementService(settlementRepo)
	availabilitySvc := service.NewAvailabilityService(availabilityRepo)
	vehicleValidator := service.NewVehicleValidator(availabilityRepo)
	serviceReportSvc := service.NewServiceReportService(serviceReportRepo)
	orderSvc.SetServiceReportService(serviceReportSvc)
	tambalBanHandler := handler.NewTambalBanHandler(settlementSvc, availabilitySvc, vehicleValidator, serviceReportSvc)

	// Background Workers
	surgeWorker := worker.NewSurgeWorker(rdb, worker.NewPostgresSurgeDataStore(readDB), configRepo)
	go surgeWorker.Start(context.Background())

	monitorWorker := worker.NewOrderMonitorWorker(pgRepo, orderSvc, 15*time.Minute)
	go monitorWorker.Start(context.Background())

	paymentLinkWorker := worker.NewPaymentLinkWorker(paymentLinkSvc)
	go paymentLinkWorker.Start(context.Background())

	tierWorker := worker.NewTierEvaluatorWorker(db)
	go tierWorker.Start(context.Background())

	// Start rating reminder worker: runs every 15 mins, max 4 reminders, interval 12 hours
	ratingReminderWorker := worker.NewRatingReminderWorker(pgRepo, notificationSvc, 15*time.Minute, 4, 12)
	go ratingReminderWorker.Start(context.Background())

	slaWorker := worker.NewSLAWorker(slaSvc)
	slaWorker.Start()
	foodPrepWorker := worker.NewFoodPrepWorker(orderSvc) // FOOD-BIKE-022
	foodPrepWorker.Start()
	ghostDetectWorker := worker.NewGhostDetectionWorker(pgRepo, penaltySvc) // FOOD-BIKE-066
	go ghostDetectWorker.Start(context.Background())

	// LAUNCH-6: Data retention cleanup worker
	worker.StartCleanupWorker(db)

	if tq != nil {
		taskWorker := worker.NewTaskWorker(tq, pgRepo, notificationSvc, notifRepo, insuranceSvc, relayScoreSvc, analyticsSvc)
		taskWorker.SetNotificationDeliveryProvider(notificationinfra.NewHTTPDeliveryProvider(notifRepo))
		go func() {
			if err := taskWorker.Start(context.Background()); err != nil {
				log.Printf("Failed to start task worker: %v", err)
			}
		}()
	}

	// Merchant Escrow Settlement Worker (runs every 5 minutes)
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
			if err := merchantSettlementSvc.ProcessPendingSettlements(ctx); err != nil {
				logger.Error("Merchant settlement cron failed", "error", err)
			}
			cancel()
		}
	}()

	// Routes
	mux := http.NewServeMux()

	// Infrastructure Routes
	mux.HandleFunc("/health", handler.HealthHandler)
	mux.HandleFunc("/ready", handler.ReadinessHandlerFunc(db))

	// Swagger Documentation (Secure in Production)
	mux.Handle("/swagger/", httpSwagger.WrapHandler)

	// WebSocket Route
	mux.HandleFunc("/ws", middleware.AuthMiddleware(wsHandler.ServeHTTP))

	// Public Routes
	mux.HandleFunc("/api/v1/pricing/estimate", middleware.LimitByIP(rdb)(middleware.BaseChain(
		middleware.ValidateBody(domain.PricingEstimateRequest{})(orderHandler.Estimate),
	)))
	mux.HandleFunc("/api/resi/render/{awb}", middleware.LimitByIP(rdb)(middleware.BaseChain(resiHandler.RenderResi)))

	// Protected Routes (Wrapped in Auth + Base Middleware)
	mux.HandleFunc("/api/v1/orders", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			// Apply rate limit to order creation
			middleware.LimitOrderCreation(rdb)(middleware.ValidateBody(domain.CreateOrderRequest{})(orderHandler.CreateOrder)).ServeHTTP(w, r)
		} else if r.Method == http.MethodGet {
			// Apply global IP rate limit to order listing to prevent enumeration
			middleware.LimitByIP(rdb)(orderHandler.ListOrders).ServeHTTP(w, r)
		} else {
			middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		}
	})))

	// Food delivery (FOOD-BIKE-074): POST /api/v1/orders/food
	mux.HandleFunc("/api/v1/orders/food", middleware.BaseChain(middleware.AuthMiddleware(
		middleware.LimitOrderCreation(rdb)(middleware.ValidateBody(domain.CreateFoodOrderRequest{})(orderHandler.CreateFoodOrder)),
	)))

	// Food delivery — browse merchant (FOOD-BIKE-055/056)
	mux.HandleFunc("/api/v1/food/merchants", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.ListFoodMerchants)))
	mux.HandleFunc("/api/v1/food/merchants/{id}", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.GetFoodMerchantDetail)))

	mux.HandleFunc("/api/v1/orders/detail", middleware.BaseChain(middleware.AuthMiddleware(middleware.LimitByIP(rdb)(orderHandler.GetOrder))))
	mux.HandleFunc("/api/v1/orders/bulk", middleware.BaseChain(middleware.AuthMiddleware(middleware.LimitOrderCreation(rdb)(orderHandler.CreateBulkOrder))))
	mux.HandleFunc("/api/v1/orders/poll", middleware.BaseChain(middleware.AuthMiddleware(middleware.LimitByIP(rdb)(orderHandler.PollOrderUpdates))))
	mux.HandleFunc("/api/v1/orders/retry-matching", middleware.BaseChain(middleware.AuthMiddleware(middleware.LimitByIP(rdb)(orderHandler.RetryMatching))))
	mux.HandleFunc("/api/v1/meeting-points/suggest", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.SuggestMeetingPoints)))

	// Chat Endpoints
	mux.HandleFunc("/api/v1/orders/{id}/chats", middleware.BaseChain(middleware.AuthMiddleware(middleware.LimitByIP(rdb)(chatHandler.HandleChats))))
	mux.HandleFunc("/api/v1/orders/{id}/conversation", middleware.BaseChain(middleware.AuthMiddleware(middleware.LimitByIP(rdb)(chatHandler.HandleChats))))
	mux.HandleFunc("/api/v1/orders/{id}/conversation/read", middleware.BaseChain(middleware.AuthMiddleware(middleware.LimitByIP(rdb)(chatHandler.HandleChats))))

	// FB-077: Tips driver — semua service (parcel/tambal/towing/food)
	mux.HandleFunc("/api/v1/orders/{id}/tips", middleware.BaseChain(middleware.AuthMiddleware(middleware.LimitByIP(rdb)(tipHandler.CreateTip))))
	mux.HandleFunc("/api/v1/orders/{id}/tip", middleware.BaseChain(middleware.AuthMiddleware(tipHandler.GetTipByOrder)))
	mux.HandleFunc("/api/v1/couriers/tips", middleware.BaseChain(middleware.AuthMiddleware(tipHandler.ListCourierTips)))
	mux.HandleFunc("/api/v1/couriers/tips/summary", middleware.BaseChain(middleware.AuthMiddleware(tipHandler.GetCourierTipSummary)))
	// FB-078: voucher validate (customer preview)
	mux.HandleFunc("/api/v1/vouchers/validate", middleware.BaseChain(middleware.AuthMiddleware(voucherHandler.ValidateVoucher)))

	// Courier Workflow Routes
	mux.HandleFunc("/api/v1/couriers/orders/accept", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.AcceptOrder)))
	mux.HandleFunc("/api/v1/orders/status", middleware.BaseChain(middleware.AuthMiddleware(middleware.LimitByIP(rdb)(orderHandler.UpdateStatus))))
	mux.HandleFunc("/api/v1/orders/scan", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.ScanPackage)))
	mux.HandleFunc("/api/v1/orders/scans", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.GetPackageScans)))
	mux.HandleFunc("/api/v1/orders/bags", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.CreateConsolidationBag)))
	mux.HandleFunc("/api/v1/orders/bags/open", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.OpenConsolidationBag)))
	mux.HandleFunc("/api/v1/orders/bags/detail", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.GetConsolidationBag)))
	mux.HandleFunc("/api/v1/orders/scan/auto-detect", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.AutoDetectScanType)))

	// SOS Endpoints
	mux.HandleFunc("/api/v1/couriers/sos/trigger", middleware.BaseChain(middleware.AuthMiddleware(sosHandler.TriggerSOS)))
	mux.HandleFunc("/api/v1/couriers/sos/accept", middleware.BaseChain(middleware.AuthMiddleware(sosHandler.AcceptSOS)))
	mux.HandleFunc("/api/v1/couriers/sos/arrive", middleware.BaseChain(middleware.AuthMiddleware(sosHandler.ArriveAtSOS)))
	mux.HandleFunc("/api/v1/couriers/sos/report", middleware.BaseChain(middleware.AuthMiddleware(sosHandler.SubmitHelperReport)))
	mux.HandleFunc("/api/v1/couriers/sos/tamper", middleware.BaseChain(middleware.AuthMiddleware(sosHandler.ReportTamper)))
	mux.HandleFunc("/api/v1/device-tokens", middleware.BaseChain(middleware.AuthMiddleware(deviceTokenHandler.Register)))

	// Tambal Ban & Towing Routes
	mux.HandleFunc("/api/v1/customer/nearby-couriers", middleware.BaseChain(middleware.AuthMiddleware(tambalBanHandler.GetNearbyCouriers)))
	mux.HandleFunc("/api/v1/order/settlement", middleware.BaseChain(middleware.AuthMiddleware(tambalBanHandler.CalculateSettlement)))
	mux.HandleFunc("/api/v1/courier/availability-state", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			tambalBanHandler.UpdateAvailabilityState(w, r)
		} else if r.Method == http.MethodGet {
			tambalBanHandler.GetAvailabilityState(w, r)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	// FOOD-BIKE-029: driver set radius jangkauan food delivery (dropdown 1-20 km)
	mux.HandleFunc("/api/v1/courier/radius", middleware.BaseChain(middleware.AuthMiddleware(tambalBanHandler.UpdateRadius)))

	mux.HandleFunc("/api/v1/courier/service-report/tambal-ban", middleware.BaseChain(middleware.AuthMiddleware(tambalBanHandler.CreateTambalBanReport)))
	mux.HandleFunc("/api/v1/courier/service-report/towing", middleware.BaseChain(middleware.AuthMiddleware(tambalBanHandler.CreateTowingReport)))

	// Internal Orchestration Routes (Should be IP-whitelisted or internally routed)
	mux.HandleFunc("/api/v1/internal/orders/matching", orderHandler.InternalStartMatching)
	mux.HandleFunc("/api/v1/internal/orders/retry-matching", orderHandler.InternalRetryMatching)

	// Rating Endpoints
	mux.HandleFunc("/api/v1/customer/orders/", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		// Manual routing for /api/v1/customer/orders/{id}/rating
		if strings.HasSuffix(r.URL.Path, "/rating") && r.Method == http.MethodPost {
			orderHandler.SubmitCourierRating(w, r)
			return
		}
		// FOOD-BIKE-059/060: rating makanan merchant, terpisah dari driver
		if strings.HasSuffix(r.URL.Path, "/merchant-rating") && r.Method == http.MethodPost {
			orderHandler.SubmitMerchantRating(w, r)
			return
		}
		// If other /orders/ routes exist, handle them here...
		http.Error(w, "Not found", http.StatusNotFound)
	})))
	mux.HandleFunc("/api/v1/customer/rating-reminders", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.GetRatingReminders)))

	mux.HandleFunc("/api/v1/internal/refunds/process", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			refundHandler.CreateRefund(w, r)
		}
	})
	mux.HandleFunc("/api/v1/internal/refunds/items", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			refundHandler.CreateItemRefund(w, r)
		}
	})

	// Tracking Routes
	mux.HandleFunc("/api/v1/tracking/location", middleware.BaseChain(middleware.AuthMiddleware(trackingHandler.UpdateLocation)))
	mux.HandleFunc("/api/v1/tracking/sync", middleware.BaseChain(middleware.AuthMiddleware(trackingHandler.SyncLocations)))
	mux.HandleFunc("/api/v1/tracking", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			trackingHandler.GetTracking(w, r)
		}
	})))

	// Notification Routes
	mux.HandleFunc("/api/v1/notifications", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			notificationHandler.GetInbox(w, r)
		}
	})))
	mux.HandleFunc("/api/v1/notifications/read", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch {
			notificationHandler.MarkAsRead(w, r)
		}
	})))
	// Tax Routes
	mux.HandleFunc("POST /api/v1/tax/efaktur/export", middleware.BaseChain(middleware.AuthMiddleware(middleware.RoleCheck(middleware.RoleAdmin, middleware.RoleFinance)(taxHandler.GenerateEFakturExport))))
	mux.HandleFunc("GET /api/v1/tax/efaktur/download", middleware.BaseChain(middleware.AuthMiddleware(middleware.RoleCheck(middleware.RoleAdmin, middleware.RoleFinance)(taxHandler.DownloadEFaktur))))
	mux.HandleFunc("PUT /api/v1/tax/efaktur/status", middleware.BaseChain(middleware.AuthMiddleware(middleware.RoleCheck(middleware.RoleAdmin, middleware.RoleFinance)(taxHandler.UpdateEFakturStatus))))

	// Insurance & Relay Score Routes
	mux.HandleFunc("/api/v1/insurance/enroll-bpjs", middleware.BaseChain(middleware.AuthMiddleware(insuranceHandler.EnrollBPJSTK))) // Insurance & Relay Score Routes
	mux.HandleFunc("GET /api/v1/admin/couriers/performance", middleware.BaseChain(middleware.AuthMiddleware(relayHandler.ListCourierPerformance)))
	mux.HandleFunc("PUT /api/v1/admin/couriers/{id}/tier", middleware.BaseChain(middleware.AuthMiddleware(relayHandler.AdminOverrideTier)))
	mux.HandleFunc("/api/v1/admin/relay-score/override", middleware.BaseChain(middleware.AuthMiddleware(relayHandler.AdminOverrideScore)))

	// Courier Payout Routes
	mux.HandleFunc("/api/v1/couriers/me/performance", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.GetCourierPerformance)))
	// Note: We register both routes to support older clients, but the official one is earnings-ledger
	mux.HandleFunc("/api/v1/couriers/me/earnings", middleware.BaseChain(middleware.AuthMiddleware(payoutHandler.GetCourierEarnings)))
	mux.HandleFunc("/api/v1/courier/earnings-ledger", middleware.BaseChain(middleware.AuthMiddleware(payoutHandler.GetCourierEarnings)))

	// Payment Routes
	mux.HandleFunc("/api/v1/payments/create", middleware.BaseChain(middleware.AuthMiddleware(paymentHandler.CreatePayment)))
	mux.HandleFunc("/api/v1/payments/", middleware.BaseChain(middleware.AuthMiddleware(paymentHandler.GetPaymentStatus))) // for GET /payments/:id

	// Webhook Route (no auth, verify signature inside)
	mux.HandleFunc("/api/v1/payments/webhook", middleware.BaseChain(paymentHandler.HandleWebhook))

	mux.HandleFunc("/api/v1/payment-links", middleware.BaseChain(paymentLinkHandler.HandleRequest))
	mux.HandleFunc("/api/v1/payment-links/", middleware.BaseChain(paymentLinkHandler.HandleRequest))
	mux.HandleFunc("/api/v1/payment-links/webhook", middleware.BaseChain(paymentLinkHandler.HandleWebhook))

	// Internal Delivery & Merchant Settlement Routes
	mux.HandleFunc("/api/v1/internal/delivery/webhook", middleware.BaseChain(deliveryWebhookHandler.HandleDeliveryEvent))
	mux.HandleFunc("/api/v1/internal/merchant-settlements", middleware.BaseChain(deliveryWebhookHandler.HandleListSettlements))
	// FB-080: chargeback settlement merchant per order (dipanggil admin-service saat dispute food resolved memihak customer)
	mux.HandleFunc("/api/v1/internal/settlements/chargeback", middleware.BaseChain(deliveryWebhookHandler.HandleChargeback))

	// Aggregator Finance Routes (Invoices & Claims)
	mux.HandleFunc("/api/v1/internal/aggregator-finance/invoices", middleware.BaseChain(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			aggregatorFinanceHandler.ImportInvoice(w, r)
		} else if r.Method == http.MethodGet {
			aggregatorFinanceHandler.ListInvoices(w, r)
		}
	}))
	mux.HandleFunc("/api/v1/internal/aggregator-finance/invoices/reconcile/", middleware.BaseChain(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			aggregatorFinanceHandler.ReconcileInvoice(w, r)
		}
	}))
	mux.HandleFunc("/api/v1/internal/aggregator-finance/invoices/approve/", middleware.BaseChain(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			aggregatorFinanceHandler.ApproveInvoice(w, r)
		}
	}))
	mux.HandleFunc("/api/v1/internal/aggregator-finance/policies", middleware.BaseChain(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			aggregatorFinanceHandler.ListPolicies(w, r)
		} else if r.Method == http.MethodPut || r.Method == http.MethodPost {
			aggregatorFinanceHandler.UpdatePolicy(w, r)
		}
	}))
	mux.HandleFunc("/api/v1/internal/aggregator-finance/claims", middleware.BaseChain(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			aggregatorFinanceHandler.SubmitClaim(w, r)
		} else if r.Method == http.MethodGet {
			aggregatorFinanceHandler.ListClaims(w, r)
		}
	}))
	mux.HandleFunc("/api/v1/internal/aggregator-finance/claims/resolve/", middleware.BaseChain(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			aggregatorFinanceHandler.ResolveClaim(w, r)
		}
	}))

	// Product Catalog Routes
	mux.HandleFunc("/api/v1/products", middleware.BaseChain(productCatalogHandler.HandleProducts))
	mux.HandleFunc("/api/v1/products/bulk", middleware.BaseChain(productCatalogHandler.HandleBulkUpload))
	mux.HandleFunc("/api/v1/products/", middleware.BaseChain(func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/v1/products/")
		if id == "" || id == "bulk" {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		productCatalogHandler.HandleProductByID(w, r, id)
	}))

	// Logistics Routes
	mux.HandleFunc("/api/v1/logistics/tariff", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			paymentLinkHandler.CheckTariff(w, r)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	// Admin Routes (Protected by Auth and Admin Role)
	mux.HandleFunc("/api/v1/admin/payouts/trigger", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			payoutHandler.TriggerBatchPayout(w, r)
		}
	})))
	mux.HandleFunc("/api/v1/admin/refunds/process", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			refundHandler.CreateRefund(w, r)
		}
	})))
	mux.HandleFunc("/api/v1/admin/notifications/templates", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			notificationHandler.ManageTemplates(w, r)
		}
	})))
	mux.HandleFunc("/api/v1/admin/sla/dashboard", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			slaHandler.GetDashboard(w, r)
		}
	})))
	mux.HandleFunc("/api/v1/admin/meeting-points", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			adminHandler.CreateMeetingPoint(w, r)
		} else if r.Method == http.MethodGet {
			adminHandler.GetMeetingPointAnalytics(w, r)
		}
	})))
	mux.HandleFunc("/api/v1/admin/meeting-points/", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			adminHandler.UpdateMeetingPoint(w, r)
		} else if r.Method == http.MethodDelete {
			adminHandler.DeleteMeetingPoint(w, r)
		}
	})))
	mux.HandleFunc("/api/v1/admin/pricing/config", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			adminHandler.GetPricingConfig(w, r)
		} else if r.Method == http.MethodPut {
			adminHandler.UpdatePricingConfig(w, r)
		}
	})))
	mux.HandleFunc("/api/v1/admin/pricing/simulate", middleware.BaseChain(middleware.AuthMiddleware(adminHandler.SimulatePrice)))

	// Analytics Routes
	mux.HandleFunc("/api/v1/admin/analytics/dashboard", middleware.BaseChain(middleware.AuthMiddleware(analyticsHandler.GetDashboardMetrics)))
	mux.HandleFunc("/api/v1/admin/analytics/reports", middleware.BaseChain(middleware.AuthMiddleware(analyticsHandler.GetReport)))
	mux.HandleFunc("/api/v1/admin/analytics/refresh", middleware.BaseChain(middleware.AuthMiddleware(analyticsHandler.RefreshData)))

	// Background job for SOS Timeout
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		ctx := context.Background()
		for range ticker.C {
			if err := sosSvc.CloseStaleIncidents(ctx); err != nil {
				log.Printf("Error closing stale SOS incidents: %v", err)
			}
		}
	}()

	// Server
	port := os.Getenv("ORDER_PORT")
	if port == "" {
		port = "8083"
	}

	log.Printf("Order service starting on port %s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal("Server failed:", err)
	}
}
