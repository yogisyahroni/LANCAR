package handler

import (
	"context"
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
	Token      string `json:"token"`
	Platform   string `json:"platform"` // android | ios | web
	AppName    string `json:"app_name"` // tembus-courier | tembus-customer | tembus-merchant
	DeviceID   string `json:"device_id"`
	Surface    string `json:"surface"`
	AppVersion string `json:"app_version"`
}

type deviceTokenLifecycle interface {
	RegisterDeviceToken(context.Context, uuid.UUID, string, string, string, string, string, string) error
	RetireDeviceToken(context.Context, uuid.UUID, string, string) error
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

	if lifecycle, ok := h.deviceTokenRepo.(deviceTokenLifecycle); ok {
		if err := lifecycle.RegisterDeviceToken(r.Context(), userID, req.Token, platform, appName, strings.TrimSpace(req.DeviceID), strings.TrimSpace(req.Surface), strings.TrimSpace(req.AppVersion)); err != nil {
			middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Gagal menyimpan device token", middleware.GetCorrelationID(r.Context()))
			return
		}
	} else if err := h.deviceTokenRepo.UpsertDeviceToken(r.Context(), userID, req.Token, platform, appName); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Gagal menyimpan device token", middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// Unregister is called on logout/token rotation and is scoped to the
// authenticated account, preventing the previous account from receiving data.
func (h *DeviceTokenHandler) Unregister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	userID, err := uuid.Parse(middleware.GetUserIDFromContext(r.Context()))
	if err != nil {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Invalid user ID", middleware.GetCorrelationID(r.Context()))
		return
	}
	var body struct {
		Token string `json:"token"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 16*1024)).Decode(&body)
	lifecycle, ok := h.deviceTokenRepo.(deviceTokenLifecycle)
	if !ok {
		middleware.WriteError(w, http.StatusNotImplemented, "ERR_NOT_SUPPORTED", "device lifecycle unavailable", middleware.GetCorrelationID(r.Context()))
		return
	}
	if strings.TrimSpace(body.Token) == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "token wajib diisi", middleware.GetCorrelationID(r.Context()))
		return
	}
	if err := lifecycle.RetireDeviceToken(r.Context(), userID, strings.TrimSpace(body.Token), "logout"); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Gagal mencabut device token", middleware.GetCorrelationID(r.Context()))
		return
	}
	middleware.WriteSuccess(w, http.StatusOK, map[string]string{"status": "retired"})
}
