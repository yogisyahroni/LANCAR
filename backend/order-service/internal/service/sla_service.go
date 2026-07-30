package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
)

type slaService struct {
	repo       domain.SLARepository
	notifSvc   domain.NotificationService
	payoutRepo domain.PayoutRepository
}

func NewSLAService(repo domain.SLARepository, notifSvc domain.NotificationService, payoutRepo domain.PayoutRepository) domain.SLAService {
	return &slaService{
		repo:       repo,
		notifSvc:   notifSvc,
		payoutRepo: payoutRepo,
	}
}

func (s *slaService) SetSLADeadline(ctx context.Context, orderID string, legID uuid.UUID, model string, legNumber int) error {
	config, err := s.repo.GetConfig(ctx, model, legNumber)
	if err != nil {
		return err
	}
	if config == nil {
		// No SLA configured
		return nil
	}

	deadline := time.Now().Add(time.Duration(config.MaxMinutes) * time.Minute)
	return s.repo.SetLegSLADeadline(ctx, legID, deadline)
}

func (s *slaService) ProcessSLAWarnings(ctx context.Context) error {
	legs, err := s.repo.ListActiveLegs(ctx)
	if err != nil {
		return err
	}

	now := time.Now()
	for _, leg := range legs {
		config, err := s.repo.GetConfig(ctx, leg.Model, leg.LegNumber)
		if err != nil || config == nil {
			continue
		}

		timeRemaining := leg.SLADeadline.Sub(now).Minutes()
		if timeRemaining > 0 && timeRemaining <= float64(config.WarningMinutes) {
			// Trigger warning notification
			// In a real app, check Redis to ensure we don't spam the warning every minute
			msg := fmt.Sprintf("Waktu SLA Anda tersisa %.0f menit! Harap segera menyelesaikan tugas.", timeRemaining)
			_ = s.notifSvc.Send(ctx, domain.NotificationRequest{
				UserID:  leg.CourierID,
				Title:   "SLA Warning",
				Message: msg,
				Channel: domain.ChannelPush,
			})
		}
	}

	return nil
}

func (s *slaService) ProcessSLABreaches(ctx context.Context) error {
	legs, err := s.repo.ListActiveLegs(ctx)
	if err != nil {
		return err
	}

	now := time.Now()
	for _, leg := range legs {
		if now.After(leg.SLADeadline) {
			breachMinutes := int(now.Sub(leg.SLADeadline).Minutes())

			// If already breached, we might want to check if we already logged it today/for this leg
			// For simplicity, we just log once at the time of completion or we could update the log.
			// Let's assume we log it once when detected and then maybe later calculate exact penalty.
			// To avoid spamming, we should mark the leg as breached in the DB.
			// Let's create a SLALog.
			logRecord := &domain.SLALog{
				ID:               uuid.New(),
				OrderID:          leg.OrderID,
				LegID:            leg.LegID,
				CourierID:        leg.CourierID,
				SLADeadline:      leg.SLADeadline,
				BreachDetectedAt: now,
				BreachMinutes:    breachMinutes,
				PenaltyAmount:    0, // Will be calculated upon completion
				Status:           "detected",
				CreatedAt:        now,
			}

			// In a robust system, check if log already exists before saving
			err := s.repo.SaveSLALog(ctx, logRecord)
			if err != nil {
				log.Printf("Failed to save SLA breach log: %v", err)
			}

			// Inform Courier
			_ = s.notifSvc.Send(ctx, domain.NotificationRequest{
				UserID:  leg.CourierID,
				Title:   "SLA Terlampaui",
				Message: "Waktu SLA Anda telah habis. Penalti mungkin berlaku.",
				Channel: domain.ChannelPush,
			})
		}
	}
	return nil
}

func (s *slaService) ProcessIdleCompensation(ctx context.Context) error {
	// 10 minutes threshold for idle compensation
	threshold := time.Now().Add(-10 * time.Minute)
	idleCouriers, err := s.repo.GetIdleCouriers(ctx, threshold)
	if err != nil {
		return err
	}

	for _, courier := range idleCouriers {
		// Log or issue compensation. Here we could integrate with payout service.
		// For example, add compensation to the leg payout.
		log.Printf("Courier %s is idle for >10 mins at MP %s for order %s. Eligible for compensation.",
			courier.CourierID, courier.MeetingPointID, courier.OrderID)
		// We can add an entry or publish an event for idle compensation
	}

	return nil
}

func (s *slaService) GetComplianceDashboard(ctx context.Context, zoneID string, date string) (map[string]interface{}, error) {
	rate, err := s.repo.GetComplianceRate(ctx, zoneID, date)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"zone_id":                    zoneID,
		"date":                       date,
		"compliance_rate_percentage": rate * 100,
	}, nil
}
