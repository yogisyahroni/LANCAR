package service

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"tembus/order-service/internal/domain"
)

type carrierEventService struct {
	repo      domain.CarrierEventRepository
	orderRepo domain.OrderRepository
	eventRepo domain.OrderEventRepository
}

func NewCarrierEventService(repo domain.CarrierEventRepository, orderRepo domain.OrderRepository, eventRepo domain.OrderEventRepository) domain.CarrierEventService {
	return &carrierEventService{repo: repo, orderRepo: orderRepo, eventRepo: eventRepo}
}

func (s *carrierEventService) Process(ctx context.Context, event *domain.CarrierEvent) error {
	if event == nil || strings.TrimSpace(event.Provider) == "" || strings.TrimSpace(event.EventID) == "" || strings.TrimSpace(event.AWBNumber) == "" {
		return fmt.Errorf("provider, event_id, and awb_number are required")
	}
	inserted, err := s.repo.InsertIfNew(ctx, event)
	if err != nil {
		return err
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

	target, ok := canonicalOrderStatus(event.CanonicalStatus)
	if !ok {
		return nil
	}
	if terminalOrderStatus(order.Status) || !statusCanAdvance(order.Status, target) {
		slog.InfoContext(ctx, "carrier_event: out-of-order event stored without state regression", "order_id", order.ID, "current", order.Status, "incoming", target, "event_id", event.EventID)
		return nil
	}
	if err := s.orderRepo.UpdateStatus(ctx, order.ID, target); err != nil {
		return fmt.Errorf("apply carrier event status: %w", err)
	}
	if s.eventRepo != nil {
		_ = s.eventRepo.SaveEvent(ctx, domain.OrderEvent{OrderID: order.ID, Status: target, Message: event.RawDescription, CreatedAt: event.ReceivedAt})
	}
	return nil
}

func canonicalOrderStatus(status string) (domain.OrderStatus, bool) {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "MANIFESTED", "READY_FOR_PICKUP":
		return domain.StatusReadyForPickup, true
	case "PICKED_UP", "PICKUP":
		return domain.StatusPickedUp, true
	case "IN_TRANSIT", "INBOUND_DESTINATION", "OUTBOUND_ORIGIN":
		return domain.StatusDelivering, true
	case "DELIVERED":
		return domain.StatusDelivered, true
	case "RETURN_TO_SENDER", "RETURNED":
		return domain.StatusReturnToSender, true
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
