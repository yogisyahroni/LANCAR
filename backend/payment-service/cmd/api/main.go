package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"tembus/payment-service/internal/domain"
	"tembus/payment-service/internal/featureflags"
	"tembus/payment-service/internal/handler"
	_ "tembus/payment-service/internal/handler/docs"
	"tembus/payment-service/internal/middleware"
	"tembus/payment-service/internal/repository"
	"tembus/payment-service/internal/service"
	"tembus/payment-service/pkg/logger"
	"tembus/payment-service/pkg/sentry"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	httpSwagger "github.com/swaggo/http-swagger"
)

// @title TEMBUS Payment Service API
// @version 1.0
// @description API for Wallet, Payout, and Payment Reconciliation.
// @host localhost:8084
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
	if strings.EqualFold(os.Getenv("MIDTRANS_ENV"), "production") {
		requireStrongSecret("MIDTRANS_SERVER_KEY", 16)
	}
}

func main() {
	// Load environment variables
	_ = godotenv.Load("../../.env")
	validateProductionSecrets()

	// LAUNCH-1+2: Logger & Sentry
	logger.Info("Starting payment-service", "environment", os.Getenv("ENVIRONMENT"))
	sentry.Init()
	defer sentry.Flush()

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
	middleware.LogJSON("info", "database connection established", map[string]interface{}{})

	// Feature Flag Reader
	flagReader := featureflags.NewFlagReader(db)

	// Wire Layers
	repo := repository.NewPostgresWalletRepository(db, db) // Using same DB for R/W in this simple setup
	svc := service.NewWalletService(repo, repo.(domain.SettingsRepository), db, flagReader)
	h := handler.NewWalletHandler(svc)

	// Router
	mux := http.NewServeMux()

	// API v1 — Wallet Endpoints
	mux.HandleFunc("/api/v1/wallet/balance", middleware.BaseChain(h.GetBalance))
	mux.HandleFunc("/api/v1/wallet/topup", middleware.BaseChain(h.TopUp))
	mux.HandleFunc("/api/v1/wallet/deposit", middleware.BaseChain(h.Deposit))
	mux.HandleFunc("/api/v1/wallet/withdraw", middleware.BaseChain(h.Withdraw))
	mux.HandleFunc("/api/v1/wallet/refund", middleware.BaseChain(h.Refund))
	mux.HandleFunc("/api/internal/wallet/refund", middleware.BaseChain(h.Refund))

	// Internal SOS wallet handlers
	mux.HandleFunc("/api/internal/wallet/sos-penalty", middleware.BaseChain(h.SosPenalty))
	mux.HandleFunc("/api/internal/wallet/sos-reward", middleware.BaseChain(h.SosReward))

	// Health Check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// LAUNCH-5: Swagger UI (enabled via SWAGGER_ENABLED=true env, default: non-production only)
	if strings.ToLower(os.Getenv("SWAGGER_ENABLED")) != "false" || !isProductionRuntime() {
		mux.Handle("/swagger/", httpSwagger.WrapHandler)
	}

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

	middleware.LogJSON("info", "server starting", map[string]interface{}{"port": port})
	if err := server.ListenAndServe(); err != nil {
		log.Fatal("Server failed to start:", err)
	}
}
