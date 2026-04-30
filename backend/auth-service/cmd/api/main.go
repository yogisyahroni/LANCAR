package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"

	"lancar/auth-service/internal/domain"
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
	// Database Connection (Read/Write Split)
	// ─────────────────────────────────────────────
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	readDBURL := os.Getenv("READ_DATABASE_URL")
	if readDBURL == "" {
		readDBURL = dbURL
		log.Println("[auth-service] READ_DATABASE_URL not set, falling back to primary DB")
	}

	// Writer DB
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal("Could not connect to writer database:", err)
	}
	defer db.Close()

	// Reader DB
	readDB, err := sql.Open("postgres", readDBURL)
	if err != nil {
		log.Fatal("Could not connect to reader database:", err)
	}
	defer readDB.Close()

	// Configure connection pools
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	readDB.SetMaxOpenConns(25)
	readDB.SetMaxIdleConns(5)

	if err := db.Ping(); err != nil {
		log.Fatal("Writer database is unreachable:", err)
	}
	if err := readDB.Ping(); err != nil {
		log.Fatal("Reader database is unreachable:", err)
	}
	log.Println("[auth-service] Database connections (R/W split) established")

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
	uploadPath := os.Getenv("UPLOAD_PATH")
	if uploadPath == "" {
		uploadPath = "./uploads"
	}
	uploadURL := os.Getenv("UPLOAD_URL")
	if uploadURL == "" {
		uploadURL = "http://localhost:8081/uploads"
	}

	storageSvc, err := service.NewLocalStorage(uploadPath, uploadURL)
	if err != nil {
		log.Fatalf("[auth-service] Failed to initialize storage: %v", err)
	}

	livenessSvc := service.NewLivenessService()

	repo := repository.NewPostgresRepository(db, readDB)
	svc := service.NewAuthService(repo, repo, repo, repo, repo, livenessSvc, storageSvc)
	h := handler.NewAuthHandler(svc)

	mux := http.NewServeMux()

	// ─────────────────────────────────────────────
	// Infrastructure Endpoints (no auth, no rate limit)
	// ─────────────────────────────────────────────
	mux.HandleFunc("/health", handler.HealthHandler)
	mux.HandleFunc("/ready", handler.ReadinessHandlerFunc(db)) // Check writer for readiness

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

	mux.HandleFunc("/api/v1/auth/2fa/complete",
		middleware.AuthRateLimitedChain(rdb, h.Complete2FALogin))

	// ─────────────────────────────────────────────
	// API v1 — User Endpoints (requires JWT auth)
	// ─────────────────────────────────────────────
	mux.HandleFunc("/api/v1/auth/register", middleware.AuthChain(h.Register))
	mux.HandleFunc("/api/v1/auth/pin/set", middleware.AuthChain(h.SetPIN))
	mux.HandleFunc("/api/v1/auth/2fa/setup", middleware.AuthChain(h.Setup2FA))
	mux.HandleFunc("/api/v1/auth/2fa/verify", middleware.AuthChain(h.Verify2FA))
	mux.HandleFunc("/api/v1/users/me", middleware.AuthChain(h.GetMe))
	mux.HandleFunc("/api/v1/users/me/photo", middleware.AuthChain(h.UpdatePhoto))

	// ─────────────────────────────────────────────
	// API v1 — Courier Endpoints (requires JWT auth)
	// ─────────────────────────────────────────────
	mux.HandleFunc("/api/v1/couriers/register", middleware.AuthChain(h.RegisterCourier))
	mux.HandleFunc("/api/v1/couriers/documents", middleware.AuthChain(h.UploadCourierDocument))
	mux.HandleFunc("/api/v1/couriers/me", middleware.AuthChain(h.GetCourierProfile))

	// ─────────────────────────────────────────────
	// API v1 — Admin Endpoints (requires JWT + role + 2FA for sensitive)
	// ─────────────────────────────────────────────
	mux.HandleFunc("/api/v1/admin/users", middleware.Permission2FAChain(repo, domain.PermManageUsers, h.CreateAdminUser))
	mux.HandleFunc("/api/v1/admin/users/role", middleware.Permission2FAChain(repo, domain.PermManageUsers, h.UpdateUserRole))
	mux.HandleFunc("/api/v1/admin/audit-logs", middleware.Permission2FAChain(repo, domain.PermViewAuditLogs, h.GetAuditLogs))
	mux.HandleFunc("/api/v1/admin/couriers", middleware.PermissionChain(repo, domain.PermManageCouriers, h.ListCouriers))
	mux.HandleFunc("/api/v1/admin/couriers/verify", middleware.Permission2FAChain(repo, domain.PermManageCouriers, h.VerifyCourier))
	mux.HandleFunc("/api/v1/admin/couriers/suspend", middleware.Permission2FAChain(repo, domain.PermManageCouriers, h.SuspendCourier))
	mux.HandleFunc("/api/v1/admin/couriers/zones", middleware.Permission2FAChain(repo, domain.PermManageCouriers, h.AssignCourierZone))

	// ─────────────────────────────────────────────
	// Static Files (for local storage)
	// ─────────────────────────────────────────────
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadPath))))

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
