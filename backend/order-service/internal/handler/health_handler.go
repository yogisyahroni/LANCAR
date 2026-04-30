package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"time"
)

var startTime = time.Now()

type HealthResponse struct {
	Status    string `json:"status"`
	Service   string `json:"service"`
	Version   string `json:"version"`
	UptimeSec int64  `json:"uptime_sec"`
	Timestamp string `json:"timestamp"`
}

type ReadinessResponse struct {
	Status    string                 `json:"status"`
	Checks    map[string]CheckResult `json:"checks"`
	Timestamp string                 `json:"timestamp"`
}

type CheckResult struct {
	Status  string `json:"status"`
	Latency string `json:"latency,omitempty"`
	Error   string `json:"error,omitempty"`
}

func HealthHandler(w http.ResponseWriter, r *http.Request) {
	version := os.Getenv("APP_VERSION")
	if version == "" {
		version = "1.0.0"
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(HealthResponse{
		Status:    "ok",
		Service:   "order-service",
		Version:   version,
		UptimeSec: int64(time.Since(startTime).Seconds()),
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}

func ReadinessHandlerFunc(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		checks := make(map[string]CheckResult)
		overallStatus := "ok"

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
