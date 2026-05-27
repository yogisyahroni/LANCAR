package middleware

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"runtime/debug"
	"strings"
	"time"
)

type contextKey string

const correlationIDKey contextKey = "correlation_id"
const requestIDKey contextKey = "request_id"
const correlationIDHeader = "X-Correlation-ID"
const requestIDHeader = "X-Request-ID"

var (
	emailPattern         = regexp.MustCompile(`(?i)\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b`)
	phonePattern         = regexp.MustCompile(`(?m)(^|[^\d])((?:\+?62|0)8[\d\s-]{7,15}\d)([^\d]|$)`)
	jwtPattern           = regexp.MustCompile(`\beyJ[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}\b`)
	bearerPattern        = regexp.MustCompile(`(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b`)
	apiKeyPattern        = regexp.MustCompile(`\b(?:sk|pk|rk|AIza|SG|xox[baprs])[-_A-Za-z0-9]{12,}\b`)
	longHexPattern       = regexp.MustCompile(`(?i)\b[a-f0-9]{32,}\b`)
	urlCredentialPattern = regexp.MustCompile(`(?i)\b([a-z][a-z0-9+.\-]*://)([^:@\s/]+):([^@\s/]+)@`)
)

type structuredLogEvent map[string]interface{}

func CorrelationIDMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		correlationID := r.Header.Get(correlationIDHeader)
		if correlationID == "" {
			correlationID = generateCorrelationID()
		}
		requestID := r.Header.Get(requestIDHeader)
		if requestID == "" {
			requestID = generateCorrelationID()
		}
		ctx := context.WithValue(r.Context(), correlationIDKey, correlationID)
		ctx = context.WithValue(ctx, requestIDKey, requestID)
		w.Header().Set(correlationIDHeader, correlationID)
		w.Header().Set(requestIDHeader, requestID)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

func GetCorrelationID(ctx context.Context) string {
	if v, ok := ctx.Value(correlationIDKey).(string); ok {
		return v
	}
	return ""
}

func GetRequestID(ctx context.Context) string {
	if v, ok := ctx.Value(requestIDKey).(string); ok {
		return v
	}
	return ""
}

func generateCorrelationID() string {
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

func RedactString(value string) string {
	value = urlCredentialPattern.ReplaceAllString(value, "${1}[REDACTED]@")
	value = bearerPattern.ReplaceAllString(value, "Bearer [REDACTED]")
	value = jwtPattern.ReplaceAllString(value, "[REDACTED]")
	value = apiKeyPattern.ReplaceAllString(value, "[REDACTED]")
	value = emailPattern.ReplaceAllString(value, "[REDACTED_EMAIL]")
	value = phonePattern.ReplaceAllString(value, "${1}[REDACTED_PHONE]${3}")
	value = longHexPattern.ReplaceAllString(value, "[REDACTED]")
	return value
}

func LogJSON(level string, message string, fields structuredLogEvent) {
	event := structuredLogEvent{
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"level":     level,
		"service":   "order-service",
		"message":   RedactString(message),
	}
	for key, value := range fields {
		if text, ok := value.(string); ok {
			event[key] = RedactString(text)
			continue
		}
		event[key] = value
	}
	payload, err := json.Marshal(event)
	if err != nil {
		log.Printf(`{"timestamp":"%s","level":"error","service":"order-service","message":"failed to serialize log event"}`, time.Now().UTC().Format(time.RFC3339Nano))
		return
	}
	log.Print(string(payload))
}

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func newResponseWriter(w http.ResponseWriter) *responseWriter {
	return &responseWriter{w, http.StatusOK}
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func RequestLoggerMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := newResponseWriter(w)

		next.ServeHTTP(rw, r)

		duration := time.Since(start)
		correlationID := GetCorrelationID(r.Context())

		LogJSON("info", "request completed", structuredLogEvent{
			"correlation_id": correlationID,
			"request_id":     GetRequestID(r.Context()),
			"method":         r.Method,
			"path":           r.URL.Path,
			"status":         rw.statusCode,
			"duration_ms":    duration.Milliseconds(),
			"ip":             realIP(r),
			"user_agent":     r.UserAgent(),
		})
	}
}

func realIP(r *http.Request) string {
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		return strings.Split(ip, ",")[0]
	}
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	return r.RemoteAddr
}

func RecoveryMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				correlationID := GetCorrelationID(r.Context())
				LogJSON("error", "panic recovered", structuredLogEvent{
					"correlation_id": correlationID,
					"request_id":     GetRequestID(r.Context()),
					"error":          fmt.Sprint(err),
					"stack":          string(debug.Stack()),
				})
				WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "An unexpected error occurred", correlationID)
			}
		}()
		next.ServeHTTP(w, r)
	}
}

func CORSMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowedOrigins := map[string]bool{
			"http://localhost:3000":    true,
			"http://localhost:5173":    true,
			"https://admin.tembus.app": true,
			"https://app.tembus.app":   true,
		}

		if allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Correlation-ID")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	}
}

func SecurityHeadersMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
		w.Header().Set("Content-Security-Policy", "default-src 'self'")
		next.ServeHTTP(w, r)
	}
}

type ErrorResponse struct {
	Success       bool   `json:"success"`
	Code          string `json:"code"`
	Message       string `json:"message"`
	CorrelationID string `json:"correlation_id,omitempty"`
}

func WriteError(w http.ResponseWriter, status int, code, message, correlationID string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(ErrorResponse{
		Success:       false,
		Code:          code,
		Message:       message,
		CorrelationID: correlationID,
	})
}

type SuccessResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data"`
}

func WriteSuccess(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(SuccessResponse{
		Success: true,
		Data:    data,
	})
}

func Chain(h http.HandlerFunc, middlewares ...func(http.HandlerFunc) http.HandlerFunc) http.HandlerFunc {
	for i := len(middlewares) - 1; i >= 0; i-- {
		h = middlewares[i](h)
	}
	return h
}

func BaseChain(h http.HandlerFunc) http.HandlerFunc {
	return Chain(h,
		CORSMiddleware,
		SecurityHeadersMiddleware,
		CorrelationIDMiddleware,
		RequestLoggerMiddleware,
		RecoveryMiddleware,
	)
}
