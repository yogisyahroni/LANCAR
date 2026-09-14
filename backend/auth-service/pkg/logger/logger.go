// Package logger provides structured JSON logging using Go's standard library slog.
//
// Configuration via environment variables:
//
//	LOG_LEVEL   — debug | info | warn | error (default: info)
//	LOG_FORMAT  — json | text (default: json)
//	LOG_SERVICE — service name for log attribution (default: "unknown")
//
// Usage:
//
//	logger.Info("order created", "order_id", orderID, "user_id", userID)
//	logger.Error("payment failed", "error", err, "order_id", orderID)
package logger

import (
	"fmt"
	"log/slog"
	"os"
	"regexp"
	"strings"
)

var defaultLogger *slog.Logger

const redactedValue = "[REDACTED]"

var (
	sensitiveKeyPattern  = regexp.MustCompile(`(?i)password|passcode|pin|otp|token|secret|api[_-]?key|authorization|cookie|signature|credential|card|cvv|pan|qris|raw[_-]?body|request[_-]?body|response[_-]?body`)
	urlCredentialPattern = regexp.MustCompile(`(?i)\b([a-z][a-z0-9+.\-]*://)([^:@\s/]+):([^@\s/]+)@`)
	bearerPattern        = regexp.MustCompile(`(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b`)
	jwtPattern           = regexp.MustCompile(`\beyJ[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}\b`)
	apiKeyPattern        = regexp.MustCompile(`\b(?:sk|pk|rk|AIza|SG|xox[baprs])[-_A-Za-z0-9]{12,}\b`)
	longHexPattern       = regexp.MustCompile(`(?i)\b[a-f0-9]{32,}\b`)
)

func redactLogString(value string) string {
	value = urlCredentialPattern.ReplaceAllString(value, "${1}"+redactedValue+"@")
	value = bearerPattern.ReplaceAllString(value, "Bearer "+redactedValue)
	value = jwtPattern.ReplaceAllString(value, redactedValue)
	value = apiKeyPattern.ReplaceAllString(value, redactedValue)
	return longHexPattern.ReplaceAllString(value, redactedValue)
}

func redactAttr(_ []string, attr slog.Attr) slog.Attr {
	if sensitiveKeyPattern.MatchString(attr.Key) {
		return slog.String(attr.Key, redactedValue)
	}
	resolved := attr.Value.Resolve()
	if attr.Key == "error" {
		return slog.String(attr.Key, redactLogString(fmt.Sprint(resolved.Any())))
	}
	if resolved.Kind() == slog.KindString {
		return slog.String(attr.Key, redactLogString(resolved.String()))
	}
	return attr
}

func init() {
	level := parseLevel(getEnv("LOG_LEVEL", "info"))
	format := strings.ToLower(getEnv("LOG_FORMAT", "json"))
	service := getEnv("LOG_SERVICE", "unknown")

	opts := &slog.HandlerOptions{
		Level:       level,
		ReplaceAttr: redactAttr,
		AddSource:   level <= slog.LevelDebug,
	}

	var handler slog.Handler
	if format == "text" {
		handler = slog.NewTextHandler(os.Stdout, opts)
	} else {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	}

	defaultLogger = slog.New(handler).With("service", service)
}

func getEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func parseLevel(level string) slog.Level {
	switch strings.ToLower(level) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// SetLevel allows runtime log level changes via admin/config toggle.
func SetLevel(level string) {
	newLevel := parseLevel(level)
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level:       newLevel,
		AddSource:   newLevel <= slog.LevelDebug,
		ReplaceAttr: redactAttr,
	})
	defaultLogger = slog.New(handler).With("service", getEnv("LOG_SERVICE", "unknown"))
}

// Info logs at INFO level. Usage: logger.Info("msg", "key", val, ...)
func Info(msg string, args ...any) {
	defaultLogger.Info(msg, args...)
}

// Debug logs at DEBUG level.
func Debug(msg string, args ...any) {
	defaultLogger.Debug(msg, args...)
}

// Warn logs at WARN level.
func Warn(msg string, args ...any) {
	defaultLogger.Warn(msg, args...)
}

// Error logs at ERROR level.
func Error(msg string, args ...any) {
	defaultLogger.Error(msg, args...)
}

// With returns a logger with additional context fields.
func With(args ...any) *slog.Logger {
	return defaultLogger.With(args...)
}
