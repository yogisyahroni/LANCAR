package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"strings"

	"context"
	"lancar/order-service/internal/domain"
	"lancar/order-service/internal/featureflags"
	"lancar/order-service/internal/handler"
	"lancar/order-service/internal/infrastructure/eventbus"
	notificationinfra "lancar/order-service/internal/infrastructure/notification"
	"lancar/order-service/internal/infrastructure/payment_gateway"
	"lancar/order-service/internal/infrastructure/queue"
	"lancar/order-service/internal/middleware"
	"lancar/order-service/internal/repository"
	"lancar/order-service/internal/service"
	"lancar/order-service/internal/worker"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	httpSwagger "github.com/swaggo/http-swagger"
	_ "lancar/order-service/internal/handler/docs"
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
	godotenv.Load("../../.env", "../../../.env")
	validateProductionSecrets()

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
	mapsKey := os.Getenv("GOOGLE_MAPS_API_KEY")

	// Repositories
	pgRepo := repository.NewPostgresRepository(db, readDB)
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

	midtransConfig := payment_gateway.MidtransConfig{
		ServerKey: os.Getenv("MIDTRANS_SERVER_KEY"),
		IsProd:    os.Getenv("MIDTRANS_ENV") == "production",
	}
	paymentGw := payment_gateway.NewMidtransGateway(midtransConfig)
	payoutGw := payment_gateway.NewUnavailablePayoutGateway()
	refundGw := payment_gateway.NewUnavailableRefundGateway()

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

	notificationSvc := service.NewNotificationService(notifRepo, tq)
	trackingSvc := service.NewTrackingService(trackingRepo, eb)

	// Services
	pricingSvc := service.NewPricingService(pgRepo, mapsRepo, redisRepo, flagReader)
	meetingPointSvc := service.NewMeetingPointService(pgRepo, mapsRepo, redisRepo)
	orderSvc := service.NewOrderService(pgRepo, pgRepo, redisRepo, pgRepo, relayRepo, eb, tq, flagReader, notificationSvc)
	paymentSvc := service.NewPaymentService(paymentRepo, pgRepo, paymentGw)
	payoutSvc := service.NewPayoutService(payoutRepo, payoutGw, relayRepo)
	refundSvc := service.NewRefundService(refundRepo, pgRepo, paymentRepo, refundGw)
	slaSvc := service.NewSLAService(slaRepo, notificationSvc, payoutRepo)
	insuranceSvc := service.NewInsuranceService(insuranceRepo, notificationSvc)
	relayScoreSvc := service.NewRelayScoreService(relayRepo)
	analyticsSvc := service.NewAnalyticsService(analyticsRepo)
	// matchingSvc := service.NewRelayMatchingService(relayRepo, pgRepo, redisRepo) // Can be used later

	// Handlers
	orderHandler := handler.NewOrderHandler(pricingSvc, orderSvc, meetingPointSvc)
	adminHandler := handler.NewAdminHandler(meetingPointSvc, pricingSvc)
	wsHandler := handler.NewWSHandler(eb)
	paymentHandler := handler.NewPaymentHandler(paymentSvc)
	payoutHandler := handler.NewPayoutHandler(payoutSvc)
	refundHandler := handler.NewRefundHandler(refundSvc)
	slaHandler := handler.NewSLAHandler(slaSvc)
	trackingHandler := handler.NewTrackingHandler(trackingSvc)
	notificationHandler := handler.NewNotificationHandler(notificationSvc)
	insuranceHandler := handler.NewInsuranceHandler(insuranceSvc)
	relayHandler := handler.NewRelayHandler(relayScoreSvc)
	analyticsHandler := handler.NewAnalyticsHandler(analyticsSvc)

	// Background Workers
	surgeWorker := worker.NewSurgeWorker(rdb, worker.NewPostgresSurgeDataStore(readDB))
	go surgeWorker.Start(context.Background())

	monitorWorker := worker.NewOrderMonitorWorker(pgRepo, 15*time.Minute)
	go monitorWorker.Start(context.Background())

	slaWorker := worker.NewSLAWorker(slaSvc)
	slaWorker.Start()

	if tq != nil {
		taskWorker := worker.NewTaskWorker(tq, pgRepo, notificationSvc, notifRepo, insuranceSvc, relayScoreSvc, analyticsSvc)
		taskWorker.SetNotificationDeliveryProvider(notificationinfra.NewHTTPDeliveryProvider(notifRepo))
		go func() {
			if err := taskWorker.Start(context.Background()); err != nil {
				log.Printf("Failed to start task worker: %v", err)
			}
		}()
	}

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

	// Protected Routes (Wrapped in Auth + Base Middleware)
	mux.HandleFunc("/api/v1/orders", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			middleware.ValidateBody(domain.CreateOrderRequest{})(orderHandler.CreateOrder).ServeHTTP(w, r)
		} else if r.Method == http.MethodGet {
			orderHandler.ListOrders(w, r)
		} else {
			middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		}
	})))
	mux.HandleFunc("/api/v1/orders/detail", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.GetOrder)))
	mux.HandleFunc("/api/v1/orders/poll", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.PollOrderUpdates)))
	mux.HandleFunc("/api/v1/meeting-points/suggest", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.SuggestMeetingPoints)))

	// Courier Workflow Routes
	mux.HandleFunc("/api/v1/couriers/orders/accept", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.AcceptOrder)))
	mux.HandleFunc("/api/v1/orders/status", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.UpdateStatus)))
	mux.HandleFunc("/api/v1/orders/scan", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.ScanPackage)))
	mux.HandleFunc("/api/v1/orders/scans", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.GetPackageScans)))
	mux.HandleFunc("/api/v1/orders/bags", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.CreateConsolidationBag)))
	mux.HandleFunc("/api/v1/orders/bags/open", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.OpenConsolidationBag)))
	mux.HandleFunc("/api/v1/orders/bags/detail", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.GetConsolidationBag)))
	mux.HandleFunc("/api/v1/orders/scan/auto-detect", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.AutoDetectScanType)))

	// Internal Orchestration Routes (Should be IP-whitelisted or internally routed)
	mux.HandleFunc("/api/v1/internal/orders/matching", orderHandler.StartMatching)

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

	// Insurance & Relay Score Routes
	mux.HandleFunc("/api/v1/insurance/enroll-bpjs", middleware.BaseChain(middleware.AuthMiddleware(insuranceHandler.EnrollBPJSTK))) // Example mapping
	mux.HandleFunc("/api/v1/admin/relay-score/override", middleware.BaseChain(middleware.AuthMiddleware(relayHandler.AdminOverrideScore)))

	// Courier Payout Routes
	mux.HandleFunc("/api/v1/couriers/me/earnings", middleware.BaseChain(middleware.AuthMiddleware(payoutHandler.GetCourierEarnings)))

	// Payment Routes
	mux.HandleFunc("/api/v1/payments/create", middleware.BaseChain(middleware.AuthMiddleware(paymentHandler.CreatePayment)))
	mux.HandleFunc("/api/v1/payments/", middleware.BaseChain(middleware.AuthMiddleware(paymentHandler.GetPaymentStatus))) // for GET /payments/:id

	// Webhook Route (no auth, verify signature inside)
	mux.HandleFunc("/api/v1/payments/webhook", middleware.BaseChain(paymentHandler.HandleWebhook))

	// Admin Routes (Protected by Auth and Admin Role)
	mux.HandleFunc("/api/v1/admin/payouts/trigger", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			payoutHandler.TriggerBatchPayout(w, r)
		}
	})))
	mux.HandleFunc("/api/v1/admin/refunds/process", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			refundHandler.ProcessRefunds(w, r)
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
