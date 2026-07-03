package middleware

import (
	"net/http"

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
func DeviceIntegrityMiddleware(auditRepo domain.AuditRepository, configRepo domain.ConfigRepository, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Cek apakah fitur integrasi Google Play Integrity diaktifkan via Admin Dashboard
		integrityEnabled := configRepo.GetBoolConfig(r.Context(), "security_enable_play_integrity", false)

		if !integrityEnabled {
			// PASSTHROUGH: Fitur dimatikan via admin dashboard.
			next.ServeHTTP(w, r)
			return
		}

		// 2. Jika diaktifkan, cek token integritas dari header
		// Header standar untuk Play Integrity API
		token := r.Header.Get("X-Play-Integrity-Token")
		if token == "" {
			WriteError(w, http.StatusUnauthorized, "ERR_FRAUD_DETECTED", "Device integrity token is missing. Please update your app from the official Play Store.", GetCorrelationID(r.Context()), "", "")
			return
		}

		// 3. TODO: Panggil Google Play Integrity API yang sebenarnya di sini.
		// Mock implementation: Jika token ada, asumsikan valid (hanya untuk simulasi).
		// Di production, kirim token ini ke server Google untuk divalidasi.
		if token == "MOCK_INVALID_TOKEN" {
			WriteError(w, http.StatusUnauthorized, "ERR_FRAUD_DETECTED", "Device integrity validation failed. Fake GPS or unauthorized modification detected.", GetCorrelationID(r.Context()), "", "")
			return
		}

		// 4. Lolos pengecekan
		next.ServeHTTP(w, r)
	}
}
