package service

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/repository"

	"github.com/google/uuid"
)

var (
	ErrChatUnauthorized   = errors.New("chat participant is not authorized for this order")
	ErrInvalidChatMessage = errors.New("invalid chat message")
	ErrInvalidChatReport  = errors.New("invalid chat report")
)

type ChatService interface {
	SendMessage(ctx context.Context, orderID, senderID, senderName, senderRole, messageText, messageType string) (*domain.ChatMessage, error)
	GetMessages(ctx context.Context, orderID, userID, userRole string) ([]domain.ChatMessage, error)
	MarkAsRead(ctx context.Context, orderID string, userID, userRole string, lastMessageID *string) error
	ReportChat(ctx context.Context, orderID, reporterID, reporterRole, messageID, reason string) error
}

type chatService struct {
	repo     repository.ChatRepository
	eventBus domain.EventBus
}

func (s *chatService) auditAccess(ctx context.Context, actorID, orderID, role, operation string) error {
	return s.repo.AuditAccess(ctx, actorID, orderID, role, operation)
}

func NewChatService(repo repository.ChatRepository, eb domain.EventBus) ChatService {
	return &chatService{
		repo:     repo,
		eventBus: eb,
	}
}

func (s *chatService) SendMessage(ctx context.Context, orderID, senderID, senderName, senderRole, messageText, messageType string) (*domain.ChatMessage, error) {
	allowed, err := s.repo.CanAccessOrder(ctx, orderID, senderID, senderRole)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, ErrChatUnauthorized
	}
	if err := s.auditAccess(ctx, senderID, orderID, senderRole, "send"); err != nil {
		return nil, err
	}
	messageText = maskContactDetails(messageText)
	if strings.TrimSpace(messageText) == "" || len([]rune(messageText)) > 2000 {
		return nil, ErrInvalidChatMessage
	}
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

	err = s.repo.SaveMessage(ctx, msg)
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

func (s *chatService) MarkAsRead(ctx context.Context, orderID string, userID, userRole string, lastMessageID *string) error {
	allowed, err := s.repo.CanAccessOrder(ctx, orderID, userID, userRole)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrChatUnauthorized
	}
	if err := s.auditAccess(ctx, userID, orderID, userRole, "mark_read"); err != nil {
		return err
	}
	// The receipt projection is authoritative for cross-device read state.
	// Legacy chat_messages remain immutable history.
	return nil
}

var phoneLike = regexp.MustCompile(`(?i)(?:\+?62|0)\d[\d\s-]{7,14}`)
var contactLink = regexp.MustCompile(`(?i)(?:https?://|wa\.me/|t\.me/)\S+`)

func maskContactDetails(text string) string {
	text = contactLink.ReplaceAllString(text, "[kontak disamarkan]")
	return phoneLike.ReplaceAllString(text, "[kontak disamarkan]")
}

func (s *chatService) GetMessages(ctx context.Context, orderID, userID, userRole string) ([]domain.ChatMessage, error) {
	allowed, err := s.repo.CanAccessOrder(ctx, orderID, userID, userRole)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, ErrChatUnauthorized
	}
	if err := s.auditAccess(ctx, userID, orderID, userRole, "read"); err != nil {
		return nil, err
	}
	return s.repo.GetMessagesByOrderID(ctx, orderID)
}

func (s *chatService) ReportChat(ctx context.Context, orderID, reporterID, reporterRole, messageID, reason string) error {
	allowed, err := s.repo.CanAccessOrder(ctx, orderID, reporterID, reporterRole)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrChatUnauthorized
	}
	if err := s.auditAccess(ctx, reporterID, orderID, reporterRole, "report"); err != nil {
		return err
	}
	reason = strings.TrimSpace(reason)
	if reason == "" || len([]rune(reason)) > 500 {
		return ErrInvalidChatReport
	}
	return s.repo.ReportChat(ctx, orderID, reporterID, messageID, reason)
}
