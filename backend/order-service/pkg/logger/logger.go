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
	"log/slog"
	"os"
	"strings"
)

var defaultLogger *slog.Logger

func init() {
	level := parseLevel(getEnv("LOG_LEVEL", "info"))
	format := strings.ToLower(getEnv("LOG_FORMAT", "json"))
	service := getEnv("LOG_SERVICE", "unknown")

	opts := &slog.HandlerOptions{
		Level: level,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			// Always include service name
			if a.Key == slog.SourceKey {
				return a
			}
			return a
		},
		AddSource: level <= slog.LevelDebug,
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
		Level:     newLevel,
		AddSource: newLevel <= slog.LevelDebug,
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
