package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"tembus/order-service/internal/domain"

	"github.com/google/uuid"
)

type carrierEventService struct {
	repo      domain.CarrierEventRepository
	orderRepo interface {
		GetByAWB(ctx context.Context, awb string) (*domain.Order, error)
		UpdateStatus(ctx context.Context, id string, status domain.OrderStatus) error
	}
	eventRepo         domain.OrderEventRepository
	carrierHandoffSvc domain.CarrierHandoffService
	financeSvc        domain.AggregatorFinanceService
}

func NewCarrierEventService(
	repo domain.CarrierEventRepository,
	orderRepo interface {
		GetByAWB(ctx context.Context, awb string) (*domain.Order, error)
		UpdateStatus(ctx context.Context, id string, status domain.OrderStatus) error
	},
	eventRepo domain.OrderEventRepository,
	carrierHandoffSvc ...domain.CarrierHandoffService,
) domain.CarrierEventService {
	var handoffSvc domain.CarrierHandoffService
	if len(carrierHandoffSvc) > 0 {
		handoffSvc = carrierHandoffSvc[0]
	}
	return &carrierEventService{repo: repo, orderRepo: orderRepo, eventRepo: eventRepo, carrierHandoffSvc: handoffSvc}
}

// NewCarrierEventServiceWithDependencies wires optional aggregator side effects
// while keeping NewCarrierEventService compatible with existing consumers.
func NewCarrierEventServiceWithDependencies(
	repo domain.CarrierEventRepository,
	orderRepo interface {
		GetByAWB(ctx context.Context, awb string) (*domain.Order, error)
		UpdateStatus(ctx context.Context, id string, status domain.OrderStatus) error
	},
	eventRepo domain.OrderEventRepository,
	handoffSvc domain.CarrierHandoffService,
	financeSvc domain.AggregatorFinanceService,
) domain.CarrierEventService {
	return &carrierEventService{
		repo: repo, orderRepo: orderRepo, eventRepo: eventRepo,
		carrierHandoffSvc: handoffSvc, financeSvc: financeSvc,
	}
}

func (s *carrierEventService) Process(ctx context.Context, event *domain.CarrierEvent) error {
	if event == nil || strings.TrimSpace(event.Provider) == "" || strings.TrimSpace(event.EventID) == "" || strings.TrimSpace(event.AWBNumber) == "" {
		return fmt.Errorf("provider, event_id, and awb_number are required")
	}
	// Keep provider-native fields complete even when an older gateway payload
	// only sends the raw_* aliases. Unknown canonical states remain UNKNOWN.
	event.ProviderStatus = firstNonEmpty(event.ProviderStatus, event.RawStatus)
	event.RawStatus = firstNonEmpty(event.RawStatus, event.ProviderStatus, "UNKNOWN")
	event.ProviderCode = firstNonEmpty(event.ProviderCode, event.RawCode)
	event.RawCode = firstNonEmpty(event.RawCode, event.ProviderCode)
	event.ProviderDetail = firstNonEmpty(event.ProviderDetail, event.RawDescription)
	event.RawDescription = firstNonEmpty(event.RawDescription, event.ProviderDetail)
	event.ProviderLocation = firstNonEmpty(event.ProviderLocation, event.RawLocation)
	event.RawLocation = firstNonEmpty(event.RawLocation, event.ProviderLocation)
	event.CanonicalStatus = firstNonEmpty(strings.ToUpper(strings.TrimSpace(event.CanonicalStatus)), "UNKNOWN")
	inserted, err := s.repo.InsertIfNew(ctx, event)
	if err != nil {
		return err
	}
	if isCarrierAcceptanceEvent(event.CanonicalStatus) && s.carrierHandoffSvc != nil {
		acceptedAt := event.ReceivedAt
		if event.OccurredAt != nil {
			acceptedAt = *event.OccurredAt
		}
		acceptanceErr := s.carrierHandoffSvc.ApplyCarrierAcceptance(ctx, domain.CarrierAcceptanceEvent{
			Provider:    event.Provider,
			AWBNumber:   event.AWBNumber,
			ProviderRef: event.EventID,
			AcceptedAt:  acceptedAt,
		})
		if acceptanceErr != nil &&
			!errors.Is(acceptanceErr, domain.ErrAWBAttemptNotFound) &&
			!errors.Is(acceptanceErr, domain.ErrCarrierHandoffNotFound) {
			return fmt.Errorf("apply carrier acceptance: %w", acceptanceErr)
		}
		if acceptanceErr != nil {
			slog.WarnContext(ctx, "carrier_event: acceptance recorded later because handoff state is not ready",
				"provider", event.Provider, "awb_number", event.AWBNumber, "event_id", event.EventID, "error", acceptanceErr)
		}
	}
	if !inserted {
		return nil
	}

	order, err := s.orderRepo.GetByAWB(ctx, event.AWBNumber)
	if err != nil {
		return fmt.Errorf("find order for carrier event: %w", err)
	}
	if order == nil {
		slog.WarnContext(ctx, "carrier_event: unknown AWB stored in inbox", "provider", event.Provider, "awb_number", event.AWBNumber, "event_id", event.EventID)
		return nil
	}
	if exceptionType := carrierExceptionType(event.CanonicalStatus); exceptionType != "" && s.financeSvc != nil {
		orderID, parseErr := uuid.Parse(strings.TrimSpace(order.ID))
		if parseErr != nil {
			return fmt.Errorf("create logistics exception claim: invalid order id %q: %w", order.ID, parseErr)
		}
		if _, claimErr := s.financeSvc.SubmitClaim(ctx, &domain.LogisticsExceptionClaim{
			OrderID: orderID, AWBNumber: event.AWBNumber, ExceptionType: exceptionType,
			ProviderName: event.Provider, ClaimAmountIDR: order.LogisticsTariffIDR,
			Notes: "Dibuat otomatis dari event carrier terverifikasi: " + event.CanonicalStatus,
		}); claimErr != nil {
			return fmt.Errorf("create logistics exception claim: %w", claimErr)
		}
	}

	target, ok := canonicalOrderStatus(event.CanonicalStatus)
	if !ok {
		return nil
	}
	if terminalOrderStatus(order.Status) || !statusCanAdvance(order.Status, target) {
		slog.InfoContext(ctx, "carrier_event: out-of-order event stored without state regression", "order_id", order.ID, "current", order.Status, "incoming", target, "event_id", event.EventID)
		return nil
	}
	if transitionRepo, ok := s.orderRepo.(domain.OrderTransitionRepository); ok {
		proofReference := ""
		if target == domain.StatusDelivered {
			// The integration gateway only forwards a verified provider event;
			// retain that native event ID as the immutable delivery proof ref.
			proofReference = event.EventID
		}
		_, err := transitionRepo.TransitionOrder(ctx, domain.OrderTransitionRequest{
			OrderID:        order.ID,
			ActorID:        "provider:" + event.Provider,
			Actor:          domain.OrderActorCarrier,
			TargetStatus:   target,
			IdempotencyKey: "carrier-event:" + event.Provider + ":" + event.EventID,
			EventMessage:   event.RawDescription,
			ProofReference: proofReference,
		})
		if err != nil {
			return fmt.Errorf("apply carrier event status transactionally: %w", err)
		}
	} else {
		if err := s.orderRepo.UpdateStatus(ctx, order.ID, target); err != nil {
			return fmt.Errorf("apply carrier event status: %w", err)
		}
		if s.eventRepo != nil {
			_ = s.eventRepo.SaveEvent(ctx, domain.OrderEvent{OrderID: order.ID, UserID: order.CustomerID, Status: target, Message: event.RawDescription, CreatedAt: event.ReceivedAt})
		}
	}
	return nil
}

