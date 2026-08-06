package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"

	"github.com/google/uuid"
)

// DeviceTokenHandler — FOOD-BIKE-064: register/unregister FCM device token
// (tabel user_device_tokens). Dipanggil app merchant/courier/customer
// saat login / token refresh.
type DeviceTokenHandler struct {
	deviceTokenRepo domain.DeviceTokenRepository
}

func NewDeviceTokenHandler(repo domain.DeviceTokenRepository) *DeviceTokenHandler {
	return &DeviceTokenHandler{deviceTokenRepo: repo}
}

type registerDeviceTokenRequest struct {
	Token    string `json:"token"`
	Platform string `json:"platform"` // android | ios | web
	AppName  string `json:"app_name"` // tembus-courier | tembus-customer | tembus-merchant
}

func (h *DeviceTokenHandler) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
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

	var req registerDeviceTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request body", middleware.GetCorrelationID(r.Context()))
		return
	}
	req.Token = strings.TrimSpace(req.Token)
	if req.Token == "" || len(req.Token) > 4096 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "token wajib diisi (max 4096 chars)", middleware.GetCorrelationID(r.Context()))
		return
	}

	platform := strings.ToLower(strings.TrimSpace(req.Platform))
	if platform == "" {
		platform = "android"
	}
	switch platform {
	case "android", "ios", "web":
	default:
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "platform harus android|ios|web", middleware.GetCorrelationID(r.Context()))
		return
	}

	appName := strings.ToLower(strings.TrimSpace(req.AppName))
	if appName == "" {
		appName = "tembus-courier"
	}
	switch appName {
	case "tembus-courier", "tembus-customer", "tembus-merchant":
	default:
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "app_name harus tembus-courier|tembus-customer|tembus-merchant", middleware.GetCorrelationID(r.Context()))
		return
	}

	if err := h.deviceTokenRepo.UpsertDeviceToken(r.Context(), userID, req.Token, platform, appName); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Gagal menyimpan device token", middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
