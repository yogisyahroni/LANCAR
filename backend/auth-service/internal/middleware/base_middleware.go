package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"runtime/debug"
	"strings"
	"time"
)

// -------------------------------------------------------
// Correlation ID Middleware
// Injects a unique X-Correlation-ID header per request
// for distributed tracing and log correlation.
// -------------------------------------------------------

const correlationIDKey contextKey = "correlation_id"
const correlationIDHeader = "X-Correlation-ID"

// CorrelationIDMiddleware injects a unique request ID into context and response headers.
func CorrelationIDMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		correlationID := r.Header.Get(correlationIDHeader)
		if correlationID == "" {
			correlationID = generateCorrelationID()
		}
		ctx := context.WithValue(r.Context(), correlationIDKey, correlationID)
		w.Header().Set(correlationIDHeader, correlationID)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

// GetCorrelationID retrieves the correlation ID from context.
func GetCorrelationID(ctx context.Context) string {
	if v, ok := ctx.Value(correlationIDKey).(string); ok {
		return v
	}
	return ""
}

func generateCorrelationID() string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	b := make([]byte, 12)
	for i := range b {
		b[i] = charset[rng.Intn(len(charset))]
	}
	return fmt.Sprintf("lnc-%s-%d", string(b), time.Now().UnixMilli()%10000)
}

// -------------------------------------------------------
// Request Logger Middleware
// Logs method, path, status, latency, and correlation ID.
// -------------------------------------------------------

// responseWriter wraps http.ResponseWriter to capture status code.
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

// RequestLoggerMiddleware logs structured request/response info.
func RequestLoggerMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := newResponseWriter(w)

		next.ServeHTTP(rw, r)

		duration := time.Since(start)
		correlationID := GetCorrelationID(r.Context())

		log.Printf("[REQUEST] correlation_id=%s method=%s path=%s status=%d duration=%s ip=%s user_agent=%s",
			correlationID,
			r.Method,
			r.URL.Path,
			rw.statusCode,
			duration.Round(time.Millisecond),
			realIP(r),
			r.UserAgent(),
		)
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

// -------------------------------------------------------
// Recovery Middleware (Anti-Panic)
// Catches panics, logs the stack trace, and returns 500.
// -------------------------------------------------------

// RecoveryMiddleware prevents the server from crashing on panic.
func RecoveryMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				correlationID := GetCorrelationID(r.Context())
				log.Printf("[PANIC] correlation_id=%s error=%v\nstack:\n%s",
					correlationID, err, debug.Stack())
				WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "An unexpected error occurred", correlationID)
			}
		}()
		next.ServeHTTP(w, r)
	}
}

// -------------------------------------------------------
// CORS Middleware
// Handles CORS preflight and injects headers.
// -------------------------------------------------------

// CORSMiddleware handles Cross-Origin Resource Sharing headers.
func CORSMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowedOrigins := map[string]bool{
			"http://localhost:3000":    true,
			"http://localhost:5173":    true,
			"https://admin.lancar.app": true,
			"https://app.lancar.app":   true,
		}

		if allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Correlation-ID")
		w.Header().Set("Access-Control-Max-Age", "86400")

		// Handle preflight
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	}
}

// -------------------------------------------------------
// Security Headers Middleware
// Enforces HSTS, CSP, X-Frame-Options, etc.
// -------------------------------------------------------

// SecurityHeadersMiddleware adds security headers to every response.
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

// -------------------------------------------------------
// Standard Error Response
// Consistent error format across all services.
// -------------------------------------------------------

// ErrorResponse is the canonical error format for all LANCAR APIs.
type ErrorResponse struct {
	Success       bool   `json:"success"`
	Code          string `json:"code"`
	Message       string `json:"message"`
	CorrelationID string `json:"correlation_id,omitempty"`
}

// WriteError writes a structured JSON error response.
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

// SuccessResponse is the canonical success format for all LANCAR APIs.
type SuccessResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data"`
}

// WriteSuccess writes a structured JSON success response.
func WriteSuccess(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(SuccessResponse{
		Success: true,
		Data:    data,
	})
}

// -------------------------------------------------------
// Chain helper — compose multiple middlewares
// Usage: Chain(h.Handler, CorrelationID, Logger, Recovery, Auth)
// -------------------------------------------------------

// Chain applies middlewares in left-to-right order.
func Chain(h http.HandlerFunc, middlewares ...func(http.HandlerFunc) http.HandlerFunc) http.HandlerFunc {
	for i := len(middlewares) - 1; i >= 0; i-- {
		h = middlewares[i](h)
	}
	return h
}

// BaseChain applies the standard set of middlewares (CORS + Security + CorrelationID + Logger + Recovery).
func BaseChain(h http.HandlerFunc) http.HandlerFunc {
	return Chain(h,
		CORSMiddleware,
		SecurityHeadersMiddleware,
		CorrelationIDMiddleware,
		RequestLoggerMiddleware,
		RecoveryMiddleware,
	)
}

// AuthChain applies BaseChain + Auth middleware.
func AuthChain(h http.HandlerFunc) http.HandlerFunc {
	return BaseChain(AuthMiddleware(h))
}

// AdminChain applies BaseChain + Auth + Role middleware.
func AdminChain(role string, h http.HandlerFunc) http.HandlerFunc {
	return BaseChain(AuthMiddleware(RoleMiddleware(role, h)))
}
