package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"

	"lancar/order-service/internal/domain"
	"lancar/order-service/internal/handler"
	"lancar/order-service/internal/infrastructure/eventbus"
	"lancar/order-service/internal/infrastructure/queue"
	"lancar/order-service/internal/middleware"
	"lancar/order-service/internal/repository"
	"lancar/order-service/internal/service"
	"lancar/order-service/internal/featureflags"
	"lancar/order-service/internal/worker"
	"lancar/order-service/internal/infrastructure/payment_gateway"
	"context"
	"time"

	"github.com/joho/godotenv"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
)

func main() {
	// Load environment variables
	godotenv.Load("../../../.env")

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
	rdb := redis.NewClient(&redis.Options{
		Addr: os.Getenv("REDIS_URL"),
	})
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

	// Payment Gateway Mock
	midtransConfig := payment_gateway.MidtransConfig{
		ServerKey: "MOCK_SERVER_KEY",
		IsProd:    false,
	}
	paymentGw := payment_gateway.NewMidtransGateway(midtransConfig)
	payoutGw := payment_gateway.NewStubPayoutGateway()
	refundGw := payment_gateway.NewStubRefundGateway()

	// Feature Flags
	flagReader := featureflags.NewFlagReader(db, readDB, rdb)
	defer flagReader.Close()

	// Infrastructure
	eb := eventbus.NewRedisEventBus(rdb)

	rabbitmqURL := os.Getenv("RABBITMQ_URL")
	if rabbitmqURL == "" {
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
	orderSvc := service.NewOrderService(pgRepo, pgRepo, redisRepo, pgRepo, eb, tq, flagReader, notificationSvc)
	paymentSvc := service.NewPaymentService(paymentRepo, pgRepo, paymentGw)
	payoutSvc := service.NewPayoutService(payoutRepo, payoutGw)
	refundSvc := service.NewRefundService(refundRepo, pgRepo, paymentRepo, refundGw)
	slaSvc := service.NewSLAService(slaRepo, notificationSvc, payoutRepo)

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

	// Background Workers
	surgeWorker := worker.NewSurgeWorker(rdb)
	go surgeWorker.Start(context.Background())

	monitorWorker := worker.NewOrderMonitorWorker(pgRepo, 15*time.Minute)
	go monitorWorker.Start(context.Background())

	slaWorker := worker.NewSLAWorker(slaSvc)
	slaWorker.Start()

	if tq != nil {
		taskWorker := worker.NewTaskWorker(tq, pgRepo, notificationSvc, notifRepo)
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

	// Tracking Routes
	mux.HandleFunc("/api/v1/tracking/location", middleware.BaseChain(middleware.AuthMiddleware(trackingHandler.UpdateLocation)))
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
