package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

// NotificationHandler menangani inbox publik dan endpoint internal
// untuk membuat notifikasi in-app dari service lain.
// Endpoint internal diverifikasi dengan X-Internal-Api-Key.

type NotificationHandler struct {
	notifSvc       domain.NotificationService
	orderRepo      domain.OrderRepository
	internalAPIKey string
}

func NewNotificationHandler(svc domain.NotificationService, orderRepo domain.OrderRepository) *NotificationHandler {
	return &NotificationHandler{
		notifSvc:       svc,
		orderRepo:      orderRepo,
		internalAPIKey: os.Getenv("INTERNAL_API_KEY"),
	}
}

func (h *NotificationHandler) NotifyCustomerMerchantAccepted(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	if h.internalAPIKey != "" && r.Header.Get("X-Internal-Api-Key") != h.internalAPIKey {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}
	if h.orderRepo == nil || h.notifSvc == nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "notification handler belum terpasang", middleware.GetCorrelationID(r.Context()))
		return
	}

	var req struct {
		OrderID string `json:"order_id"`
		Title   string `json:"title"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64*1024)).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid JSON", middleware.GetCorrelationID(r.Context()))
		return
	}
	if req.OrderID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "order_id wajib diisi", middleware.GetCorrelationID(r.Context()))
		return
	}
	if req.Title == "" {
		req.Title = "Merchant menerima pesananmu"
	}
	if req.Message == "" {
		req.Message = "Merchant menerima pesananmu — makanan sedang disiapkan"
	}

	order, err := h.orderRepo.GetByID(r.Context(), req.OrderID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}
	if order == nil {
		middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", "order tidak ditemukan", middleware.GetCorrelationID(r.Context()))
		return
	}
	if order.CustomerID == "" {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "customer_id order kosong", middleware.GetCorrelationID(r.Context()))
		return
	}

	if err := h.notifSvc.Send(r.Context(), domain.NotificationRequest{
		UserID:  order.CustomerID,
		Title:   req.Title,
		Message: req.Message,
		Channel: domain.ChannelPush,
		Data: map[string]string{
			"type":     "merchant_accepted",
			"order_id": order.ID,
			"order_no": order.OrderNumber,
		},
	}); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, map[string]string{"status": "success", "message": "Notification sent"})
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
			if parsed > 100 {
				limit = 100
			} else {
				limit = parsed
			}
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
