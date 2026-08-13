package service

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/google/uuid"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/domain/queue"
)

type NotificationServiceImpl struct {
	repo  domain.NotificationRepository
	queue queue.Queue
}

func NewNotificationService(repo domain.NotificationRepository, q queue.Queue) domain.NotificationService {
	return &NotificationServiceImpl{
		repo:  repo,
		queue: q,
	}
}

func (s *NotificationServiceImpl) Send(ctx context.Context, req domain.NotificationRequest) error {
	userUUID, err := uuid.Parse(req.UserID)
	if err != nil {
		return err
	}

	metaBytes, _ := json.Marshal(req.Data)
	metaStr := string(metaBytes)

	// Default to system type if not specified
	notifType := "system"
	if t, ok := req.Data["type"]; ok {
		notifType = t
	}

	notif := &domain.Notification{
		ID:         uuid.New(),
		UserID:     userUUID,
		Title:      req.Title,
		Body:       req.Message,
		Type:       notifType,
		Channel:    req.Channel,
		IsRead:     false,
		PushStatus: ptrString("pending"),
		Metadata:   &metaStr,
		// UAT-C-040..044: CreatedAt wajib diisi — zero value tersimpan
		// sebagai 0001-01-01 di DB (bug terlihat di inbox customer).
		CreatedAt: time.Now(),
	}

	// For order updates, link the order_id
	if orderIDStr, ok := req.Data["order_id"]; ok {
		if oid, err := uuid.Parse(orderIDStr); err == nil {
			notif.OrderID = &oid
		}
	}

	// Check user preferences
	prefs, err := s.repo.GetPreferences(ctx, userUUID)
	if err == nil && !prefs.IsChannelEnabled(req.Channel) {
		// If disabled, just log and mark as skipped
		log.Printf("Notification skipped for User %s due to preferences (channel: %s)", req.UserID, req.Channel)
		notif.PushStatus = ptrString("skipped_by_preference")
	}

	if err := s.repo.SaveNotification(ctx, notif); err != nil {
		return err
	}

	// Only queue if not skipped
	if *notif.PushStatus == "pending" {
		// Push task to message queue for async delivery (e.g. FCM/APNs/WhatsApp)
		task := queue.Task{
			Type: "send_notification",
			Payload: map[string]interface{}{
				"notification_id": notif.ID.String(),
				"channel":         string(notif.Channel),
			},
		}

		if s.queue != nil {
			if err := s.queue.Push(ctx, task); err != nil {
				log.Printf("Failed to queue notification task: %v", err)
				// Return nil since we successfully saved to inbox, delivery will be retried
			}
		}
	}

	return nil
}

func (s *NotificationServiceImpl) GetInbox(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.Notification, error) {
	return s.repo.GetNotificationsByUserID(ctx, userID, limit, offset)
}

func (s *NotificationServiceImpl) MarkAsRead(ctx context.Context, notificationID, userID uuid.UUID) error {
	return s.repo.MarkAsRead(ctx, notificationID, userID)
}

func (s *NotificationServiceImpl) GetPreferences(ctx context.Context, userID uuid.UUID) (*domain.UserNotificationPreference, error) {
	return s.repo.GetPreferences(ctx, userID)
}

func (s *NotificationServiceImpl) UpdatePreferences(ctx context.Context, prefs *domain.UserNotificationPreference) error {
	return s.repo.UpdatePreferences(ctx, prefs)
}

func ptrString(str string) *string {
	return &str
}
