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

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func newResponseWriter(w http.ResponseWriter) *responseWriter {
	return &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
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

func LogJSON(level string, message string, fields map[string]interface{}) {
	event := map[string]interface{}{
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"level":     level,
		"service":   "payment-service",
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
		log.Printf(`{"timestamp":"%s","level":"error","service":"payment-service","message":"failed to serialize log event"}`, time.Now().UTC().Format(time.RFC3339Nano))
		return
	}
	log.Print(string(payload))
}

func generateID() string {
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

func CorrelationIDMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		correlationID := strings.TrimSpace(r.Header.Get(correlationIDHeader))
		if correlationID == "" {
			correlationID = generateID()
		}
		requestID := strings.TrimSpace(r.Header.Get(requestIDHeader))
		if requestID == "" {
			requestID = generateID()
		}
		ctx := context.WithValue(r.Context(), correlationIDKey, correlationID)
		ctx = context.WithValue(ctx, requestIDKey, requestID)
		w.Header().Set(correlationIDHeader, correlationID)
		w.Header().Set(requestIDHeader, requestID)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

func GetCorrelationID(ctx context.Context) string {
	if value, ok := ctx.Value(correlationIDKey).(string); ok {
		return value
	}
	return ""
}

func GetRequestID(ctx context.Context) string {
	if value, ok := ctx.Value(requestIDKey).(string); ok {
		return value
	}
	return ""
}

func realIP(r *http.Request) string {
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		return strings.TrimSpace(strings.Split(ip, ",")[0])
	}
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return strings.TrimSpace(ip)
	}
	return r.RemoteAddr
}

func RequestLoggerMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := newResponseWriter(w)
		next.ServeHTTP(rw, r)
		LogJSON("info", "request completed", map[string]interface{}{
			"correlation_id": GetCorrelationID(r.Context()),
			"request_id":     GetRequestID(r.Context()),
			"method":         r.Method,
			"path":           r.URL.Path,
			"status":         rw.statusCode,
			"duration_ms":    time.Since(start).Milliseconds(),
			"ip":             realIP(r),
			"user_agent":     r.UserAgent(),
		})
	}
}

func MutationAuditMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rw := newResponseWriter(w)
		next.ServeHTTP(rw, r)
		if rw.statusCode >= 400 {
			return
		}
		if r.Method != http.MethodPost && r.Method != http.MethodPut && r.Method != http.MethodPatch && r.Method != http.MethodDelete {
			return
		}
		LogJSON("info", "payment mutation audit", map[string]interface{}{
			"event":          "audit_trail",
			"actor_id":       r.Header.Get("X-User-ID"),
			"actor_role":     r.Header.Get("X-User-Role"),
			"action":         fmt.Sprintf("http.%s.%s", strings.ToLower(r.Method), strings.TrimPrefix(r.URL.Path, "/")),
			"resource":       r.URL.Path,
			"status":         rw.statusCode,
			"correlation_id": GetCorrelationID(r.Context()),
			"request_id":     GetRequestID(r.Context()),
			"ip":             realIP(r),
		})
	}
}

func RecoveryMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				LogJSON("error", "panic recovered", map[string]interface{}{
					"correlation_id": GetCorrelationID(r.Context()),
					"request_id":     GetRequestID(r.Context()),
					"error":          fmt.Sprint(err),
					"stack":          string(debug.Stack()),
				})
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	}
}

func Chain(h http.HandlerFunc, middlewares ...func(http.HandlerFunc) http.HandlerFunc) http.HandlerFunc {
	for i := len(middlewares) - 1; i >= 0; i-- {
		h = middlewares[i](h)
	}
	return h
}

func BaseChain(h http.HandlerFunc) http.HandlerFunc {
	return Chain(h, CorrelationIDMiddleware, RequestLoggerMiddleware, MutationAuditMiddleware, RecoveryMiddleware)
}
