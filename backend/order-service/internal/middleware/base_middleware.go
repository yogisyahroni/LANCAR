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


type contextKey string

const correlationIDKey contextKey = "correlation_id"
const correlationIDHeader = "X-Correlation-ID"

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
