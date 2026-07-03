package handler

import (
	"encoding/json"
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

func (h *ChatHandler) GetChats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	orderID := r.PathValue("id")
	if orderID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "INVALID_REQUEST", "Order ID is required", middleware.GetCorrelationID(ctx))
		return
	}

	messages, err := h.chatService.GetMessages(ctx, orderID)
	if err != nil {
		fmt.Printf("GetMessages error: %v\n", err)
		middleware.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to get chat messages", middleware.GetCorrelationID(ctx))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
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
		Message string `json:"message"`
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

	senderID := middleware.GetUserIDFromContext(ctx)
	senderRole := middleware.GetRoleFromContext(ctx)
	
	// Set sender name based on role or context if available. For now using role/userID as fallback.
	senderName := senderRole // Mobile can be Courier or Customer

	msg, err := h.chatService.SendMessage(ctx, orderID, senderID, senderName, senderRole, req.Message, "text")
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to send chat message", middleware.GetCorrelationID(ctx))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
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

	err := h.chatService.MarkAsRead(ctx, orderID, userID, req.LastMessageID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to mark chat as read", middleware.GetCorrelationID(ctx))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"success": true,
		},
	})
}
