package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"tembus/order-service/internal/middleware"
	"tembus/order-service/internal/service"
)

type ChatHandler struct {
	chatService service.ChatService
}

func NewChatHandler(chatService service.ChatService) *ChatHandler {
	return &ChatHandler{chatService: chatService}
}

func (h *ChatHandler) HandleChats(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.GetChats(w, r)
	case http.MethodPost:
		h.SendChat(w, r)
	case http.MethodPatch:
		if strings.HasSuffix(r.URL.Path, "/read") {
			h.MarkRead(w, r)
		} else {
			middleware.WriteError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		}
	default:
		middleware.WriteError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
	}
}

func (h *ChatHandler) ReportChat(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	orderID := r.PathValue("id")
	if orderID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "INVALID_REQUEST", "Order ID is required", middleware.GetCorrelationID(ctx))
		return
	}
	var req struct {
		MessageID string `json:"message_id"`
		Reason    string `json:"reason"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 8*1024)).Decode(&req) != nil {
		middleware.WriteError(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid report body", middleware.GetCorrelationID(ctx))
		return
	}
	err := h.chatService.ReportChat(ctx, orderID, middleware.GetUserIDFromContext(ctx), middleware.GetRoleFromContext(ctx), req.MessageID, req.Reason)
	if errors.Is(err, service.ErrChatUnauthorized) {
		middleware.WriteError(w, http.StatusForbidden, "CHAT_FORBIDDEN", "Chat report is not allowed for this order", middleware.GetCorrelationID(ctx))
		return
	}
	if errors.Is(err, service.ErrInvalidChatReport) {
		middleware.WriteError(w, http.StatusBadRequest, "INVALID_REPORT", "Report reason is required", middleware.GetCorrelationID(ctx))
		return
	}
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to submit chat report", middleware.GetCorrelationID(ctx))
		return
	}
	middleware.WriteSuccess(w, http.StatusCreated, map[string]string{"status": "received"})
}

func (h *ChatHandler) GetChats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	orderID := r.PathValue("id")
	if orderID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "INVALID_REQUEST", "Order ID is required", middleware.GetCorrelationID(ctx))
		return
	}

	messages, err := h.chatService.GetMessages(ctx, orderID, middleware.GetUserIDFromContext(ctx), middleware.GetRoleFromContext(ctx))
	if errors.Is(err, service.ErrChatUnauthorized) {
		middleware.WriteError(w, http.StatusForbidden, "CHAT_FORBIDDEN", "Chat is not allowed for this order", middleware.GetCorrelationID(ctx))
		return
	}
	if err != nil {
		fmt.Printf("GetMessages error: %v\n", err)
		middleware.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to get chat messages", middleware.GetCorrelationID(ctx))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    messages,
	})
}

func (h *ChatHandler) SendChat(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	orderID := r.PathValue("id")
	if orderID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "INVALID_REQUEST", "Order ID is required", middleware.GetCorrelationID(ctx))
		return
	}

	var req struct {
		Message        string `json:"message"`
		AttachmentURL  string `json:"attachment_url,omitempty"`
		AttachmentType string `json:"attachment_type,omitempty"`
		// Mobile app only sends message text. The rest is derived from context.
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid request body", middleware.GetCorrelationID(ctx))
		return
	}
	if req.Message == "" {
		middleware.WriteError(w, http.StatusBadRequest, "INVALID_REQUEST", "Message cannot be empty", middleware.GetCorrelationID(ctx))
		return
	}
	if req.AttachmentURL != "" || req.AttachmentType != "" {
		middleware.WriteError(w, http.StatusUnsupportedMediaType, "ATTACHMENT_REVIEW_REQUIRED", "attachment chat belum diaktifkan; gunakan attachment policy endpoint", middleware.GetCorrelationID(ctx))
		return
	}

	senderID := middleware.GetUserIDFromContext(ctx)
	senderRole := middleware.GetRoleFromContext(ctx)

	// Set sender name based on role or context if available. For now using role/userID as fallback.
	senderName := senderRole // Mobile can be Courier or Customer

	msg, err := h.chatService.SendMessage(ctx, orderID, senderID, senderName, senderRole, req.Message, "text")
	if err != nil {
		if errors.Is(err, service.ErrChatUnauthorized) {
			middleware.WriteError(w, http.StatusForbidden, "CHAT_FORBIDDEN", "Chat is not allowed for this order", middleware.GetCorrelationID(ctx))
			return
		}
		if errors.Is(err, service.ErrInvalidChatMessage) {
			middleware.WriteError(w, http.StatusBadRequest, "INVALID_REQUEST", "Message is invalid", middleware.GetCorrelationID(ctx))
			return
		}
		middleware.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to send chat message", middleware.GetCorrelationID(ctx))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    msg,
	})
}

func (h *ChatHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	orderID := r.PathValue("id")
	if orderID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "INVALID_REQUEST", "Order ID is required", middleware.GetCorrelationID(ctx))
		return
	}

	var req struct {
		LastMessageID *string `json:"lastMessageId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid request body", middleware.GetCorrelationID(ctx))
		return
	}

	userID := middleware.GetUserIDFromContext(ctx)

	err := h.chatService.MarkAsRead(ctx, orderID, userID, middleware.GetRoleFromContext(ctx), req.LastMessageID)
	if errors.Is(err, service.ErrChatUnauthorized) {
		middleware.WriteError(w, http.StatusForbidden, "CHAT_FORBIDDEN", "Chat is not allowed for this order", middleware.GetCorrelationID(ctx))
		return
	}
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to mark chat as read", middleware.GetCorrelationID(ctx))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"success": true,
		},
	})
}
