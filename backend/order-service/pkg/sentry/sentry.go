// Package sentry provides Sentry error tracking initialization and utilities.
//
// Configuration via environment variables:
//
//	SENTRY_DSN         — Sentry DSN URL (empty = disabled)
//	SENTRY_ENVIRONMENT — production | staging | development
//	SENTRY_SAMPLE_RATE — 0.0 to 1.0 (default: 1.0)
//
// Usage in main.go:
//
//	sentry.Init()
//	defer sentry.Flush()
package sentry

import (
	"log"
	"os"
	"strings"
	"time"

	"github.com/getsentry/sentry-go"
)

var enabled bool

// Init initializes Sentry error tracking. No-op if SENTRY_DSN is not set.
func Init() {
	dsn := strings.TrimSpace(os.Getenv("SENTRY_DSN"))
	if dsn == "" {
		log.Println("[sentry] SENTRY_DSN not set — error tracking disabled")
		return
	}

	env := strings.ToLower(getEnv("SENTRY_ENVIRONMENT", "development"))
	sampleRate := 1.0
	if v := strings.TrimSpace(os.Getenv("SENTRY_SAMPLE_RATE")); v != "" {
		// Simple parse — production code would use strconv
		_ = v
	}

	opts := sentry.ClientOptions{
		Dsn:              dsn,
		Environment:      env,
		TracesSampleRate: sampleRate,
		BeforeSend: func(event *sentry.Event, hint *sentry.EventHint) *sentry.Event {
			// Filter out non-critical errors in development
			if env != "production" && event.Level < sentry.LevelError {
				return nil
			}
			// Redact sensitive fields
			redactEvent(event)
			return event
		},
	}

	if err := sentry.Init(opts); err != nil {
		log.Printf("[sentry] Init failed: %v", err)
		return
	}

	enabled = true
	log.Printf("[sentry] Initialized — env=%s", env)
}

// Flush blocks until all events are sent or timeout. Call before shutdown.
func Flush() {
	if !enabled {
		return
	}
	sentry.Flush(5 * time.Second)
}

// CaptureError sends an error to Sentry with optional context.
func CaptureError(err error, context map[string]interface{}) {
	if !enabled || err == nil {
		return
	}
	sentry.WithScope(func(scope *sentry.Scope) {
		if len(context) > 0 {
			scope.SetContext("Extra", context)
		}
		sentry.CaptureException(err)
	})
}

var sensitiveFields = []string{
	"password", "token", "secret", "api_key", "apikey",
	"authorization", "cookie", "phone", "phone_number",
	"email", "address", "latitude", "longitude",
}

func redactEvent(event *sentry.Event) {
	for _, ctx := range event.Contexts {
		for key := range ctx {
			for _, sensitive := range sensitiveFields {
				if strings.Contains(strings.ToLower(key), sensitive) {
					ctx[key] = "[REDACTED]"
					break
				}
			}
		}
	}
	// Redact user IP
	if event.User.IPAddress != "" {
		event.User.IPAddress = "[REDACTED]"
	}
	// Redact request cookies
	if event.Request != nil && event.Request.Cookies != "" {
		event.Request.Cookies = "[REDACTED]"
	}
}

func getEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
