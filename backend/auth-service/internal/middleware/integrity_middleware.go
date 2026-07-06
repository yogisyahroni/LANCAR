package middleware

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"golang.org/x/oauth2/google"
	"tembus/auth-service/internal/domain"
)

// DeviceIntegrityMiddleware enforces device security for mobile clients.
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
		token := r.Header.Get("X-Play-Integrity-Token")
		if token == "" {
			WriteError(w, http.StatusUnauthorized, "ERR_FRAUD_DETECTED", "Device integrity token is missing. Please update your app from the official Play Store.", GetCorrelationID(r.Context()), "", "")
			return
		}

		// 3. Panggil Google Play Integrity API yang sebenarnya
		packageName := configRepo.GetStringConfig(r.Context(), "play_integrity_package_name", "")
		if packageName == "" {
			WriteError(w, http.StatusInternalServerError, "ERR_CONFIG", "Play Integrity Package Name is not configured", GetCorrelationID(r.Context()), "", "")
			return
		}

		client, err := google.DefaultClient(r.Context(), "https://www.googleapis.com/auth/playintegrity")
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "ERR_AUTH", "Failed to load Google credentials for Play Integrity", GetCorrelationID(r.Context()), "", "")
			return
		}
		client.Timeout = 10 * time.Second

		apiURL := fmt.Sprintf("https://playintegrity.googleapis.com/v1/%s:decodeIntegrityToken", packageName)
		payload := map[string]string{
			"integrityToken": token,
		}
		body, _ := json.Marshal(payload)

		resp, err := client.Post(apiURL, "application/json", bytes.NewReader(body))
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "ERR_NETWORK", "Failed to contact Play Integrity API", GetCorrelationID(r.Context()), "", "")
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			WriteError(w, http.StatusUnauthorized, "ERR_FRAUD_DETECTED", "Device integrity validation failed. Fake GPS or unauthorized modification detected.", GetCorrelationID(r.Context()), "", "")
			return
		}

		// 4. Lolos pengecekan
		next.ServeHTTP(w, r)
	}
}
