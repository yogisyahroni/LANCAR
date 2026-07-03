package service

import (
	"context"
	"encoding/json"
	"time"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/repository"

	"github.com/google/uuid"
)

type ChatService interface {
	SendMessage(ctx context.Context, orderID, senderID, senderName, senderRole, messageText, messageType string) (*domain.ChatMessage, error)
	GetMessages(ctx context.Context, orderID string) ([]domain.ChatMessage, error)
	MarkAsRead(ctx context.Context, orderID string, userID string, lastMessageID *string) error
}

type chatService struct {
	repo     repository.ChatRepository
	eventBus domain.EventBus
}

func NewChatService(repo repository.ChatRepository, eb domain.EventBus) ChatService {
	return &chatService{
		repo:     repo,
		eventBus: eb,
	}
}

func (s *chatService) SendMessage(ctx context.Context, orderID, senderID, senderName, senderRole, messageText, messageType string) (*domain.ChatMessage, error) {
	if messageType == "" {
		messageType = "text"
	}

	msg := &domain.ChatMessage{
		ID:          uuid.New().String(),
		OrderID:     orderID,
		SenderID:    senderID,
		SenderName:  senderName,
		SenderRole:  senderRole,
		MessageText: messageText,
		MessageType: messageType,
		CreatedAt:   time.Now(),
	}

	err := s.repo.SaveMessage(ctx, msg)
	if err != nil {
		return nil, err
	}

	// Prepare payload for websocket broadcast
	// The WSHandler expects JSON with order_id to route to the correct room.
	type ChatEvent struct {
		Action  string              `json:"action"`
		OrderID string              `json:"order_id"`
		Data    *domain.ChatMessage `json:"data"`
	}

	eventPayload := ChatEvent{
		Action:  "new_chat_message",
		OrderID: orderID,
		Data:    msg,
	}

	payloadBytes, _ := json.Marshal(eventPayload)
	// Publish to the event bus
	_ = s.eventBus.Publish(ctx, "order.chats", string(payloadBytes))

	return msg, nil
}

func (s *chatService) MarkAsRead(ctx context.Context, orderID string, userID string, lastMessageID *string) error {
	// Simple stub for now. Ideally updates `read_at` on messages in db
	return nil
}

func (s *chatService) GetMessages(ctx context.Context, orderID string) ([]domain.ChatMessage, error) {
	return s.repo.GetMessagesByOrderID(ctx, orderID)
}
