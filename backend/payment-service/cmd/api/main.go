package main

import (
	"database/sql"
	"log"

	"net/http"
	"os"
	"time"

	"lancar/payment-service/internal/domain"
	"lancar/payment-service/internal/handler"
	"lancar/payment-service/internal/repository"
	"lancar/payment-service/internal/service"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	// Load environment variables
	_ = godotenv.Load("../../.env")

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	// Database Connection
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
	log.Println("[payment-service] Database connection established")

	// Wire Layers
	repo := repository.NewPostgresWalletRepository(db, db) // Using same DB for R/W in this simple setup
	svc := service.NewWalletService(repo, repo.(domain.SettingsRepository), db)
	h := handler.NewWalletHandler(svc)

	// Router
	mux := http.NewServeMux()
	
	// API v1 — Wallet Endpoints
	mux.HandleFunc("/api/v1/wallet/balance", h.GetBalance)
	mux.HandleFunc("/api/v1/wallet/topup", h.TopUp)
	mux.HandleFunc("/api/v1/wallet/deposit", h.Deposit)
	mux.HandleFunc("/api/v1/wallet/withdraw", h.Withdraw)

	// Health Check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8084"
	}

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	log.Printf("[payment-service] Starting server on port %s", port)
	if err := server.ListenAndServe(); err != nil {
		log.Fatal("Server failed to start:", err)
	}
}
