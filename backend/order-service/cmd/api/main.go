package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"

	"lancar/order-service/internal/handler"
	"lancar/order-service/internal/middleware"
	"lancar/order-service/internal/repository"
	"lancar/order-service/internal/service"
	"lancar/order-service/internal/worker"
	"context"
	"time"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
)

func main() {
	// Load environment variables
	godotenv.Load("../../../.env")

	// Database connection
	dbConn := os.Getenv("DATABASE_URL")
	db, err := sql.Open("postgres", dbConn)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	// Redis connection
	rdb := redis.NewClient(&redis.Options{
		Addr: os.Getenv("REDIS_URL"),
	})
	defer rdb.Close()

	// Maps API Key
	mapsKey := os.Getenv("GOOGLE_MAPS_API_KEY")

	// Repositories
	pgRepo := repository.NewPostgresRepository(db)
	redisRepo := repository.NewRedisRepository(rdb)
	mapsRepo, err := repository.NewMapsRepository(mapsKey)
	if err != nil {
		log.Fatal("Failed to initialize maps repository:", err)
	}

	// Services
	pricingSvc := service.NewPricingService(pgRepo, mapsRepo, redisRepo)
	orderSvc := service.NewOrderService(pgRepo, redisRepo, pgRepo) // pgRepo implements both Order and Pricing

	// Handlers
	orderHandler := handler.NewOrderHandler(pricingSvc, orderSvc)

	// Background Workers
	surgeWorker := worker.NewSurgeWorker(rdb)
	go surgeWorker.Start(context.Background())

	cancelWorker := worker.NewAutoCancelWorker(pgRepo, 15*time.Minute)
	go cancelWorker.Start(context.Background())

	// Routes
	mux := http.NewServeMux()
	
	// Public Routes
	mux.HandleFunc("/api/v1/pricing/estimate", orderHandler.Estimate)
	
	// Protected Routes
	mux.HandleFunc("/api/v1/orders", middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			orderHandler.CreateOrder(w, r)
		} else if r.Method == http.MethodGet {
			orderHandler.ListOrders(w, r)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/v1/orders/detail", middleware.AuthMiddleware(orderHandler.GetOrder))

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
