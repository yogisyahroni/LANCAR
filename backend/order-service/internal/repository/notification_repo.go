package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"lancar/order-service/internal/domain"
)

type PostgresNotificationRepo struct {
	db *sqlx.DB
}

func NewPostgresNotificationRepo(db *sqlx.DB) *PostgresNotificationRepo {
	return &PostgresNotificationRepo{db: db}
}

func (r *PostgresNotificationRepo) SaveNotification(ctx context.Context, notif *domain.Notification) error {
	query := `
		INSERT INTO notifications (
			id, user_id, title, body, type, icon, image_url, deep_link, 
			channel, is_read, push_status, push_error, metadata, created_at
		) VALUES (
			:id, :user_id, :title, :body, :type, :icon, :image_url, :deep_link, 
			:channel, :is_read, :push_status, :push_error, :metadata, :created_at
		)
	`
	_, err := r.db.NamedExecContext(ctx, query, notif)
	return err
}

func (r *PostgresNotificationRepo) UpdatePushStatus(ctx context.Context, id uuid.UUID, status string, errStr *string) error {
	query := `UPDATE notifications SET push_status = $1, push_error = $2, sent_at = NOW() WHERE id = $3`
	_, err := r.db.ExecContext(ctx, query, status, errStr, id)
	return err
}

func (r *PostgresNotificationRepo) GetNotificationsByUserID(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.Notification, error) {
	var notifs []domain.Notification
	query := `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`
	err := r.db.SelectContext(ctx, &notifs, query, userID, limit, offset)
	return notifs, err
}

func (r *PostgresNotificationRepo) MarkAsRead(ctx context.Context, notificationID, userID uuid.UUID) error {
	query := `UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = $1 AND user_id = $2`
	_, err := r.db.ExecContext(ctx, query, notificationID, userID)
	return err
}

func (r *PostgresNotificationRepo) GetTemplateByKey(ctx context.Context, key string, channel domain.NotificationChannel) (*domain.NotificationTemplate, error) {
	var template domain.NotificationTemplate
	query := `SELECT * FROM notification_templates WHERE key = $1 AND channel = $2 AND is_active = TRUE LIMIT 1`
	err := r.db.GetContext(ctx, &template, query, key, channel)
	if err != nil {
		return nil, err
	}
	return &template, nil
}

func (r *PostgresNotificationRepo) SaveTemplate(ctx context.Context, template *domain.NotificationTemplate) error {
	query := `
		INSERT INTO notification_templates (id, key, channel, title, body, is_active, created_at, updated_at)
		VALUES (:id, :key, :channel, :title, :body, :is_active, :created_at, :updated_at)
		ON CONFLICT (key) DO UPDATE SET 
			title = EXCLUDED.title,
			body = EXCLUDED.body,
			is_active = EXCLUDED.is_active,
			updated_at = NOW()
	`
	_, err := r.db.NamedExecContext(ctx, query, template)
	return err
}

func (r *PostgresNotificationRepo) ListTemplates(ctx context.Context) ([]domain.NotificationTemplate, error) {
	var templates []domain.NotificationTemplate
	query := `SELECT * FROM notification_templates ORDER BY key ASC`
	err := r.db.SelectContext(ctx, &templates, query)
	return templates, err
}

func (r *PostgresNotificationRepo) GetPreferences(ctx context.Context, userID uuid.UUID) (*domain.UserNotificationPreference, error) {
	var prefs domain.UserNotificationPreference
	query := `SELECT * FROM user_notification_preferences WHERE user_id = $1 LIMIT 1`
	err := r.db.GetContext(ctx, &prefs, query, userID)
	if err != nil {
		// If not found, return default preferences
		return &domain.UserNotificationPreference{
			UserID:         userID,
			EmailEnabled:   true,
			PushEnabled:    true,
			SMSEnabled:     true,
			WhatsAppEnabled: true,
		}, nil
	}
	return &prefs, nil
}

func (r *PostgresNotificationRepo) UpdatePreferences(ctx context.Context, prefs *domain.UserNotificationPreference) error {
	query := `
		INSERT INTO user_notification_preferences (user_id, email_enabled, push_enabled, sms_enabled, whatsapp_enabled, updated_at)
		VALUES (:user_id, :email_enabled, :push_enabled, :sms_enabled, :whatsapp_enabled, NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			email_enabled = EXCLUDED.email_enabled,
			push_enabled = EXCLUDED.push_enabled,
			sms_enabled = EXCLUDED.sms_enabled,
			whatsapp_enabled = EXCLUDED.whatsapp_enabled,
			updated_at = NOW()
	`
	_, err := r.db.NamedExecContext(ctx, query, prefs)
	return err
}
