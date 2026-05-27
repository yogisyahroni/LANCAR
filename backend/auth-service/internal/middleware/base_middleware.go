package middleware

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"regexp"
	"runtime/debug"
	"strings"
	"time"

	"tembus/auth-service/internal/domain"
)

const redactedValue = "[REDACTED]"

var (
	emailPattern         = regexp.MustCompile(`(?i)\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b`)
	phonePattern         = regexp.MustCompile(`(?m)(^|[^\d])((?:\+?62|0)8[\d\s-]{7,15}\d)([^\d]|$)`)
	jwtPattern           = regexp.MustCompile(`\beyJ[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}\b`)
	bearerPattern        = regexp.MustCompile(`(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b`)
	apiKeyPattern        = regexp.MustCompile(`\b(?:sk|pk|rk|AIza|SG|xox[baprs])[-_A-Za-z0-9]{12,}\b`)
	longHexPattern       = regexp.MustCompile(`(?i)\b[a-f0-9]{32,}\b`)
	cardPattern          = regexp.MustCompile(`\b(?:\d[ -]*?){13,19}\b`)
	urlCredentialPattern = regexp.MustCompile(`(?i)\b([a-z][a-z0-9+.\-]*://)([^:@\s/]+):([^@\s/]+)@`)
)

// RedactString removes secrets and common PII from strings before they enter logs.
func RedactString(value string) string {
	value = urlCredentialPattern.ReplaceAllString(value, "${1}"+redactedValue+"@")
	value = bearerPattern.ReplaceAllString(value, "Bearer "+redactedValue)
	value = jwtPattern.ReplaceAllString(value, redactedValue)
	value = apiKeyPattern.ReplaceAllString(value, redactedValue)
	value = emailPattern.ReplaceAllStringFunc(value, func(email string) string {
		parts := strings.Split(email, "@")
		if len(parts) != 2 || len(parts[0]) < 2 {
			return redactedValue
		}
		return parts[0][:2] + "***@" + parts[1]
	})
	value = phonePattern.ReplaceAllStringFunc(value, func(match string) string {
		digits := regexp.MustCompile(`\D`).ReplaceAllString(match, "")
		if len(digits) < 6 {
			return redactedValue
		}
		return strings.Replace(match, digits, digits[:3]+"***"+digits[len(digits)-3:], 1)
	})
	value = cardPattern.ReplaceAllString(value, redactedValue)
	value = longHexPattern.ReplaceAllString(value, redactedValue)
	return value
}

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
	b := make([]byte, 12)
	for i := range b {
		num, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		if err != nil {
			b[i] = charset[0] // Fallback
		} else {
			b[i] = charset[num.Int64()]
		}
	}
	return fmt.Sprintf("tmb-%s-%d", string(b), time.Now().UnixMilli()%10000)
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

		log.Printf(`{"level":"info","msg":"request completed","correlation_id":"%s","method":"%s","path":"%s","status":%d,"duration_ms":%d,"ip":"%s","user_agent":"%s"}`,
			correlationID,
			r.Method,
			RedactString(r.URL.Path),
			rw.statusCode,
			duration.Milliseconds(),
			realIP(r),
			RedactString(r.UserAgent()),
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
					correlationID, RedactString(fmt.Sprint(err)), RedactString(string(debug.Stack())))
				WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "An unexpected error occurred", correlationID)
			}
		}()
		next.ServeHTTP(w, r)
	}
}

type sanitizingResponseWriter struct {
	http.ResponseWriter
	statusCode    int
	headerWritten bool
	buffering     bool
	body          bytes.Buffer
}

func newSanitizingResponseWriter(w http.ResponseWriter) *sanitizingResponseWriter {
	return &sanitizingResponseWriter{ResponseWriter: w, statusCode: http.StatusOK}
}

func (rw *sanitizingResponseWriter) WriteHeader(code int) {
	if rw.headerWritten {
		return
	}
	rw.statusCode = code
	rw.headerWritten = true
	if code >= http.StatusInternalServerError {
		rw.buffering = true
		return
	}
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *sanitizingResponseWriter) Write(data []byte) (int, error) {
	if !rw.headerWritten {
		rw.WriteHeader(http.StatusOK)
	}
	if rw.buffering {
		_, _ = rw.body.Write(data)
		return len(data), nil
	}
	return rw.ResponseWriter.Write(data)
}

func (rw *sanitizingResponseWriter) FlushSanitized(r *http.Request) {
	if !rw.buffering {
		return
	}

	correlationID := GetCorrelationID(r.Context())
	log.Printf(`{"level":"error","msg":"sanitized unsafe server error response","correlation_id":"%s","method":"%s","path":"%s","status":%d,"body":"%s"}`,
		correlationID,
		r.Method,
		RedactString(r.URL.Path),
		rw.statusCode,
		RedactString(rw.body.String()),
	)
	WriteError(rw.ResponseWriter, rw.statusCode, "ERR_INTERNAL_SERVER", "Internal server error", correlationID)
}

