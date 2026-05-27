package notification

import (
	"context"
	"log"

	"github.com/google/uuid"

	"tembus/order-service/internal/domain"
)

type stubNotificationService struct{}

func NewStubNotificationService() domain.NotificationService {
	return &stubNotificationService{}
}

func (s *stubNotificationService) Send(ctx context.Context, req domain.NotificationRequest) error {
	log.Printf("[NotificationStub] Sending %s to User %s: [%s] %s", req.Channel, req.UserID, req.Title, req.Message)
	return nil
}

func (s *stubNotificationService) GetInbox(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.Notification, error) {
	log.Printf("[NotificationStub] GetInbox for User %s", userID)
	return nil, nil
}

func (s *stubNotificationService) MarkAsRead(ctx context.Context, notificationID, userID uuid.UUID) error {
	log.Printf("[NotificationStub] MarkAsRead for Notification %s User %s", notificationID, userID)
	return nil
}

func (s *stubNotificationService) GetNotificationByID(ctx context.Context, id uuid.UUID) (*domain.Notification, error) {
	log.Printf("[NotificationStub] GetNotificationByID for Notification %s", id)
	return nil, nil
}

func (s *stubNotificationService) GetPreferences(ctx context.Context, userID uuid.UUID) (*domain.UserNotificationPreference, error) {
	return &domain.UserNotificationPreference{
		UserID:          userID,
		EmailEnabled:    true,
		PushEnabled:     true,
		SMSEnabled:      true,
		WhatsAppEnabled: true,
	}, nil
}

func (s *stubNotificationService) UpdatePreferences(ctx context.Context, prefs *domain.UserNotificationPreference) error {
	log.Printf("[NotificationStub] UpdatePreferences for User %s", prefs.UserID)
	return nil
}
