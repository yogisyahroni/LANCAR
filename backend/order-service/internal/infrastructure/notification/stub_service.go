package notification

import (
	"context"
	"lancar/order-service/internal/domain"
	"log"
)

type stubNotificationService struct{}

func NewStubNotificationService() domain.NotificationService {
	return &stubNotificationService{}
}

func (s *stubNotificationService) Send(ctx context.Context, req domain.NotificationRequest) error {
	log.Printf("[NotificationStub] Sending %s to User %s: [%s] %s", req.Channel, req.UserID, req.Title, req.Message)
	return nil
}