func isCarrierAcceptanceEvent(status string) bool {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "HANDED_TO_CARRIER", "IN_TRANSIT", "AT_SORTING_CENTER", "OUT_FOR_DELIVERY":
		return true
	default:
		return false
	}
}

func carrierExceptionType(status string) string {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "RETURN_REQUESTED", "RETURN_IN_TRANSIT", "RETURNED_TO_SENDER", "RETURN_TO_SENDER", "RETURNED":
		return "RETURN"
	case "DELIVERY_FAILED", "EXCEPTION":
		return "FAILED_DELIVERY"
	default:
		return ""
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func canonicalOrderStatus(status string) (domain.OrderStatus, bool) {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "CREATED", "AWB_ISSUED", "PICKUP_SCHEDULED", "READY_FOR_PICKUP":
		return domain.StatusReadyForPickup, true
	case "PICKED_UP", "PICKUP":
		return domain.StatusPickedUp, true
	case "HANDED_TO_CARRIER", "IN_TRANSIT", "AT_SORTING_CENTER", "OUT_FOR_DELIVERY", "INBOUND_DESTINATION", "OUTBOUND_ORIGIN":
		return domain.StatusDelivering, true
	case "DELIVERED":
		return domain.StatusDelivered, true
	case "RETURN_REQUESTED", "RETURN_IN_TRANSIT", "RETURNED_TO_SENDER", "RETURN_TO_SENDER", "RETURNED":
		return domain.StatusReturnToSender, true
	case "DELIVERY_FAILED", "EXCEPTION", "LOST", "DAMAGED":
		return domain.StatusFailedDelivery, true
	case "CANCELLED", "CANCELED":
		return domain.StatusCancelled, true
	default:
		return "", false
	}
}

func terminalOrderStatus(status domain.OrderStatus) bool {
	switch status {
	case domain.StatusDelivered, domain.StatusCancelled, domain.StatusReturnToSender, domain.StatusFailedDelivery:
		return true
	default:
		return false
	}
}

func statusCanAdvance(current, target domain.OrderStatus) bool {
	rank := map[domain.OrderStatus]int{
		domain.StatusPending: 10, domain.StatusReadyForPickup: 20, domain.StatusPickedUp: 30,
		domain.StatusDelivering: 40, domain.StatusDelivered: 50, domain.StatusReturnToSender: 50,
		domain.StatusCancelled: 50,
	}
	return rank[target] >= rank[current]
}
