package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"tembus/order-service/internal/domain"
	"time"

	"github.com/google/uuid"
)

type carrierHandoffService struct {
	repo       domain.CarrierHandoffRepository
	awbClient  domain.AWBClient
	orderRepo  domain.OrderRepository
	configRepo domain.ConfigRepository
}

func NewCarrierHandoffService(repo domain.CarrierHandoffRepository, awbClient domain.AWBClient, orderRepo domain.OrderRepository, configRepo domain.ConfigRepository) domain.CarrierHandoffService {
	return &carrierHandoffService{repo: repo, awbClient: awbClient, orderRepo: orderRepo, configRepo: configRepo}
}

func (s *carrierHandoffService) CreateAWB(ctx context.Context, orderID string, req domain.AWBRequest) (*domain.AWBAttempt, error) {
	if strings.TrimSpace(orderID) == "" || strings.TrimSpace(req.Provider) == "" {
		return nil, fmt.Errorf("order_id and provider are required")
	}
	req.Provider = strings.ToLower(strings.TrimSpace(req.Provider))
	mode, err := s.resolveFirstMileMode(ctx, req.Provider, req.FirstMileMode)
	if err != nil {
		return nil, err
	}
	req.FirstMileMode = mode
	req.IdempotencyKey = "awb-create:" + orderID

	attempt, err := s.repo.CreateAWBAttempt(ctx, &domain.AWBAttempt{
		ID: uuid.NewString(), OrderID: orderID, IdempotencyKey: req.IdempotencyKey,
		Provider: req.Provider, FirstMileMode: mode, Status: domain.AWBCreationPending,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	})
	if err != nil {
		return nil, err
	}
	if attempt.Provider != req.Provider || attempt.FirstMileMode != mode {
		return nil, fmt.Errorf("existing AWB attempt has a different provider or first-mile mode")
	}
	if attempt.Status == domain.AWBCreationCreated && attempt.AWBNumber != "" {
		return attempt, nil
	}
	if s.awbClient == nil {
		return nil, fmt.Errorf("logistics integration is not available")
	}

	resp, err := s.awbClient.CreateAWB(ctx, req)
	if err != nil {
		if markErr := s.repo.MarkAWBFailed(ctx, attempt.ID, err.Error()); markErr != nil {
			slog.ErrorContext(ctx, "carrier_handoff: failed to persist AWB error", "attempt_id", attempt.ID, "error", markErr)
		}
		return nil, fmt.Errorf("create AWB: %w", err)
	}
	if resp == nil || strings.TrimSpace(resp.AWBNumber) == "" {
		_ = s.repo.MarkAWBFailed(ctx, attempt.ID, "provider returned empty AWB number")
		return nil, fmt.Errorf("provider returned empty AWB number")
	}
	if err := s.repo.MarkAWBCreated(ctx, attempt.ID, resp.AWBNumber, resp.TrackingURL); err != nil {
		return nil, err
	}
	attempt.Status = domain.AWBCreationCreated
	attempt.AWBNumber, attempt.TrackingURL, attempt.UpdatedAt = resp.AWBNumber, resp.TrackingURL, time.Now()
	return attempt, nil
}

func (s *carrierHandoffService) RecordHandoff(ctx context.Context, req domain.RecordCarrierHandoffRequest) (*domain.CarrierHandoff, error) {
	if strings.TrimSpace(req.OrderID) == "" || strings.TrimSpace(req.AWBNumber) == "" {
		return nil, fmt.Errorf("order_id and awb_number are required")
	}
	attempt, err := s.repo.GetAWBAttemptByOrder(ctx, req.OrderID)
	if err != nil {
		return nil, err
	}
	if attempt == nil || attempt.Status != domain.AWBCreationCreated || attempt.AWBNumber != req.AWBNumber {
		return nil, fmt.Errorf("created AWB attempt not found for order")
	}
	if attempt.FirstMileMode == domain.FirstMileLancarPickup {
		if strings.TrimSpace(req.ActorID) == "" || req.LocationLat == nil || req.LocationLng == nil || len(req.EvidenceURLs) == 0 {
			return nil, fmt.Errorf("lancar_pickup requires actor, location, and evidence")
		}
	}
	if req.ActorID == "" {
		return nil, fmt.Errorf("actor_id is required")
	}
	if req.ActorType == "" {
		req.ActorType = "courier"
	}
	now := time.Now()
	return s.repo.CreateCarrierHandoff(ctx, &domain.CarrierHandoff{
		ID: uuid.NewString(), AWBAttemptID: attempt.ID, OrderID: req.OrderID,
		Provider: attempt.Provider, AWBNumber: req.AWBNumber, FirstMileMode: attempt.FirstMileMode,
		Status: domain.CarrierHandoffRecorded, HandedOffAt: now, LocationLat: req.LocationLat,
		LocationLng: req.LocationLng, LocationAddress: req.LocationAddress,
		EvidenceURLs: req.EvidenceURLs, ActorID: req.ActorID, ActorType: req.ActorType,
		CreatedAt: now, UpdatedAt: now,
	})
}

func (s *carrierHandoffService) ApplyCarrierAcceptance(ctx context.Context, event domain.CarrierAcceptanceEvent) error {
	if strings.TrimSpace(event.Provider) == "" || strings.TrimSpace(event.AWBNumber) == "" {
		return fmt.Errorf("provider and awb_number are required")
	}
	attempt, err := s.repo.GetAWBAttemptByAWB(ctx, event.Provider, event.AWBNumber)
	if err != nil {
		return err
	}
	if attempt == nil {
		return fmt.Errorf("AWB attempt not found")
	}
	acceptedAt := event.AcceptedAt
	if acceptedAt.IsZero() {
		acceptedAt = time.Now()
	}
	if err := s.repo.MarkCarrierAccepted(ctx, attempt.ID, event.ProviderRef, acceptedAt); err != nil {
		return err
	}
	// Provider acceptance is deliberately recorded separately from order status;
	// the normalized provider event consumer owns lifecycle transitions.
	return nil
}

func (s *carrierHandoffService) resolveFirstMileMode(ctx context.Context, provider string, requested domain.FirstMileMode) (domain.FirstMileMode, error) {
	provider = strings.ToLower(strings.TrimSpace(provider))
	mode := requested
	if mode == "" {
		mode = domain.FirstMileMode(s.configRepo.GetStringConfig(ctx, "awb_"+provider+"_first_mile_mode", ""))
	}
	var capabilities []string
	if raw := s.configRepo.GetStringConfig(ctx, "awb_"+provider+"_first_mile_modes", ""); raw != "" {
		if err := json.Unmarshal([]byte(raw), &capabilities); err != nil {
			return "", fmt.Errorf("invalid %s first-mile capability config", provider)
		}
	}
	if len(capabilities) == 0 {
		return "", fmt.Errorf("first-mile capability is not configured for provider %s", provider)
	}
	for _, capability := range capabilities {
		if domain.FirstMileMode(capability) == mode {
			return mode, nil
		}
	}
	return "", fmt.Errorf("first-mile mode %q is not supported by provider %s", mode, provider)
}
