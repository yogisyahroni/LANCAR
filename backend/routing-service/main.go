package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"

	"tembus-backend/internal/featureflags"
	"tembus-backend/internal/observability"
	"tembus-backend/internal/routing"
)

var (
	urlCredentialPattern = regexp.MustCompile(`(?i)\b([a-z][a-z0-9+.\-]*://)([^:@\s/]+):([^@\s/]+)@`)
	longSecretPattern    = regexp.MustCompile(`(?i)\b(?:Bearer\s+)?(?:eyJ[A-Za-z0-9_-]{8,}|[a-f0-9]{32,}|(?:sk|pk|rk|AIza|SG|xox[baprs])[-_A-Za-z0-9]{12,})\b`)
	safeRequestIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)
	traceparentPattern   = regexp.MustCompile(`^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$`)
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
		return fmt.Sprintf("tmb-fallback-%d", time.Now().UnixMilli())
	}
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return fmt.Sprintf("tmb-%s-%d", string(b), time.Now().UnixMilli()%10000)
}

func randomHex(bytesLength int) string {
	buffer := make([]byte, bytesLength)
	if _, err := rand.Read(buffer); err != nil {
		return strings.Repeat("0", bytesLength*2)
	}
	return fmt.Sprintf("%x", buffer)
}

func isAllZeroHex(value string) bool {
	for _, char := range value {
		if char != '0' {
			return false
		}
	}
	return true
}

func safeHeaderID(value string) string {
	candidate := strings.TrimSpace(value)
	if candidate == "" || !safeRequestIDPattern.MatchString(candidate) {
		return ""
	}
	return candidate
}

func sanitizeTraceparent(value string) string {
	candidate := strings.TrimSpace(value)
	matches := traceparentPattern.FindStringSubmatch(candidate)
	if len(matches) != 4 {
		return ""
	}
	if isAllZeroHex(matches[1]) || isAllZeroHex(matches[2]) {
		return ""
	}
	return candidate
}

func generateTraceparent() string {
	traceID := randomHex(16)
	spanID := randomHex(8)
	if isAllZeroHex(traceID) {
		traceID = strings.Repeat("1", 32)
	}
	if isAllZeroHex(spanID) {
		spanID = strings.Repeat("1", 16)
	}
	return fmt.Sprintf("00-%s-%s-01", traceID, spanID)
}

func traceIDFromTraceparent(traceparent string) string {
	parts := strings.Split(traceparent, "-")
	if len(parts) != 4 {
		return ""
	}
	return parts[1]
}

func spanIDFromTraceparent(traceparent string) string {
	parts := strings.Split(traceparent, "-")
	if len(parts) != 4 {
		return ""
	}
	return parts[2]
}

func requestLogMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		requestID := safeHeaderID(r.Header.Get("X-Request-ID"))
		if requestID == "" {
			requestID = generateRequestID()
		}
		correlationID := safeHeaderID(r.Header.Get("X-Correlation-ID"))
		if correlationID == "" {
			correlationID = requestID
		}
		traceparent, traceID, spanID := observability.CurrentTraceContext(r.Context())
		if traceparent == "" {
			traceparent = sanitizeTraceparent(r.Header.Get("traceparent"))
			if traceparent == "" {
				traceparent = generateTraceparent()
			}
			traceID = traceIDFromTraceparent(traceparent)
			spanID = spanIDFromTraceparent(traceparent)
		}
		observability.AnnotateRequest(r.Context(), requestID)

		r.Header.Set("X-Correlation-ID", correlationID)
		r.Header.Set("X-Request-ID", requestID)
		r.Header.Set("traceparent", traceparent)
		w.Header().Set("X-Correlation-ID", correlationID)
		w.Header().Set("X-Request-ID", requestID)
		w.Header().Set("X-Trace-ID", traceID)

		recorder := &statusRecorder{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(recorder, r)
		logJSON("info", "request completed", map[string]interface{}{
			"correlation_id": correlationID,
			"request_id":     requestID,
			"trace_id":       traceID,
			"span_id":        spanID,
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

type routeModelRequest struct {
	Pickup  routing.Coordinate `json:"pickup"`
	Dropoff routing.Coordinate `json:"dropoff"`
	UserID  string             `json:"user_id"`
}

type routeModelResponse struct {
	Success bool   `json:"success"`
	Model   string `json:"model,omitempty"`
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		logJSON("error", "failed to encode response", map[string]interface{}{"error": err.Error()})
	}
}

func routeModelHandler(engine *routing.RoutingEngine) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, routeModelResponse{
				Success: false,
				Code:    "ERR_METHOD_NOT_ALLOWED",
				Message: "method not allowed",
			})
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
		defer r.Body.Close()

		var payload routeModelRequest
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, routeModelResponse{
				Success: false,
				Code:    "ERR_INVALID_ROUTE_PAYLOAD",
				Message: "invalid route payload",
			})
			return
		}

		model, err := engine.SelectModel(r.Context(), routing.OrderRequest{
			Pickup:  payload.Pickup,
			Dropoff: payload.Dropoff,
			UserID:  payload.UserID,
		})
		if err != nil {
			writeJSON(w, http.StatusUnprocessableEntity, routeModelResponse{
				Success: false,
				Code:    "ERR_ROUTE_UNAVAILABLE",
				Message: "route is unavailable",
			})
			return
		}

		writeJSON(w, http.StatusOK, routeModelResponse{
			Success: true,
			Model:   string(model),
		})
	}
}

func main() {
	// Centralized .env loading. We go up two directories to find the root .env
	envPath := filepath.Join("..", "..", ".env")
	if err := godotenv.Load(envPath); err != nil {
		logJSON("info", "env file not loaded, relying on environment", map[string]interface{}{"path": envPath})
	}
	validateProductionSecrets()

	shutdownTracing, err := observability.InitTracing(context.Background(), "routing-service")
	if err != nil {
		log.Fatalf("failed to initialize tracing: %v", err)
	}
	defer observability.ShutdownWithTimeout(shutdownTracing)

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

	logJSON("info", "routing service initialized", map[string]interface{}{"feature_flags": "dual-db"})

	// Start minimal HTTP server for health checks
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status": "UP", "service": "routing-service"}`))
	})
	mux.HandleFunc("/api/v1/routing/model", routeModelHandler(routingEngine))

	port := os.Getenv("ROUTING_SERVICE_PORT")
	if port == "" {
		port = "8082"
	}

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      observability.HTTPHandler(requestLogMiddleware(mux), "routing-service"),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	logJSON("info", "routing service starting", map[string]interface{}{"port": port})
	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- server.ListenAndServe()
	}()

	shutdownSignals := make(chan os.Signal, 1)
	signal.Notify(shutdownSignals, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-serverErrors:
		if err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start HTTP server: %v", err)
		}
	case signalValue := <-shutdownSignals:
		logJSON("info", "shutdown requested", map[string]interface{}{"signal": signalValue.String()})
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			logJSON("error", "graceful shutdown failed", map[string]interface{}{"error": err.Error()})
			_ = server.Close()
		}
	}
}
