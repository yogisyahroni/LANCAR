package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"

	"lancar/auth-service/internal/handler"
	"lancar/auth-service/internal/middleware"
	"lancar/auth-service/internal/repository"
	"lancar/auth-service/internal/service"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
)

func main() {
	// Load environment variables
	err := godotenv.Load("../../.env")
	if err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// ─────────────────────────────────────────────
	// Database Connection
	// ─────────────────────────────────────────────
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal("Could not connect to database:", err)
	}
	defer db.Close()

	// Configure connection pool (25 max open, 5 idle)
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	if err := db.Ping(); err != nil {
		log.Fatal("Database is unreachable:", err)
	}
	log.Println("[auth-service] Database connection established")

	// ─────────────────────────────────────────────
	// Redis Connection (for rate limiting + OTP store)
	// ─────────────────────────────────────────────
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
		log.Println("[auth-service] REDIS_URL not set, defaulting to localhost:6379")
	}

	redisOpts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("[auth-service] Failed to parse REDIS_URL: %v", err)
	}

	rdb := redis.NewClient(redisOpts)
	defer rdb.Close()

	log.Println("[auth-service] Redis connection established")

	// ─────────────────────────────────────────────
	// Dependency Injection
	// ─────────────────────────────────────────────
	repo := repository.NewPostgresRepository(db)
	svc := service.NewAuthService(repo, repo, repo, repo, repo)
	h := handler.NewAuthHandler(svc)

	mux := http.NewServeMux()

	// ─────────────────────────────────────────────
	// Infrastructure Endpoints (no auth, no rate limit)
	// ─────────────────────────────────────────────
	mux.HandleFunc("/health", handler.HealthHandler)
	mux.HandleFunc("/ready", handler.ReadinessHandlerFunc(db))

	// ─────────────────────────────────────────────
	// API v1 — OTP Endpoints (public + rate limited)
	// OTP send:   3 req / 5 min per IP
	// OTP verify: 5 attempts / 10 min per IP
	// ─────────────────────────────────────────────
	mux.HandleFunc("/api/v1/auth/otp/send",
		middleware.OTPSendChain(rdb, h.RequestOTP))

	mux.HandleFunc("/api/v1/auth/otp/verify",
		middleware.OTPVerifyChain(rdb, h.VerifyOTP))

	// ─────────────────────────────────────────────
	// API v1 — Auth Endpoints (public + rate limited)
	// 20 req / 60s per IP
	// ─────────────────────────────────────────────
	mux.HandleFunc("/api/v1/auth/refresh",
		middleware.AuthRateLimitedChain(rdb, h.RefreshToken))

	mux.HandleFunc("/api/v1/auth/logout",
		middleware.AuthRateLimitedChain(rdb, h.Logout))

	// ─────────────────────────────────────────────
	// API v1 — User Endpoints (requires JWT auth)
	// ─────────────────────────────────────────────
	mux.HandleFunc("/api/v1/auth/register", middleware.AuthChain(h.Register))
	mux.HandleFunc("/api/v1/auth/pin/set", middleware.AuthChain(h.SetPIN))
	mux.HandleFunc("/api/v1/users/me", middleware.AuthChain(h.GetMe))
	mux.HandleFunc("/api/v1/users/me/photo", middleware.AuthChain(h.UpdatePhoto))

	// ─────────────────────────────────────────────
	// API v1 — Courier Endpoints (requires JWT auth)
	// ─────────────────────────────────────────────
	mux.HandleFunc("/api/v1/couriers/register", middleware.AuthChain(h.RegisterCourier))
	mux.HandleFunc("/api/v1/couriers/documents", middleware.AuthChain(h.UploadCourierDocument))
	mux.HandleFunc("/api/v1/couriers/me", middleware.AuthChain(h.GetCourierProfile))

	// ─────────────────────────────────────────────
	// API v1 — Admin Endpoints (requires JWT + role)
	// ─────────────────────────────────────────────
	mux.HandleFunc("/api/v1/admin/users/role", middleware.AdminChain("admin", h.UpdateUserRole))
	mux.HandleFunc("/api/v1/admin/audit-logs", middleware.AdminChain("admin", h.GetAuditLogs))
	mux.HandleFunc("/api/v1/admin/couriers", middleware.AdminChain("admin", h.ListCouriers))
	mux.HandleFunc("/api/v1/admin/couriers/verify", middleware.AdminChain("admin", h.VerifyCourier))
	mux.HandleFunc("/api/v1/admin/couriers/suspend", middleware.AdminChain("admin", h.SuspendCourier))
	mux.HandleFunc("/api/v1/admin/couriers/zones", middleware.AdminChain("admin", h.AssignCourierZone))

	// ─────────────────────────────────────────────
	// Legacy routes (backward-compat: 301 redirect to v1)
	// ─────────────────────────────────────────────
	legacyRoutes := map[string]string{
		"/auth/otp/send":      "/api/v1/auth/otp/send",
		"/auth/otp/verify":    "/api/v1/auth/otp/verify",
		"/auth/refresh":       "/api/v1/auth/refresh",
		"/auth/logout":        "/api/v1/auth/logout",
		"/auth/register":      "/api/v1/auth/register",
		"/auth/pin/set":       "/api/v1/auth/pin/set",
		"/users/me":           "/api/v1/users/me",
		"/couriers/register":  "/api/v1/couriers/register",
		"/couriers/documents": "/api/v1/couriers/documents",
		"/couriers/me":        "/api/v1/couriers/me",
	}
	for legacy, target := range legacyRoutes {
		targetPath := target // capture for closure
		mux.HandleFunc(legacy, func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, targetPath, http.StatusMovedPermanently)
		})
	}

	// ─────────────────────────────────────────────
	// Start Server
	// ─────────────────────────────────────────────
	port := os.Getenv("AUTH_PORT")
	if port == "" {
		port = "8081"
	}

	fmt.Printf("[auth-service] Starting on :%s (API v1 + Redis rate limiting ready)\n", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
