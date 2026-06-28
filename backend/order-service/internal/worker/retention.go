// Package retention provides configurable data retention cleanup.
//
// Configuration via environment variables:
//
//	RETENTION_TRACKING_DAYS       — max age for GPS tracking data (default: 30)
//	RETENTION_NOTIFICATIONS_DAYS  — max age for push notifications (default: 90)
//	RETENTION_AUDIT_LOGS_DAYS     — max age for audit/security logs (default: 365)
//	RETENTION_CLEANUP_INTERVAL_H  — cleanup interval in hours (default: 24)
//	RETENTION_BATCH_SIZE          — max rows per cleanup batch (default: 1000)
//	RETENTION_ENABLED             — enable/disable cleanup (default: true)
package worker

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

type CleanupConfig struct {
	TrackingDays      int
	NotificationsDays int
	AuditLogsDays     int
	CleanupIntervalH  int
	BatchSize         int
	Enabled           bool
}

// LoadConfig reads retention configuration from environment variables.
func LoadConfig() CleanupConfig {
	return CleanupConfig{
		TrackingDays:      envInt("RETENTION_TRACKING_DAYS", 30),
		NotificationsDays: envInt("RETENTION_NOTIFICATIONS_DAYS", 90),
		AuditLogsDays:     envInt("RETENTION_AUDIT_LOGS_DAYS", 365),
		CleanupIntervalH:  envInt("RETENTION_CLEANUP_INTERVAL_H", 24),
		BatchSize:         envInt("RETENTION_BATCH_SIZE", 1000),
		Enabled:           strings.ToLower(os.Getenv("RETENTION_ENABLED")) != "false",
	}
}

// StartCleanupWorker runs a background goroutine that periodically executes
// data retention cleanup based on the configured TTLs.
func StartCleanupWorker(db *sql.DB) {
	cfg := LoadConfig()
	if !cfg.Enabled {
		log.Println("[retention] Cleanup worker disabled (RETENTION_ENABLED=false)")
		return
	}

	interval := time.Duration(cfg.CleanupIntervalH) * time.Hour
	log.Printf("[retention] Starting cleanup worker — interval=%v tracking=%dd notifications=%dd audit=%dd batch=%d",
		interval, cfg.TrackingDays, cfg.NotificationsDays, cfg.AuditLogsDays, cfg.BatchSize)

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		// Run once at startup
		runCleanup(db, cfg)

		for range ticker.C {
			runCleanup(db, cfg)
		}
	}()
}

func runCleanup(db *sql.DB, cfg CleanupConfig) {
	start := time.Now()
	totalDeleted := 0

	// 1. Cleanup GPS tracking data
	deleted, err := cleanupTable(db, "courier_location_history",
		"recorded_at", cfg.TrackingDays, cfg.BatchSize)
	if err != nil {
		log.Printf("[retention] Failed to cleanup courier_location_history: %v", err)
	} else {
		totalDeleted += deleted
	}

	// 2. Cleanup push notification history
	deleted, err = cleanupTable(db, "push_notification_history",
		"created_at", cfg.NotificationsDays, cfg.BatchSize)
	if err != nil {
		log.Printf("[retention] Failed to cleanup push_notification_history: %v", err)
	} else {
		totalDeleted += deleted
	}

	// 3. Cleanup audit/security logs
	deleted, err = cleanupTable(db, "audit_logs",
		"created_at", cfg.AuditLogsDays, cfg.BatchSize)
	if err != nil {
		log.Printf("[retention] Failed to cleanup audit_logs: %v", err)
	} else {
		totalDeleted += deleted
	}

	// 4. Cleanup expired OTP codes
	deleted, err = cleanupTable(db, "otp_codes",
		"expires_at", 1, cfg.BatchSize) // OTP expires after 1 day max
	if err != nil {
		log.Printf("[retention] Failed to cleanup otp_codes: %v", err)
	} else {
		totalDeleted += deleted
	}

	// 5. Cleanup expired sessions
	deleted, err = cleanupTable(db, "sessions",
		"expires_at", 7, cfg.BatchSize) // Sessions older than 7 days past expiry
	if err != nil {
		log.Printf("[retention] Failed to cleanup sessions: %v", err)
	} else {
		totalDeleted += deleted
	}

	elapsed := time.Since(start)
	log.Printf("[retention] Cleanup complete — %d rows deleted in %v", totalDeleted, elapsed)
}

func cleanupTable(db *sql.DB, table, column string, maxAgeDays, batchSize int) (int, error) {
	cutoff := time.Now().AddDate(0, 0, -maxAgeDays)
	totalDeleted := 0

	for {
		query := fmt.Sprintf(
			"DELETE FROM %s WHERE %s < $1 LIMIT $2",
			table, column,
		)

		result, err := db.Exec(query, cutoff, batchSize)
		if err != nil {
			// Table might not exist — don't fail the entire cleanup
			if strings.Contains(err.Error(), "does not exist") ||
				strings.Contains(err.Error(), "no such table") {
				return 0, nil
			}
			return totalDeleted, err
		}

		rows, _ := result.RowsAffected()
		totalDeleted += int(rows)

		if rows < int64(batchSize) {
			break // No more rows to delete
		}

		// Brief pause between batches to not overload DB
		time.Sleep(100 * time.Millisecond)
	}

	return totalDeleted, nil
}

func envInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v < 1 {
		return fallback
	}
	return v
}
