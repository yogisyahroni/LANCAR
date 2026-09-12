package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"

	"github.com/jmoiron/sqlx"
)

type ChatRepository interface {
	SaveMessage(ctx context.Context, msg *domain.ChatMessage) error
	GetMessagesByOrderID(ctx context.Context, orderID string) ([]domain.ChatMessage, error)
	CanAccessOrder(ctx context.Context, orderID, userID, role string) (bool, error)
	ReportChat(ctx context.Context, orderID, reporterID, messageID, reason string) error
	AuditAccess(ctx context.Context, actorID, orderID, role, operation string) error
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

func (r *chatRepository) CanAccessOrder(ctx context.Context, orderID, userID, role string) (bool, error) {
	if orderID == "" || userID == "" {
		return false, nil
	}
	var allowed bool
	err := r.db.GetContext(ctx, &allowed, `
		SELECT EXISTS(
			SELECT 1 FROM orders o
			LEFT JOIN merchants m ON m.id = o.merchant_id
			WHERE o.id = $1 AND (
				o.customer_id = $2::uuid
				OR EXISTS (SELECT 1 FROM order_legs l WHERE l.order_id=o.id AND l.courier_id=$2::uuid)
				OR (m.user_id = $2::uuid AND $3 IN ('merchant','merchant_admin'))
				OR ($3 IN ('ops_admin','finance_admin','cs_agent','super_admin','admin'))
			)
		)`, orderID, userID, role)
	if err != nil {
		return false, fmt.Errorf("authorize order chat: %w", err)
	}
	return allowed, nil
}

func (r *chatRepository) ReportChat(ctx context.Context, orderID, reporterID, messageID, reason string) error {
	var message any
	if messageID != "" {
		message = messageID
	}
	_, err := r.db.ExecContext(ctx, `INSERT INTO communication_chat_reports(order_id,reported_by,message_id,reason) VALUES($1,$2,$3,$4)`, orderID, reporterID, message, reason)
	return err
}

func (r *chatRepository) AuditAccess(ctx context.Context, actorID, orderID, role, operation string) error {
	actor, err := uuid.Parse(actorID)
	if err != nil {
		return err
	}
	target, err := uuid.Parse(orderID)
	if err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]string{"role": role, "operation": operation, "surface": "order_chat"})
	_, err = r.db.ExecContext(ctx, `INSERT INTO audit_logs(actor_id,action,target_id,payload) VALUES($1,$2,$3,$4)`, actor, "communication.chat."+operation, target, string(payload))
	return err
}
