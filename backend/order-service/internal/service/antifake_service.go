package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"tembus/order-service/internal/domain"
)

// AntiFakeGPSServiceImpl implements the graduated response engine for
// anti-fake GPS enforcement. It evaluates incoming telemetry, records
// violations, and determines enforcement actions based on violation
// frequency within configurable time windows.
//
// Graduated Response Thresholds:
//   - 3 violations in 24 hours → TEMP_SUSPEND_1H
//   - 5 violations in 7 days  → TEMP_SUSPEND_24H
//   - 10 violations in 30 days → MANUAL_REVIEW (escalate to ops team)
type AntiFakeGPSServiceImpl struct {
	repo     domain.AntiFakeGPSRepository
	eventBus domain.EventBus
}

func NewAntiFakeGPSService(repo domain.AntiFakeGPSRepository, eventBus domain.EventBus) domain.AntiFakeGPSService {
	return &AntiFakeGPSServiceImpl{
		repo:     repo,
		eventBus: eventBus,
	}
}

func (s *AntiFakeGPSServiceImpl) EvaluateAndRespond(
	ctx context.Context,
	courierID uuid.UUID,
	telemetry domain.GPSIntegrityTelemetry,
	lat, lng float64,
	deviceID string,
) (*domain.GraduatedResponseResult, error) {
	now := time.Now()

	// Skip evaluation for VALID risk levels — no action needed
	if telemetry.RiskLevel == string(domain.RiskLevelValid) {
		return &domain.GraduatedResponseResult{
			Action:  domain.ActionNone,
			Message: "Location integrity verified.",
		}, nil
	}

	// 1. Record the violation in the audit trail
	violationEvent := domain.GPSViolationEvent{
		ID:        uuid.New(),
		CourierID: courierID,
		RiskScore: telemetry.RiskScore,
		RiskLevel: domain.RiskLevel(telemetry.RiskLevel),
		Telemetry: telemetry,
		Latitude:  lat,
		Longitude: lng,
		DeviceID:  deviceID,
		CreatedAt: now,
	}

	// 2. Count violations in each time window for graduated response
	count24H, err := s.repo.CountViolations(ctx, courierID, now.Add(-24*time.Hour))
	if err != nil {
		return nil, fmt.Errorf("failed to count 24h violations: %w", err)
	}

	count7D, err := s.repo.CountViolations(ctx, courierID, now.Add(-7*24*time.Hour))
	if err != nil {
		return nil, fmt.Errorf("failed to count 7d violations: %w", err)
	}

	count30D, err := s.repo.CountViolations(ctx, courierID, now.Add(-30*24*time.Hour))
	if err != nil {
		return nil, fmt.Errorf("failed to count 30d violations: %w", err)
	}

	// Include current violation in the count
	count24H++
	count7D++
	count30D++

	// 3. Determine graduated response action
	var action domain.GraduatedAction
	var message string

	switch {
	case count30D >= thresholdManualReview30D:
		action = domain.ActionManualReview
		message = fmt.Sprintf(
			"Kurir telah menerima %d pelanggaran GPS dalam 30 hari. Akun di-eskalasi ke tim operasi untuk review manual.",
			count30D,
		)

	case count7D >= thresholdSuspend24H7D:
		action = domain.ActionTempSuspend24H
		message = fmt.Sprintf(
			"Kurir telah menerima %d pelanggaran GPS dalam 7 hari. Akun di-suspend sementara selama 24 jam.",
			count7D,
		)

	case count24H >= thresholdSuspend1H24H:
		action = domain.ActionTempSuspend1H
		message = fmt.Sprintf(
			"Kurir telah menerima %d pelanggaran GPS dalam 24 jam. Akun di-suspend sementara selama 1 jam.",
			count24H,
		)

	default:
		action = domain.ActionWarning
		message = fmt.Sprintf(
			"Penggunaan GPS palsu terdeteksi (skor: %.2f). Peringatan dicatat.",
			telemetry.RiskScore,
		)
	}

	// 4. Persist the violation with the determined action
	violationEvent.ActionTaken = action
	if insertErr := s.repo.InsertViolation(ctx, violationEvent); insertErr != nil {
		return nil, fmt.Errorf("failed to insert violation event: %w", insertErr)
	}

	// 5. Publish enforcement event for downstream systems (notification service, admin dashboard)
	topic := fmt.Sprintf("security:gps_violation:%s", courierID.String())
	_ = s.eventBus.Publish(ctx, topic, map[string]interface{}{
		"courier_id":          courierID.String(),
		"action":              string(action),
		"risk_score":          telemetry.RiskScore,
		"risk_level":          telemetry.RiskLevel,
		"violation_count_24h": count24H,
		"violation_count_7d":  count7D,
		"violation_count_30d": count30D,
		"message":             message,
		"device_id":           deviceID,
		"timestamp":           now.Format(time.RFC3339),
	})

	return &domain.GraduatedResponseResult{
		Action:            action,
		ViolationCount24H: count24H,
		ViolationCount7D:  count7D,
		ViolationCount30D: count30D,
		Message:           message,
	}, nil
}

const (
	// Graduated response thresholds.
	// These values balance deterrence with fairness to avoid penalizing
	// couriers for occasional false positives.
	thresholdSuspend1H24H    = 3  // 3 violations in 24 hours → 1 hour suspend
	thresholdSuspend24H7D    = 5  // 5 violations in 7 days → 24 hour suspend
	thresholdManualReview30D = 10 // 10 violations in 30 days → manual review / potential ban
)
