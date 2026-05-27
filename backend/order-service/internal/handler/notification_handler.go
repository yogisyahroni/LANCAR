package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type NotificationHandler struct {
	notifSvc domain.NotificationService
}

func NewNotificationHandler(svc domain.NotificationService) *NotificationHandler {
	return &NotificationHandler{notifSvc: svc}
}

func (h *NotificationHandler) GetInbox(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	userIDStr, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userIDStr == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Invalid user ID", middleware.GetCorrelationID(r.Context()))
		return
	}

	limit := 20
	offset := 0

	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	notifications, err := h.notifSvc.GetInbox(r.Context(), userID, limit, offset)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, notifications)
}

func (h *NotificationHandler) MarkAsRead(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	userIDStr, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userIDStr == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Invalid user ID", middleware.GetCorrelationID(r.Context()))
		return
	}

	// Extract notification ID from path: /api/v1/notifications/{id}/read
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 6 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_PATH", "Invalid notification ID in path", middleware.GetCorrelationID(r.Context()))
		return
	}

	notifIDStr := pathParts[4] // /api/v1/notifications/{id}/read
	notifID, err := uuid.Parse(notifIDStr)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_ID", "Invalid notification ID", middleware.GetCorrelationID(r.Context()))
		return
	}

	if err := h.notifSvc.MarkAsRead(r.Context(), notifID, userID); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, map[string]string{"status": "ok", "message": "Notification marked as read"})
}

// In a real application, you would also need admin handlers to manage templates.
// We provide a stub for Admin Template Management as requested.
func (h *NotificationHandler) ManageTemplates(w http.ResponseWriter, r *http.Request) {
	// Simple stub for templates
	if r.Method == http.MethodGet {
		middleware.WriteSuccess(w, http.StatusOK, map[string]string{"message": "List of templates"})
		return
	} else if r.Method == http.MethodPost {
		var payload map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&payload)
		middleware.WriteSuccess(w, http.StatusCreated, map[string]interface{}{"message": "Template created", "data": payload})
		return
	}

	middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
}
