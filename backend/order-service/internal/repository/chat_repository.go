package repository

import (
	"context"

	"tembus/order-service/internal/domain"

	"github.com/jmoiron/sqlx"
)

type ChatRepository interface {
	SaveMessage(ctx context.Context, msg *domain.ChatMessage) error
	GetMessagesByOrderID(ctx context.Context, orderID string) ([]domain.ChatMessage, error)
}

type chatRepository struct {
	db *sqlx.DB
}

func NewChatRepository(db *sqlx.DB) ChatRepository {
	return &chatRepository{db: db}
}

func (r *chatRepository) SaveMessage(ctx context.Context, msg *domain.ChatMessage) error {
	query := `
		INSERT INTO chat_messages (id, order_id, sender_id, sender_name, sender_role, message_text, message_type, created_at)
		VALUES (:id, :order_id, :sender_id, :sender_name, :sender_role, :message_text, :message_type, :created_at)
	`
	_, err := r.db.NamedExecContext(ctx, query, msg)
	return err
}

func (r *chatRepository) GetMessagesByOrderID(ctx context.Context, orderID string) ([]domain.ChatMessage, error) {
	query := `
		SELECT id, order_id, sender_id, sender_name, sender_role, message_text, message_type, created_at
		FROM chat_messages
		WHERE order_id = $1
		ORDER BY created_at ASC
	`
	var messages []domain.ChatMessage
	err := r.db.SelectContext(ctx, &messages, query, orderID)
	if err != nil {
		return nil, err
	}
	return messages, nil
}
