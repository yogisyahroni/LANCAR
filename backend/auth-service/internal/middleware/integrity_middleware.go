package middleware

import (
	"context"
	"fmt"
	"lancar/auth-service/internal/domain"
	"log"
	"net/http"
	"strings"
	"time"
)

// DeviceIntegrityMiddleware enforces device security for mobile clients.
func DeviceIntegrityMiddleware(auditRepo domain.AuditRepository, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		userAgent := r.UserAgent()
		
		// Only enforce for mobile apps (Driver App)
		// Standard: Check if User-Agent contains our app identifier
		if strings.Contains(userAgent, "LANCAR-Driver") || strings.Contains(userAgent, "LANCAR-Mobile") {
			integrityToken := r.Header.Get("X-Device-Integrity-Token")
			
			if integrityToken == "" {
				log.Printf("[SECURITY] Blocked request from %s: Missing X-Device-Integrity-Token", r.RemoteAddr)
				
				// Record Audit Log for Admin Notification
				recordIntegrityViolation(auditRepo, r, "MISSING_TOKEN")

				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				w.Write([]byte(`{"status":"error","code":"ERR_DEVICE_UNTRUSTED","message":"Device integrity check required. Please ensure your device is not rooted and use the official app."}`))
				return
			}

			// TODO: In production, call VerifyDeviceIntegrity(integrityToken) 
			// which validates the token against Google Play Integrity or Apple DeviceCheck APIs.
			if !isValidIntegrityToken(integrityToken) {
				log.Printf("[SECURITY] Blocked request from %s: Invalid/Expired Integrity Token", r.RemoteAddr)
				
				// Record Audit Log for Admin Notification
				recordIntegrityViolation(auditRepo, r, "INVALID_TOKEN")

				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				w.Write([]byte(`{"status":"error","code":"ERR_DEVICE_COMPROMISED","message":"Security violation: Your device does not meet the minimum safety requirements."}`))
				return
			}
		}

		next.ServeHTTP(w, r)
	}
}

func recordIntegrityViolation(repo domain.AuditRepository, r *http.Request, violationType string) {
	if repo == nil {
		return
	}

	// Try to get ActorID if available (e.g. from session/context if middleware is after Auth)
	actorID := "ANONYMOUS_DRIVER"
	// In a real system, you'd extract the user_id from the context if possible

	audit := &domain.AuditLog{
		ActorID:   actorID,
		Action:    "DEVICE_INTEGRITY_VIOLATION",
		TargetID:  r.RemoteAddr,
		Payload:   fmt.Sprintf(`{"type":"%s","path":"%s","user_agent":"%s"}`, violationType, r.URL.Path, r.UserAgent()),
		CreatedAt: time.Now(),
	}

	// Save to database
	err := repo.CreateAuditLog(context.Background(), audit)
	if err != nil {
		log.Printf("[ERROR] Failed to save integrity violation audit log: %v", err)
	}
}


// isValidIntegrityToken is a placeholder for actual token verification logic.
// In Grade S++ enterprise, this would involve verifying a signed JWS from Google/Apple.
func isValidIntegrityToken(token string) bool {
	// Simple mock check for now. 
	// In production, this would parse the token and check 'deviceIntegrity' fields.
	if token == "DEVELOPMENT_BYPASS_TOKEN" {
		return true
	}
	
	// Real tokens would be long base64 strings
	return len(token) > 20
}
