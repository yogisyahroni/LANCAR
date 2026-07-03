package domain

import (
	"time"
)

type ChatMessage struct {
	ID          string    `json:"id" db:"id"`
	OrderID     string    `json:"order_id" db:"order_id"`
	SenderID    string    `json:"sender_id" db:"sender_id"`
	SenderName  string    `json:"sender_name" db:"sender_name"`
	SenderRole  string    `json:"sender_role" db:"sender_role"`
	MessageText string    `json:"message" db:"message_text"`
	MessageType string    `json:"message_type" db:"message_type"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}
