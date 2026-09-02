package service

import (
	"context"
	"tembus/order-service/internal/domain"
	"time"
)

// Auto-generated split of orderServiceImpl methods (god-file refactor).
func (s *orderServiceImpl) publishOrderEvent(ctx context.Context, orderID string, status domain.OrderStatus, message string) {
	event := domain.OrderEvent{
		OrderID:   orderID,
		Status:    status,
		Message:   message,
		CreatedAt: time.Now(),
	}
	if order, err := s.orderRepo.GetByID(ctx, orderID); err == nil && order != nil {
		event.StateVersion = order.StateVersion
	}
	event.EventVersion = event.CreatedAt.UnixNano()
	_ = s.eventRepo.SaveEvent(ctx, event)
	_ = s.eventBus.Publish(ctx, "order.updates", event)
}
