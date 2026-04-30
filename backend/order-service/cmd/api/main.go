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
	"lancar/order-service/internal/worker"
	"lancar/order-service/internal/infrastructure/notification"
	"context"
	"time"

	"github.com/joho/godotenv"
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

	// Infrastructure
	eb := eventbus.NewRedisEventBus(rdb)
	notificationSvc := notification.NewStubNotificationService()

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

	// Services
	pricingSvc := service.NewPricingService(pgRepo, mapsRepo, redisRepo)
	orderSvc := service.NewOrderService(pgRepo, pgRepo, redisRepo, pgRepo, eb, tq)

	// Handlers
	orderHandler := handler.NewOrderHandler(pricingSvc, orderSvc)
	wsHandler := handler.NewWSHandler(eb)

	// Background Workers
	surgeWorker := worker.NewSurgeWorker(rdb)
	go surgeWorker.Start(context.Background())

	cancelWorker := worker.NewAutoCancelWorker(pgRepo, 15*time.Minute)
	go cancelWorker.Start(context.Background())

	if tq != nil {
		taskWorker := worker.NewTaskWorker(tq, pgRepo, notificationSvc)
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
