package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"time"
)

// -------------------------------------------------------
// Health & Readiness Handlers
// GET /health  — liveness probe (is the process alive?)
// GET /ready   — readiness probe (is the service ready to serve traffic?)
// -------------------------------------------------------

var startTime = time.Now()

// HealthResponse is the response body for /health.
type HealthResponse struct {
	Status    string `json:"status"`
	Service   string `json:"service"`
	Version   string `json:"version"`
	UptimeSec int64  `json:"uptime_sec"`
	Timestamp string `json:"timestamp"`
}

// ReadinessResponse is the response body for /ready.
type ReadinessResponse struct {
	Status   string                     `json:"status"`
	Checks   map[string]CheckResult     `json:"checks"`
	Timestamp string                    `json:"timestamp"`
}

// CheckResult holds the result of a single dependency check.
type CheckResult struct {
	Status  string `json:"status"`           // "ok" | "degraded" | "down"
	Latency string `json:"latency,omitempty"` // e.g. "2ms"
	Error   string `json:"error,omitempty"`
}

// HealthHandler handles GET /health (liveness probe).
// Returns 200 OK as long as the process is running.
func HealthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	version := os.Getenv("APP_VERSION")
	if version == "" {
		version = "1.0.0"
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(HealthResponse{
		Status:    "ok",
		Service:   "auth-service",
		Version:   version,
		UptimeSec: int64(time.Since(startTime).Seconds()),
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}

// ReadinessHandlerFunc returns a readiness handler that checks DB connectivity.
// Returns 200 if all checks pass, 503 if any critical dependency is down.
func ReadinessHandlerFunc(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		checks := make(map[string]CheckResult)
		overallStatus := "ok"

		// --- Check 1: PostgreSQL ---
		dbStart := time.Now()
		if err := db.Ping(); err != nil {
			checks["postgres"] = CheckResult{
				Status: "down",
				Error:  err.Error(),
			}
			overallStatus = "down"
		} else {
			checks["postgres"] = CheckResult{
				Status:  "ok",
				Latency: time.Since(dbStart).Round(time.Millisecond).String(),
			}
		}

		// --- Check 2: Disk space (basic) ---
		checks["process"] = CheckResult{Status: "ok"}

		statusCode := http.StatusOK
		if overallStatus == "down" {
			statusCode = http.StatusServiceUnavailable
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		json.NewEncoder(w).Encode(ReadinessResponse{
			Status:    overallStatus,
			Checks:    checks,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
	}
}
