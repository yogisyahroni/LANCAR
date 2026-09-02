package service

import (
	"context"
	"tembus/order-service/internal/domain"
	"time"

	"github.com/google/uuid"
)

// Auto-generated split of orderServiceImpl methods (god-file refactor).
func (s *orderServiceImpl) publishOrderEvent(ctx context.Context, orderID string, status domain.OrderStatus, message string) {
	// CORE-2026-007: stamp monotonic version + correlation id before saving
	// so clients can discard out-of-order/duplicate WS events.
	var version uint64
	if v, err := s.eventRepo.NextEventVersion(ctx, orderID); err == nil {
		version = v
	}
	event := domain.OrderEvent{
		ID:         uuid.NewString(),
		OrderID:    orderID,
		Status:     status,
		Message:    message,
		CreatedAt:  time.Now(),
		Version:    version,
	}
	_ = s.eventRepo.SaveEvent(ctx, event)
	_ = s.eventBus.Publish(ctx, "order.updates", event)
}
