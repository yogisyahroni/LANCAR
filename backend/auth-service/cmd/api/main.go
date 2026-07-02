package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"tembus/auth-service/internal/domain"
	"tembus/auth-service/internal/handler"
	"tembus/auth-service/internal/middleware"
	"tembus/auth-service/internal/observability"
	"tembus/auth-service/internal/repository"
	"tembus/auth-service/internal/service"
	"tembus/auth-service/pkg/logger"
	"tembus/auth-service/pkg/sentry"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	httpSwagger "github.com/swaggo/http-swagger"
	_ "tembus/auth-service/internal/handler/docs"
)

// @title TEMBUS Identity Service API
// @version 1.0
// @description API for Authentication, Courier Onboarding, and User Management.
// @termsOfService http://swagger.io/terms/

// @contact.name API Support
// @contact.url http://www.tembus.id/support
// @contact.email support@tembus.id

// @license.name Apache 2.0
// @license.url http://www.apache.org/licenses/LICENSE-2.0.html

// @host localhost:8081
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
	requireStrongSecret("JWT_SECRET", 32)
	requireStrongSecret("OTP_HASH_PEPPER", 32)
}

func main() {
	// Load environment variables
	err := godotenv.Load("../../.env")
	if err != nil {
		log.Println("No .env file found, using system environment variables")
	}
	validateProductionSecrets()

	// LAUNCH-1+2: Logger & Sentry (both no-op if not configured)
	logger.Info("Starting auth-service", "environment", os.Getenv("ENVIRONMENT"))
	sentry.Init()
	defer sentry.Flush()

	shutdownTracing, err := observability.InitTracing(context.Background(), "auth-service")
	if err != nil {
		log.Fatalf("[auth-service] failed to initialize tracing: %v", err)
	}
	defer observability.ShutdownWithTimeout(shutdownTracing)

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
		if isProductionRuntime() {
			log.Fatal("REDIS_URL is required in production")
		}
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
	// Storage Service (Local vs S3)
	// ─────────────────────────────────────────────
	var storageSvc service.StorageService
	storageDriver := os.Getenv("STORAGE_DRIVER")
	uploadPath := os.Getenv("UPLOAD_PATH")
	if uploadPath == "" {
		uploadPath = "./uploads"
	}

	if storageDriver == "s3" {
		region := os.Getenv("AWS_REGION")
		bucket := os.Getenv("S3_BUCKET")
		var s3Err error
		storageSvc, s3Err = service.NewS3Storage(region, bucket)
		if s3Err != nil {
			log.Fatalf("[auth-service] Failed to initialize S3 storage: %v", s3Err)
		}
		log.Println("[auth-service] Using S3 storage")
	} else {
		uploadURL := os.Getenv("UPLOAD_URL")
		if uploadURL == "" {
			uploadURL = "http://localhost:8081/uploads"
		}
		var localErr error
		storageSvc, localErr = service.NewLocalStorage(uploadPath, uploadURL)
		if localErr != nil {
			log.Fatalf("[auth-service] Failed to initialize local storage: %v", localErr)
		}
		log.Println("[auth-service] Using local storage")
	}

	// ─────────────────────────────────────────────
	// Liveness Service (Mock vs Verihubs)
	// ─────────────────────────────────────────────
	var livenessSvc service.LivenessService
	livenessDriver := os.Getenv("LIVENESS_DRIVER")

	if livenessDriver == "verihubs" {
		appID := os.Getenv("VERIHUBS_APP_ID")
		apiKey := os.Getenv("VERIHUBS_API_KEY")
		livenessSvc = service.NewVerihubsLiveness(appID, apiKey)
		log.Println("[auth-service] Using Verihubs liveness detection")
	} else {
		livenessSvc = service.NewLivenessService()
		log.Println("[auth-service] Using mock liveness detection")
	}

	repo := repository.NewPostgresRepository(db, readDB)
	deviceFpRepo := repository.NewDeviceFingerprintRepository(db)
	emailSvc := service.NewEmailService()
	svc := service.NewAuthService(repo, repo, repo, repo, repo, deviceFpRepo, livenessSvc, storageSvc, emailSvc)
	authAbuseProtector := middleware.NewAuthAbuseProtector(rdb)
	h := handler.NewAuthHandler(svc, authAbuseProtector)
	s3PresignHandler := handler.NewS3PresignHandler(storageSvc)

	// ─────────────────────────────────────────────
	// Google Auth + Zenziva OTP Service
	// ─────────────────────────────────────────────
	googleWebClientID := os.Getenv("GOOGLE_CUSTOMER_WEB_CLIENT_ID")
	googleAndroidClientID := os.Getenv("GOOGLE_CUSTOMER_ANDROID_CLIENT_ID")
	googleAuthSvc := service.NewGoogleAuthService(repo, deviceFpRepo, googleWebClientID, googleAndroidClientID)

	// Select OTP provider: live Zenziva or dry-run
	otpProviderName := strings.ToLower(strings.TrimSpace(os.Getenv("OTP_PROVIDER")))
	if otpProviderName == "zenziva" {
		zenvProvider, zenvErr := service.NewZenzivaOTPProvider()
		if zenvErr != nil {
			if isProductionRuntime() {
				log.Fatalf("[auth-service] Zenziva provider init failed in production: %v", zenvErr)
			}
			log.Printf("[auth-service] WARNING: Zenziva provider init failed (%v), falling back to dry-run", zenvErr)
		} else {
			googleAuthSvc.SetOTPProvider(zenvProvider)
			log.Println("[auth-service] OTP provider: Zenziva (live)")
		}
	} else {
		log.Println("[auth-service] OTP provider: dry-run (set OTP_PROVIDER=zenziva for live)")
	}

	gh := handler.NewGoogleAuthHandler(googleAuthSvc, authAbuseProtector)

	mux := http.NewServeMux()

	// ─────────────────────────────────────────────
	// Infrastructure Endpoints (no auth, no rate limit)
	// ─────────────────────────────────────────────
	mux.HandleFunc("/health", handler.HealthHandler)
	mux.HandleFunc("/ready", handler.ReadinessHandlerFunc(db)) // Check writer for readiness

	// Swagger Documentation (Secure in Production)
	mux.Handle("/swagger/", httpSwagger.WrapHandler)

	// ─────────────────────────────────────────────
	// API v1 — OTP Endpoints (public + rate limited)
	// OTP send:   3 req / 5 min per IP
	// OTP verify: 5 attempts / 10 min per IP
	// ─────────────────────────────────────────────
	mux.HandleFunc("/api/v1/auth/otp/send",
		middleware.OTPSendChain(rdb, h.RequestOTP))

	mux.HandleFunc("/api/v1/auth/otp/verify",
		middleware.OTPVerifyChain(rdb, middleware.DeviceIntegrityMiddleware(repo, h.VerifyOTP)))

	mux.HandleFunc("/api/v1/auth/customer/login/start",
		middleware.AuthRateLimitedChain(rdb, h.StartCustomerPasswordLogin))

	mux.HandleFunc("/api/v1/auth/customer/register/start",
		middleware.AuthRateLimitedChain(rdb, h.StartCustomerPasswordRegistration))

	mux.HandleFunc("/api/v1/auth/password-reset/request",
		middleware.AuthRateLimitedChain(rdb, h.RequestCustomerPasswordReset))

	mux.HandleFunc("/api/v1/auth/password-reset/confirm",
		middleware.AuthRateLimitedChain(rdb, h.ConfirmCustomerPasswordReset))

	// ─────────────────────────────────────────────
	// API v1 — Customer Google Auth (public + rate limited)
	// Enforces AuthAbuseProtector inside GoogleAuthHandler itself.
	// ─────────────────────────────────────────────
	mux.HandleFunc("/api/v1/auth/customer/google/start",
		middleware.AuthRateLimitedChain(rdb, gh.StartGoogleAuth))

	mux.HandleFunc("/api/v1/auth/customer/google/complete",
		middleware.AuthRateLimitedChain(rdb, gh.CompleteGoogleAuth))

	mux.HandleFunc("/api/v1/auth/customer/google/link",
		middleware.AuthChain(gh.LinkGoogleAccount))

	// ─────────────────────────────────────────────
	// API v1 — Customer OTP (new Zenziva-backed flow)
	// ─────────────────────────────────────────────
	mux.HandleFunc("/api/v1/auth/customer/otp/send",
		middleware.AuthRateLimitedChain(rdb, gh.SendCustomerOTP))

	mux.HandleFunc("/api/v1/auth/customer/otp/verify",
		middleware.AuthRateLimitedChain(rdb, gh.VerifyCustomerOTP))

	// Zenziva delivery status webhook (public, HMAC signature verified inside handler)
	mux.HandleFunc("/api/v1/auth/providers/zenziva/webhook", gh.HandleZenzivaWebhook)

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
	// API v1 — Storage Endpoints (requires JWT auth)
	// ─────────────────────────────────────────────
	mux.HandleFunc("/api/v1/auth/presign", middleware.AuthChain(s3PresignHandler.GeneratePresignedURL))

	// ─────────────────────────────────────────────
	// API v1 — Courier Endpoints (requires JWT auth)
	// ─────────────────────────────────────────────
	mux.HandleFunc("/api/v1/couriers/register", middleware.MobileAuthIntegrityChain(repo, h.RegisterCourier))
	mux.HandleFunc("/api/v1/couriers/documents", middleware.MobileAuthIntegrityChain(repo, h.UploadCourierDocument))
	mux.HandleFunc("/api/v1/couriers/me", middleware.MobileAuthIntegrityChain(repo, h.GetCourierProfile))
	mux.HandleFunc("/api/v1/couriers/verify-liveness", middleware.MobileAuthIntegrityChain(repo, h.VerifyLiveness))
	mux.HandleFunc("/api/v1/couriers/local-security-log", middleware.MobileAuthIntegrityChain(repo, h.LogLocalSecurity))

	// ─────────────────────────────────────────────
	// API v1 — Admin Endpoints (requires JWT + role + 2FA for sensitive)
	// ─────────────────────────────────────────────
	mux.HandleFunc("/api/v1/admin/users", middleware.Permission2FAChain(domain.PermManageUsers, h.CreateAdminUser))
	mux.HandleFunc("/api/v1/admin/users/role", middleware.Permission2FAChain(domain.PermManageUsers, h.UpdateUserRole))
	mux.HandleFunc("/api/v1/admin/audit-logs", middleware.Permission2FAChain(domain.PermViewAuditLogs, h.GetAuditLogs))
	mux.HandleFunc("/api/v1/admin/couriers", middleware.PermissionChain(domain.PermManageCouriers, h.ListCouriers))
	mux.HandleFunc("/api/v1/admin/couriers/verify", middleware.Permission2FAChain(domain.PermManageCouriers, h.VerifyCourier))
	mux.HandleFunc("/api/v1/admin/couriers/suspend", middleware.Permission2FAChain(domain.PermManageCouriers, h.SuspendCourier))
	mux.HandleFunc("/api/v1/admin/couriers/zones", middleware.Permission2FAChain(domain.PermManageCouriers, h.AssignCourierZone))
	mux.HandleFunc("PATCH /api/v1/admin/couriers/{id}/profile-photo", middleware.Permission2FAChain(domain.PermManageCouriers, h.HandleAdminSetCourierProfilePhoto))

	// ─────────────────────────────────────────────
	// Static Files (only if not using S3)
	if storageDriver != "s3" {
		uploadFileServer := http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadPath)))
		mux.HandleFunc("/uploads/", middleware.AuthChain(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "private, no-store")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			uploadFileServer.ServeHTTP(w, r)
		}))
	}

	// ─────────────────────────────────────────────
	// Legacy routes (backward-compat: 301 redirect to v1)
	// ─────────────────────────────────────────────
	legacyRoutes := map[string]string{
		"/auth/otp/send":               "/api/v1/auth/otp/send",
		"/auth/otp/verify":             "/api/v1/auth/otp/verify",
		"/auth/password-reset/request": "/api/v1/auth/password-reset/request",
		"/auth/password-reset/confirm": "/api/v1/auth/password-reset/confirm",
		"/auth/refresh":                "/api/v1/auth/refresh",
		"/auth/logout":                 "/api/v1/auth/logout",
		"/auth/register":               "/api/v1/auth/register",
		"/auth/pin/set":                "/api/v1/auth/pin/set",
		"/users/me":                    "/api/v1/users/me",
		"/couriers/register":           "/api/v1/couriers/register",
		"/couriers/documents":          "/api/v1/couriers/documents",
		"/couriers/me":                 "/api/v1/couriers/me",
	}
	for legacy, target := range legacyRoutes {
		targetPath := target // capture for closure
		mux.HandleFunc(legacy, func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, targetPath, http.StatusMovedPermanently)
		})
	}

	// ─────────────────────────────────────────────
	// Prometheus Metrics
	// ─────────────────────────────────────────────
	mux.Handle("/metrics", promhttp.Handler())

	// ─────────────────────────────────────────────
	// Start Server
	// ─────────────────────────────────────────────
	port := os.Getenv("AUTH_PORT")
	if port == "" {
		port = "8081"
	}

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      observability.HTTPHandler(mux, "auth-service"),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	fmt.Printf("[auth-service] Starting on :%s (API v1 + Redis rate limiting ready)\n", port)
	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- server.ListenAndServe()
	}()

	shutdownSignals := make(chan os.Signal, 1)
	signal.Notify(shutdownSignals, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-serverErrors:
		if err != nil && err != http.ErrServerClosed {
			log.Fatalf("[auth-service] server failed: %v", err)
		}
	case signalValue := <-shutdownSignals:
		log.Printf("[auth-service] shutdown requested: %s", signalValue.String())
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("[auth-service] graceful shutdown failed: %v", err)
			_ = server.Close()
		}
	}
}
