package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"

	"lancar-backend/internal/featureflags"
	"lancar-backend/internal/routing"
)

var (
	urlCredentialPattern = regexp.MustCompile(`(?i)\b([a-z][a-z0-9+.\-]*://)([^:@\s/]+):([^@\s/]+)@`)
	longSecretPattern    = regexp.MustCompile(`(?i)\b(?:Bearer\s+)?(?:eyJ[A-Za-z0-9_-]{8,}|[a-f0-9]{32,}|(?:sk|pk|rk|AIza|SG|xox[baprs])[-_A-Za-z0-9]{12,})\b`)
)

type statusRecorder struct {
	http.ResponseWriter
	statusCode int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.statusCode = code
	r.ResponseWriter.WriteHeader(code)
}

func redactLogString(value string) string {
	value = urlCredentialPattern.ReplaceAllString(value, "${1}[REDACTED]@")
	return longSecretPattern.ReplaceAllString(value, "[REDACTED]")
}

func logJSON(level string, message string, fields map[string]interface{}) {
	event := map[string]interface{}{
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"level":     level,
		"service":   "routing-service",
		"message":   redactLogString(message),
	}
	for key, value := range fields {
		if text, ok := value.(string); ok {
			event[key] = redactLogString(text)
			continue
		}
		event[key] = value
	}
	payload, err := json.Marshal(event)
	if err != nil {
		log.Print(`{"level":"error","service":"routing-service","message":"failed to serialize log event"}`)
		return
	}
	log.Print(string(payload))
}

func generateRequestID() string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("lnc-fallback-%d", time.Now().UnixMilli())
	}
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return fmt.Sprintf("lnc-%s-%d", string(b), time.Now().UnixMilli()%10000)
}

func requestLogMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		correlationID := strings.TrimSpace(r.Header.Get("X-Correlation-ID"))
		if correlationID == "" {
			correlationID = generateRequestID()
		}
		requestID := strings.TrimSpace(r.Header.Get("X-Request-ID"))
		if requestID == "" {
			requestID = generateRequestID()
		}
		w.Header().Set("X-Correlation-ID", correlationID)
		w.Header().Set("X-Request-ID", requestID)

		recorder := &statusRecorder{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(recorder, r)
		logJSON("info", "request completed", map[string]interface{}{
			"correlation_id": correlationID,
			"request_id":     requestID,
			"method":         r.Method,
			"path":           r.URL.Path,
			"status":         recorder.statusCode,
			"duration_ms":    time.Since(start).Milliseconds(),
			"ip":             r.RemoteAddr,
			"user_agent":     r.UserAgent(),
		})
	})
}

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
}

func main() {
	// Centralized .env loading. We go up two directories to find the root .env
	envPath := filepath.Join("..", "..", ".env")
	if err := godotenv.Load(envPath); err != nil {
		logJSON("info", "env file not loaded, relying on environment", map[string]interface{}{"path": envPath})
	}
	validateProductionSecrets()

	dbUrl := os.Getenv("DATABASE_URL")
	if dbUrl == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	readDbUrl := os.Getenv("READ_DATABASE_URL")
	if readDbUrl == "" {
		readDbUrl = dbUrl
	}

	redisUrl := os.Getenv("REDIS_URL")
	if redisUrl == "" {
		log.Fatal("REDIS_URL is not set")
	}

	// Connect to Primary Database (Writer)
	db, err := sql.Open("postgres", dbUrl)
	if err != nil {
		log.Fatalf("Failed to connect to primary database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping primary database: %v", err)
	}
	logJSON("info", "primary database connected", map[string]interface{}{})

	// Connect to Read Replica Database (Reader)
	readDB, err := sql.Open("postgres", readDbUrl)
	if err != nil {
		log.Fatalf("Failed to connect to read replica database: %v", err)
	}
	defer readDB.Close()

	if err := readDB.Ping(); err != nil {
		log.Fatalf("Failed to ping read replica database: %v", err)
	}
	logJSON("info", "read database connected", map[string]interface{}{})

	// Connect to Redis
	opts, err := redis.ParseURL(redisUrl)
	if err != nil {
		log.Fatalf("Failed to parse redis URL: %v", err)
	}
	rdb := redis.NewClient(opts)
	defer rdb.Close()

	logJSON("info", "redis connected", map[string]interface{}{})

	// Initialize route selector dependencies with database-backed zone resolution.
	flagReader := featureflags.NewFlagReader(db, readDB, rdb)
	defer flagReader.Close()
	routingEngine := routing.NewRoutingEngineWithZoneResolver(flagReader, routing.NewPostgresZoneResolver(readDB))
	_ = routingEngine

	logJSON("info", "routing service initialized", map[string]interface{}{"feature_flags": "dual-db"})

	// Start minimal HTTP server for health checks
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status": "UP", "service": "routing-service"}`))
	})

	port := os.Getenv("ROUTING_SERVICE_PORT")
	if port == "" {
		port = "8082"
	}

	logJSON("info", "routing service starting", map[string]interface{}{"port": port})
	if err := http.ListenAndServe(":"+port, requestLogMiddleware(mux)); err != nil {
		log.Fatalf("Failed to start HTTP server: %v", err)
	}
}
