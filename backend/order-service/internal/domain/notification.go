package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type NotificationChannel string

const (
	ChannelWhatsApp  NotificationChannel = "whatsapp"
	ChannelPush      NotificationChannel = "push"
	ChannelWebSocket NotificationChannel = "websocket"
	ChannelSMS       NotificationChannel = "sms"
	ChannelEmail     NotificationChannel = "email"
	ChannelInApp     NotificationChannel = "in_app"
)

type NotificationRequest struct {
	UserID  string              `json:"user_id"`
	Title   string              `json:"title"`
	Message string              `json:"message"`
	Channel NotificationChannel `json:"channel"`
	Data    map[string]string   `json:"data,omitempty"`
}

type Notification struct {
	ID         uuid.UUID           `json:"id" db:"id"`
	UserID     uuid.UUID           `json:"user_id" db:"user_id"`
	Title      string              `json:"title" db:"title"`
	Body       string              `json:"body" db:"body"`
	Type       string              `json:"type" db:"type"`
	Icon       *string             `json:"icon" db:"icon"`
	ImageURL   *string             `json:"image_url" db:"image_url"`
	DeepLink   *string             `json:"deep_link" db:"deep_link"`
	Channel    NotificationChannel `json:"channel" db:"channel"`
	IsRead     bool                `json:"is_read" db:"is_read"`
	ReadAt     *time.Time          `json:"read_at" db:"read_at"`
	PushStatus *string             `json:"push_status" db:"push_status"`
	PushError  *string             `json:"push_error" db:"push_error"`
	SentAt     *time.Time          `json:"sent_at" db:"sent_at"`
	OrderID    *uuid.UUID          `json:"order_id" db:"order_id"`
	Metadata   *string             `json:"metadata" db:"metadata"` // JSON string
	CreatedAt  time.Time           `json:"created_at" db:"created_at"`
}

type NotificationTemplate struct {
	ID        uuid.UUID           `json:"id" db:"id"`
	Key       string              `json:"key" db:"key"`
	Channel   NotificationChannel `json:"channel" db:"channel"`
	Title     *string             `json:"title" db:"title"`
	Body      string              `json:"body" db:"body"`
	IsActive  bool                `json:"is_active" db:"is_active"`
	CreatedAt time.Time           `json:"created_at" db:"created_at"`
	UpdatedAt time.Time           `json:"updated_at" db:"updated_at"`
}

type UserNotificationPreference struct {
	UserID          uuid.UUID `json:"user_id" db:"user_id"`
	EmailEnabled    bool      `json:"email_enabled" db:"email_enabled"`
	PushEnabled     bool      `json:"push_enabled" db:"push_enabled"`
	SMSEnabled      bool      `json:"sms_enabled" db:"sms_enabled"`
	WhatsAppEnabled bool      `json:"whatsapp_enabled" db:"whatsapp_enabled"`
	UpdatedAt       time.Time `json:"updated_at" db:"updated_at"`
}

// MerchantNotificationPreferences menyimpan preferensi operasional merchant.
// Dipisahkan dari preferensi channel legacy agar empat kontrol di aplikasi
// merchant dapat disimpan secara independen.
type MerchantNotificationPreferences struct {
	UserID              uuid.UUID `json:"user_id" db:"user_id"`
	NewOrderAlerts      bool      `json:"new_order_alerts" db:"new_order_alerts"`
	OrderCancellations  bool      `json:"order_cancellations" db:"order_cancellations"`
	DailySummaryReports bool      `json:"daily_summary_reports" db:"daily_summary_reports"`
	PromotionalUpdates  bool      `json:"promotional_updates" db:"promotional_updates"`
	UpdatedAt           time.Time `json:"updated_at" db:"updated_at"`
}

func (p *UserNotificationPreference) IsChannelEnabled(channel NotificationChannel) bool {
	switch channel {
	case ChannelEmail:
		return p.EmailEnabled
	case ChannelPush:
		return p.PushEnabled
	case ChannelSMS:
		return p.SMSEnabled
	case ChannelWhatsApp:
		return p.WhatsAppEnabled
	case ChannelInApp, ChannelWebSocket:
		return true // Always enabled
	default:
		return true
	}
}

type NotificationService interface {
	Send(ctx context.Context, req NotificationRequest) error
	GetInbox(ctx context.Context, userID uuid.UUID, limit, offset int) ([]Notification, error)
	MarkAsRead(ctx context.Context, notificationID, userID uuid.UUID) error
	GetPreferences(ctx context.Context, userID uuid.UUID) (*UserNotificationPreference, error)
	UpdatePreferences(ctx context.Context, prefs *UserNotificationPreference) error
}

type NotificationRepository interface {
	SaveNotification(ctx context.Context, notif *Notification) error
	UpdatePushStatus(ctx context.Context, id uuid.UUID, status string, errStr *string) error
	GetNotificationByID(ctx context.Context, id uuid.UUID) (*Notification, error)
	GetNotificationsByUserID(ctx context.Context, userID uuid.UUID, limit, offset int) ([]Notification, error)
	MarkAsRead(ctx context.Context, notificationID, userID uuid.UUID) error
	GetTemplateByKey(ctx context.Context, key string, channel NotificationChannel) (*NotificationTemplate, error)
	SaveTemplate(ctx context.Context, template *NotificationTemplate) error
	ListTemplates(ctx context.Context) ([]NotificationTemplate, error)
	GetPreferences(ctx context.Context, userID uuid.UUID) (*UserNotificationPreference, error)
	UpdatePreferences(ctx context.Context, prefs *UserNotificationPreference) error
	GetMerchantNotificationPreferences(ctx context.Context, userID uuid.UUID) (*MerchantNotificationPreferences, error)
	UpdateMerchantNotificationPreferences(ctx context.Context, prefs *MerchantNotificationPreferences) error
}
