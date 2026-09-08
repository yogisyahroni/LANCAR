package main

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	platform "tembus/developer-platform-service/internal"

	_ "github.com/lib/pq"
)

func main() {
	environment := strings.ToLower(envOr("DEVELOPER_ENVIRONMENT", envOr("ENVIRONMENT", "development")))
	if environment == "production" {
		requireProductionSecret("JWT_SECRET", 32)
		requireProductionSecret("INTERNAL_API_KEY", 16)
	}
	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		log.Fatalf("open developer platform database: %v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxIdleTime(5 * time.Minute)

	startupContext, startupCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer startupCancel()
	if err := db.PingContext(startupContext); err != nil {
		log.Fatalf("ping developer platform database: %v", err)
	}

	encryptionKey := strings.TrimSpace(os.Getenv("DEVELOPER_WEBHOOK_ENCRYPTION_KEY"))
	if encryptionKey == "" && environment != "production" {
		// Development-only fallback. Compose and every deployed environment should
		// set a unique 32-byte key explicitly.
		encryptionKey = "developer-platform-local-key-32b"
	}
	key, err := platform.NewEncryptionKey(encryptionKey)
	if err != nil {
		log.Fatal(err)
	}
	secretBox, err := platform.NewSecretBox(key)
	if err != nil {
		log.Fatal(err)
	}

	store := platform.NewStore(db, secretBox)
	orderClient := platform.NewOrderClient(
		envOr("ORDER_SERVICE_URL", "http://localhost:8083"),
		os.Getenv("JWT_SECRET"),
	)
	handler := platform.NewHandler(
		store,
		orderClient,
		os.Getenv("INTERNAL_API_KEY"),
		environment,
	)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("OK"))
	})
	mux.HandleFunc("/ready", func(w http.ResponseWriter, r *http.Request) {
		if err := db.PingContext(r.Context()); err != nil {
			http.Error(w, "NOT READY", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("READY"))
	})
	mux.Handle("/api/v1/developer/", handler)
	mux.Handle("/internal/developer/clients", handler)

	port := envOr("DEVELOPER_PLATFORM_PORT", "8090")
	server := &http.Server{
		Addr:              ":" + port,
		Handler:           requestLog(mux),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	go handler.RunWorkers(ctx, durationEnv("DEVELOPER_WEBHOOK_WORKER_INTERVAL", 5*time.Second))

	go func() {
		<-ctx.Done()
		shutdownContext, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()
		if err := server.Shutdown(shutdownContext); err != nil {
			log.Printf("developer platform shutdown: %v", err)
		}
	}()

	slog.Default().Info("developer platform service starting", "environment", environment, "port", port)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("developer platform server: %v", err)
	}
}

func envOr(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func requireProductionSecret(name string, minimumLength int) {
	value := strings.TrimSpace(os.Getenv(name))
	if len(value) < minimumLength || strings.Contains(strings.ToLower(value), "changeme") || strings.Contains(strings.ToLower(value), "placeholder") {
		log.Fatalf("%s must be a strong production secret of at least %d characters", name, minimumLength)
	}
}

func durationEnv(name string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	duration, err := time.ParseDuration(value)
	if err != nil || duration <= 0 {
		return fallback
	}
	return duration
}

func requestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		slog.Default().InfoContext(r.Context(), "developer platform request",
			"method", r.Method, "path", r.URL.Path, "duration_ms", time.Since(started).Milliseconds())
	})
}
