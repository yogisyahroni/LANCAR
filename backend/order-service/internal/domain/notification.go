package domain

import "context"

type NotificationChannel string

const (
	ChannelWhatsApp NotificationChannel = "whatsapp"
	ChannelPush     NotificationChannel = "push"
	ChannelSMS      NotificationChannel = "sms"
	ChannelEmail    NotificationChannel = "email"
)

type NotificationRequest struct {
	UserID   string              `json:"user_id"`
	Title    string              `json:"title"`
	Message  string              `json:"message"`
	Channel  NotificationChannel `json:"channel"`
	Data     map[string]string   `json:"data,omitempty"`
}

type NotificationService interface {
	Send(ctx context.Context, req NotificationRequest) error
}
