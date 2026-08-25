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
	_ = s.eventRepo.SaveEvent(ctx, event)
	_ = s.eventBus.Publish(ctx, "order.updates", event)
}