// ErrorMapperMiddleware converts unsafe 5xx responses into the standard JSON error envelope.
func ErrorMapperMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rw := newSanitizingResponseWriter(w)
		next.ServeHTTP(rw, r)
		rw.FlushSanitized(r)
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
			"https://admin.tembus.app": true,
			"https://app.tembus.app":   true,
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

// ErrorResponse is the canonical error format for all TEMBUS APIs.
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
	if err := json.NewEncoder(w).Encode(ErrorResponse{
		Success:       false,
		Code:          code,
		Message:       message,
		CorrelationID: correlationID,
	}); err != nil {
		log.Printf("[ERROR] Failed to encode error response: %v", err)
	}
}

// SuccessResponse is the canonical success format for all TEMBUS APIs.
type SuccessResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data"`
}

// WriteSuccess writes a structured JSON success response.
func WriteSuccess(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(SuccessResponse{
		Success: true,
		Data:    data,
	}); err != nil {
		log.Printf("[ERROR] Failed to encode success response: %v", err)
	}
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
		ErrorMapperMiddleware,
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

// Admin2FAChain applies BaseChain + Auth + 2FA Enforce + Role middleware.
func Admin2FAChain(role string, h http.HandlerFunc) http.HandlerFunc {
	return BaseChain(AuthMiddleware(Enforce2FAMiddleware(RoleMiddleware(role, h))))
}

// PermissionChain applies BaseChain + Auth + Permission middleware.
func PermissionChain(userRepo domain.UserRepository, perm domain.Permission, h http.HandlerFunc) http.HandlerFunc {
	return BaseChain(AuthMiddleware(PermissionMiddleware(userRepo, perm, h)))
}

// Permission2FAChain applies BaseChain + Auth + 2FA Enforce + Permission middleware.
func Permission2FAChain(userRepo domain.UserRepository, perm domain.Permission, h http.HandlerFunc) http.HandlerFunc {
	return BaseChain(AuthMiddleware(Enforce2FAMiddleware(PermissionMiddleware(userRepo, perm, h))))
}

// -------------------------------------------------------
// Rate-limited chain helpers
// Wire these directly in main.go for specific endpoints.
// -------------------------------------------------------

// OTPSendChain applies BaseChain + IP-based OTP send rate limit (3 req/5min).
func OTPSendChain(rdb interface{ Close() error }, h http.HandlerFunc) http.HandlerFunc {
	// Type-assert to *redis.Client from the middleware package perspective.
	// We use interface{} here to avoid importing redis in base_middleware;
	// the actual redis.Client is passed from main and used in rate_limiter.go.
	// Since both files are in the same package, we call the factory directly.
	return baseChainWithRateLimit(h, LimitOTPSend(assertRedis(rdb)))
}

// OTPVerifyChain applies BaseChain + IP-based OTP verify rate limit (5 attempts/10min).
func OTPVerifyChain(rdb interface{ Close() error }, h http.HandlerFunc) http.HandlerFunc {
	return baseChainWithRateLimit(h, LimitOTPVerify(assertRedis(rdb)))
}

// AuthRateLimitedChain applies BaseChain + auth endpoint rate limit (20 req/60s).
func AuthRateLimitedChain(rdb interface{ Close() error }, h http.HandlerFunc) http.HandlerFunc {
	return baseChainWithRateLimit(h, LimitAuthEndpoints(assertRedis(rdb)))
}

// baseChainWithRateLimit composes: CORS → Security → CorrelationID → Logger → Recovery → RateLimit → handler.
// Rate limiter runs after correlation ID is injected so error responses include correlation_id.
func baseChainWithRateLimit(h http.HandlerFunc, rateLimitMW func(http.HandlerFunc) http.HandlerFunc) http.HandlerFunc {
	return Chain(h,
		CORSMiddleware,
		SecurityHeadersMiddleware,
		CorrelationIDMiddleware,
		RequestLoggerMiddleware,
		ErrorMapperMiddleware,
		RecoveryMiddleware,
		rateLimitMW,
	)
}

// MobileIntegrityChain applies BaseChain + Device Integrity check.
// Use this for sensitive routes used by the Driver/Mobile app.
func MobileIntegrityChain(auditRepo domain.AuditRepository, h http.HandlerFunc) http.HandlerFunc {
	return BaseChain(DeviceIntegrityMiddleware(auditRepo, h))
}

// MobileAuthIntegrityChain applies BaseChain + Auth + Device Integrity check.
// Use this for authenticated sensitive routes used by the Driver/Mobile app.
func MobileAuthIntegrityChain(auditRepo domain.AuditRepository, h http.HandlerFunc) http.HandlerFunc {
	return BaseChain(AuthMiddleware(DeviceIntegrityMiddleware(auditRepo, h)))
}
