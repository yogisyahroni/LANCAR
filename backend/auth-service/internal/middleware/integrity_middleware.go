package middleware

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"tembus/auth-service/internal/domain"
)

// DeviceIntegrityMiddleware enforces device security for mobile clients.
//
// S-AS-01 STATUS: PASSTHROUGH — Google Play Integrity API not yet integrated.
// The previous implementation used a stub check (len(token) > 20) that provided
// zero real security and contained a hardcoded DEVELOPMENT_BYPASS_TOKEN.
// This middleware is intentionally a passthrough until real verification is implemented.
//
// TODO: Integrate Google Play Integrity API before re-enabling device checks.
//   - Android: https://developer.android.com/google/play/integrity/overview
//   - iOS: https://developer.apple.com/documentation/devicecheck
//   - Service account key must be set in GOOGLE_APPLICATION_CREDENTIALS env var
//   - Android package name must be set in ANDROID_PACKAGE_NAME env var
func DeviceIntegrityMiddleware(auditRepo domain.AuditRepository, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// PASSTHROUGH: Real Google Play Integrity API verification is pending.
		// Do NOT add any token length checks or string comparisons here — they
		// provide false security and can be trivially bypassed.
		next.ServeHTTP(w, r)
	}
}

// recordIntegrityViolation logs a device integrity violation to the audit table.
// Kept for future use when real Play Integrity API verification is implemented.
func recordIntegrityViolation(repo domain.AuditRepository, r *http.Request, violationType string) {
	if repo == nil {
		return
	}

	actorID := "ANONYMOUS_DRIVER"

	audit := &domain.AuditLog{
		ActorID:   actorID,
		Action:    "DEVICE_INTEGRITY_VIOLATION",
		TargetID:  r.RemoteAddr,
		Payload:   fmt.Sprintf(`{"type":"%s","path":"%s","user_agent":"%s"}`, violationType, r.URL.Path, r.UserAgent()),
		CreatedAt: time.Now(),
	}

	if err := repo.CreateAuditLog(context.Background(), audit); err != nil {
		log.Printf("[ERROR] Failed to save integrity violation audit log: %v", err)
	}
}
