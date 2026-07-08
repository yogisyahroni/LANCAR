package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"tembus/auth-service/internal/domain"
	"tembus/auth-service/internal/middleware"
	"tembus/auth-service/internal/service"
)

// deviceIDRegex enforces a safe format for device_id values (LGN-05).
// Prevents overly-long or special-character device IDs from being stored in DB.
var deviceIDRegex = regexp.MustCompile(`^[A-Za-z0-9_\-]{8,256}$`)

type AuthHandler struct {
	abuse *middleware.AuthAbuseProtector
	svc   interface {
		RequestOTP(ctx context.Context, phoneNumber string) error
		RequestCustomerPasswordReset(ctx context.Context, email string) error
		ConfirmCustomerPasswordReset(ctx context.Context, email, code, newPassword string) error
		StartCustomerPasswordLogin(ctx context.Context, email, password, deviceID string, deviceInfo []byte) (*service.AuthResponse, error)
		StartCustomerPasswordRegistration(ctx context.Context, fullName, email, phoneNumber, password, deviceID string, deviceInfo []byte, awbSenderName string) (*service.AuthResponse, error)
		VerifyOTP(ctx context.Context, phoneNumber, code, deviceID string, deviceInfo []byte, ipAddress string) (*service.AuthResponse, error)
		RefreshToken(ctx context.Context, oldRefreshToken, deviceID string) (*service.AuthResponse, error)
		Logout(ctx context.Context, refreshToken string) error
		Register(ctx context.Context, userID, fullName, email, storeName, defaultPickupAddress, awbSenderName string) error
		SetPIN(ctx context.Context, userID string, pin string) error
		GetUserByID(ctx context.Context, id string) (*domain.User, error)
		CheckSenderName(ctx context.Context, senderName string) error
		UpdateProfilePhoto(ctx context.Context, userID string, filename string, content io.Reader) (string, error)
		AdminSetCourierProfilePhoto(ctx context.Context, adminID, courierUserID string, filename string, content io.Reader) (string, error)
		UpdateUserRole(ctx context.Context, userID string, role string) error
		RegisterCourier(ctx context.Context, userID string, vehicleType, vehiclePlate string) error
		UploadCourierDocument(ctx context.Context, userID string, docType string, filename string, content io.Reader) (string, error)
		GetCourierProfile(ctx context.Context, userID string) (*domain.CourierProfile, error)
		GetAuditLogs(ctx context.Context, limit, offset int) ([]*domain.AuditLog, error)
		ListCouriers(ctx context.Context, limit, offset int) ([]*domain.CourierProfile, error)
		VerifyCourier(ctx context.Context, userID string) error
		SuspendCourier(ctx context.Context, userID string) error
		AssignCourierZone(ctx context.Context, userID string, zoneID string) error
		Setup2FA(ctx context.Context, userID string) (string, string, error)
		Verify2FA(ctx context.Context, userID, code string) error
		Complete2FALogin(ctx context.Context, userID, code, deviceID string, deviceInfo []byte) (*service.AuthResponse, error)
		CreateAdminUser(ctx context.Context, actorID string, fullName, phoneNumber, role string) (*domain.User, error)
		VerifyCourierLiveness(ctx context.Context, userID string, imageBase64 string) (bool, error)
		LogLocalSecurityEvent(ctx context.Context, userID string, actionType string, method string, orderID *string) error
		UpdateBankProfile(ctx context.Context, userID, bankName, accountNumber, accountHolder string) error
	}
}

func (h *AuthHandler) rejectIfAuthAbuseBlocked(w http.ResponseWriter, r *http.Request, scope middleware.AuthAbuseScope, identifier string) bool {
	if h.abuse == nil {
		return false
	}

	if abuseErr := h.abuse.AssertAllowed(r.Context(), scope, identifier, middleware.ClientIP(r)); abuseErr != nil {
		if abuseErr.RetryAfterSeconds > 0 {
			w.Header().Set("Retry-After", fmt.Sprintf("%d", abuseErr.RetryAfterSeconds))
		}
		middleware.WriteError(
			w,
			abuseErr.StatusCode,
			abuseErr.Code,
			abuseErr.Message,
			middleware.GetCorrelationID(r.Context()),
			middleware.GetRequestID(r.Context()),
			middleware.GetTraceID(r.Context()),
		)
		return true
	}

	return false
}

func (h *AuthHandler) recordAuthFailure(r *http.Request, scope middleware.AuthAbuseScope, identifier string, reason string) {
	if h.abuse == nil {
		return
	}
	h.abuse.RecordFailure(r.Context(), scope, identifier, middleware.ClientIP(r), reason)
}

func (h *AuthHandler) recordAuthSuccess(r *http.Request, scope middleware.AuthAbuseScope, identifier string) {
	if h.abuse == nil {
		return
	}
	h.abuse.RecordSuccess(r.Context(), scope, identifier)
}

func (h *AuthHandler) StartCustomerPasswordLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email      string          `json:"email"`
		Password   string          `json:"password"`
		DeviceID   string          `json:"device_id"`
		DeviceInfo json.RawMessage `json:"device_info"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// LGN-01: Normalize email BEFORE using as the abuse lockout identifier.
	// Without this, attackers could bypass per-identifier lockout by varying
	// capitalization (e.g. "User@Example.COM" vs "user@example.com").
	normalizedEmail := strings.TrimSpace(strings.ToLower(req.Email))

	// LGN-05: Validate device_id format to prevent oversized or special-char IDs.
	deviceID := strings.TrimSpace(req.DeviceID)
	if deviceID != "" && !deviceIDRegex.MatchString(deviceID) {
		http.Error(w, "Invalid device_id format", http.StatusBadRequest)
		return
	}

	if h.rejectIfAuthAbuseBlocked(w, r, middleware.ScopeCustomerPasswordLogin, normalizedEmail) {
		return
	}

	res, err := h.svc.StartCustomerPasswordLogin(r.Context(), req.Email, req.Password, deviceID, req.DeviceInfo)
	if err != nil {
		h.recordAuthFailure(r, middleware.ScopeCustomerPasswordLogin, normalizedEmail, "invalid_customer_password_login")
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Authentication required", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}
	h.recordAuthSuccess(r, middleware.ScopeCustomerPasswordLogin, normalizedEmail)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(res)
}

func (h *AuthHandler) RequestCustomerPasswordReset(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	email := strings.TrimSpace(strings.ToLower(req.Email))
	if h.rejectIfAuthAbuseBlocked(w, r, middleware.ScopePasswordReset, email) {
		return
	}

	if err := h.svc.RequestCustomerPasswordReset(r.Context(), email); err != nil {
		h.recordAuthFailure(r, middleware.ScopePasswordReset, email, "invalid_password_reset_request")
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Jika email terdaftar, kode reset sudah dikirim.",
	})
}

func (h *AuthHandler) ConfirmCustomerPasswordReset(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email       string `json:"email"`
		Code        string `json:"code"`
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	email := strings.TrimSpace(strings.ToLower(req.Email))
	if h.rejectIfAuthAbuseBlocked(w, r, middleware.ScopePasswordReset, email) {
		return
	}

	if err := h.svc.ConfirmCustomerPasswordReset(r.Context(), email, req.Code, req.NewPassword); err != nil {
		h.recordAuthFailure(r, middleware.ScopePasswordReset, email, "invalid_password_reset_confirm")
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	h.recordAuthSuccess(r, middleware.ScopePasswordReset, email)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Password berhasil diperbarui. Silakan masuk kembali.",
	})
}

func (h *AuthHandler) StartCustomerPasswordRegistration(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FullName    string          `json:"full_name"`
		Email       string          `json:"email"`
		PhoneNumber string          `json:"phone_number"`
		Password      string          `json:"password"`
		DeviceID      string          `json:"device_id"`
		DeviceInfo    json.RawMessage `json:"device_info"`
		AWBSenderName string          `json:"awb_sender_name,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	normalizedEmail := strings.TrimSpace(strings.ToLower(req.Email))
	if h.rejectIfAuthAbuseBlocked(w, r, middleware.ScopeCustomerRegistration, normalizedEmail) {
		return
	}

	res, err := h.svc.StartCustomerPasswordRegistration(r.Context(), req.FullName, req.Email, req.PhoneNumber, req.Password, req.DeviceID, req.DeviceInfo, req.AWBSenderName)
	if err != nil {
		h.recordAuthFailure(r, middleware.ScopeCustomerRegistration, normalizedEmail, "registration_failed")
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	h.recordAuthSuccess(r, middleware.ScopeCustomerRegistration, normalizedEmail)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(res)
}

func NewAuthHandler(svc *service.AuthService, abuse ...*middleware.AuthAbuseProtector) *AuthHandler {
	var abuseProtector *middleware.AuthAbuseProtector
	if len(abuse) > 0 {
		abuseProtector = abuse[0]
	}
	return &AuthHandler{svc: svc, abuse: abuseProtector}
}

// RequestOTP godoc
// @Summary Request OTP (Mobile)
// @Description Send OTP to phone number
// @Tags auth
// @Accept json
// @Produce json
// @Param request body object true "Phone Number"
// @Success 200 {object} map[string]string
// @Router /auth/request-otp [post]
func (h *AuthHandler) RequestOTP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PhoneNumber string `json:"phone_number"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.PhoneNumber == "" {
		http.Error(w, "Phone number is required", http.StatusBadRequest)
		return
	}

	if h.rejectIfAuthAbuseBlocked(w, r, middleware.ScopeCustomerOTPSend, req.PhoneNumber) {
		return
	}

	err := h.svc.RequestOTP(r.Context(), req.PhoneNumber)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "OTP sent successfully"})
}

// VerifyOTP godoc
// @Summary Verify OTP (Mobile)
// @Description Verify OTP and receive JWT tokens
// @Tags auth
// @Accept json
// @Produce json
// @Param request body object true "OTP Verification"
// @Success 200 {object} service.AuthResponse
// @Router /auth/verify-otp [post]
func (h *AuthHandler) VerifyOTP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PhoneNumber string          `json:"phone_number"`
		Code        string          `json:"code"`
		DeviceID    string          `json:"device_id"`
		DeviceInfo  json.RawMessage `json:"device_info"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if h.rejectIfAuthAbuseBlocked(w, r, middleware.ScopeCustomerOTPVerify, req.PhoneNumber) {
		return
	}

	ipAddress := r.Header.Get("X-Forwarded-For")
	if ipAddress == "" {
		ipAddress = r.RemoteAddr
	}
	res, err := h.svc.VerifyOTP(r.Context(), req.PhoneNumber, req.Code, req.DeviceID, req.DeviceInfo, ipAddress)
	if err != nil {
		h.recordAuthFailure(r, middleware.ScopeCustomerOTPVerify, req.PhoneNumber, "invalid_customer_otp")
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Authentication required", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}
	h.recordAuthSuccess(r, middleware.ScopeCustomerOTPVerify, req.PhoneNumber)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(res)
}

// RefreshToken godoc
// @Summary Refresh Token (Mobile)
// @Description Get new access token using refresh token
// @Tags auth
// @Accept json
// @Produce json
// @Param request body object true "Refresh Token Request"
// @Success 200 {object} service.AuthResponse
// @Router /auth/refresh [post]
func (h *AuthHandler) RefreshToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
		DeviceID     string `json:"device_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	res, err := h.svc.RefreshToken(r.Context(), req.RefreshToken, req.DeviceID)
	if err != nil {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Authentication required", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(res)
}

// Logout godoc
// @Summary Logout (Mobile)
// @Description Invalidate refresh token
// @Tags auth
// @Accept json
// @Produce json
// @Param request body object true "Logout Request"
// @Success 200 {object} map[string]string
// @Router /auth/logout [post]
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	err := h.svc.Logout(r.Context(), req.RefreshToken)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Logged out successfully"})
}

// Register godoc
// @Summary Update Profile / Register (Mobile)
// @Description Update user details after first login
// @Tags auth
// @Accept json
// @Produce json
// @Security Bearer
// @Param request body object true "Registration Details"
// @Success 200 {object} map[string]string
// @Router /auth/register [post]
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		FullName             string `json:"full_name"`
		Email                string `json:"email"`
		StoreName            string `json:"store_name"`
		DefaultPickupAddress string `json:"default_pickup_address"`
		AWBSenderName        string `json:"awb_sender_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	err := h.svc.Register(r.Context(), userID, req.FullName, req.Email, req.StoreName, req.DefaultPickupAddress, req.AWBSenderName)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Profile updated successfully"})
}

func (h *AuthHandler) SetPIN(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		PIN string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.PIN) != 6 {
		http.Error(w, "PIN must be 6 digits", http.StatusBadRequest)
		return
	}

	err := h.svc.SetPIN(r.Context(), userID, req.PIN)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "PIN set successfully"})
}

// CheckSenderName godoc
// @Summary Check AWB Sender Name (Mobile)
// @Description Check if AWB Sender Name is available
// @Tags auth
// @Accept json
// @Produce json
// @Param request body object true "Sender Name Request"
// @Success 200 {object} map[string]bool
// @Router /auth/check-sender-name [post]
func (h *AuthHandler) CheckSenderName(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SenderName string `json:"sender_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	err := h.svc.CheckSenderName(r.Context(), req.SenderName)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_SENDER_NAME", err.Error(), middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]bool{"available": true})
}

func (h *AuthHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.svc.GetUserByID(r.Context(), userID)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Resource not found", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(user)
}

func (h *AuthHandler) UpdatePhoto(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Limit upload size (e.g., 2MB)
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	if err := r.ParseMultipartForm(2 << 20); err != nil {
		http.Error(w, "File too large (max 2MB)", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("photo")
	if err != nil {
		http.Error(w, "Invalid file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	secureUpload, err := service.ValidateSecureUpload(service.ProfilePhotoUpload, header.Filename, file)
	if err != nil {
		middleware.WriteError(w, http.StatusUnsupportedMediaType, "ERR_UNSUPPORTED_MEDIA", "Unsupported media type", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	url, err := h.svc.UpdateProfilePhoto(r.Context(), userID, secureUpload.Filename, bytes.NewReader(secureUpload.Content))
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"message":   "Photo updated successfully",
		"photo_url": url,
	})
}

func (h *AuthHandler) UpdateUserRole(w http.ResponseWriter, r *http.Request) {
	// Role validation is handled by middleware
	var req struct {
		UserID string `json:"user_id"`
		Role   string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	err := h.svc.UpdateUserRole(r.Context(), req.UserID, req.Role)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "User role updated successfully"})
}

// RegisterCourier godoc
// @Summary Register as Courier (Mobile)
// @Description Upgrade customer account to courier account
// @Tags couriers
// @Accept json
// @Produce json
// @Security Bearer
// @Param request body object true "Courier Details"
// @Success 201 {object} map[string]string
// @Router /couriers/register [post]
func (h *AuthHandler) RegisterCourier(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		VehicleType  string `json:"vehicle_type"`
		VehiclePlate string `json:"vehicle_plate"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	err := h.svc.RegisterCourier(r.Context(), userID, req.VehicleType, req.VehiclePlate)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Courier profile created successfully"})
}

// UploadCourierDocument godoc
// @Summary Upload Courier Documents (Mobile)
// @Description Upload SIM, STNK, or KTP for verification
// @Tags couriers
// @Accept multipart/form-data
// @Produce json
// @Security Bearer
// @Param document_type formData string true "Type of document (sim, stnk, ktp)"
// @Param document formData file true "Document file"
// @Success 200 {object} map[string]string
// @Router /couriers/documents [post]
func (h *AuthHandler) UploadCourierDocument(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Limit upload size (5MB)
	r.Body = http.MaxBytesReader(w, r.Body, 5<<20)
	if err := r.ParseMultipartForm(5 << 20); err != nil {
		http.Error(w, "File too large (max 5MB)", http.StatusBadRequest)
		return
	}

	docType := r.FormValue("document_type")
	if docType == "" {
		http.Error(w, "document_type is required", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("document")
	if err != nil {
		http.Error(w, "Invalid file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	secureUpload, err := service.ValidateSecureUpload(service.CourierDocumentUpload, header.Filename, file)
	if err != nil {
		middleware.WriteError(w, http.StatusUnsupportedMediaType, "ERR_UNSUPPORTED_MEDIA", "Unsupported media type", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	url, err := h.svc.UploadCourierDocument(r.Context(), userID, docType, secureUpload.Filename, bytes.NewReader(secureUpload.Content))
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"message":      "Document uploaded successfully",
		"document_url": url,
	})
}

func (h *AuthHandler) GetAuditLogs(w http.ResponseWriter, r *http.Request) {
	// Role validation handled by middleware
	logs, err := h.svc.GetAuditLogs(r.Context(), 50, 0)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(logs)
}

func (h *AuthHandler) GetCourierProfile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	profile, err := h.svc.GetCourierProfile(r.Context(), userID)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Resource not found", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(profile)
}

func (h *AuthHandler) ListCouriers(w http.ResponseWriter, r *http.Request) {
	profiles, err := h.svc.ListCouriers(r.Context(), 50, 0)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(profiles)
}

func (h *AuthHandler) VerifyCourier(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	err := h.svc.VerifyCourier(r.Context(), req.UserID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Courier verified successfully"})
}

func (h *AuthHandler) SuspendCourier(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	err := h.svc.SuspendCourier(r.Context(), req.UserID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Courier suspended successfully"})
}

func (h *AuthHandler) AssignCourierZone(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID string `json:"user_id"`
		ZoneID string `json:"zone_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	err := h.svc.AssignCourierZone(r.Context(), req.UserID, req.ZoneID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Zone assigned successfully"})
}

func (h *AuthHandler) Setup2FA(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	secret, qrURL, err := h.svc.Setup2FA(r.Context(), userID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"secret": secret,
		"qr_url": qrURL,
	})
}

func (h *AuthHandler) Verify2FA(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	err := h.svc.Verify2FA(r.Context(), userID, req.Code)
	if err != nil {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Authentication required", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "2FA verified successfully"})
}

func (h *AuthHandler) Complete2FALogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID     string          `json:"user_id"`
		Code       string          `json:"code"`
		DeviceID   string          `json:"device_id"`
		DeviceInfo json.RawMessage `json:"device_info"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if h.rejectIfAuthAbuseBlocked(w, r, middleware.ScopeCustomer2FAComplete, req.UserID) {
		return
	}

	res, err := h.svc.Complete2FALogin(r.Context(), req.UserID, req.Code, req.DeviceID, req.DeviceInfo)
	if err != nil {
		h.recordAuthFailure(r, middleware.ScopeCustomer2FAComplete, req.UserID, "invalid_customer_2fa")
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Authentication required", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}
	h.recordAuthSuccess(r, middleware.ScopeCustomer2FAComplete, req.UserID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(res)
}

func (h *AuthHandler) CreateAdminUser(w http.ResponseWriter, r *http.Request) {
	actorID := middleware.GetUserIDFromContext(r.Context())
	if actorID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		FullName    string `json:"full_name"`
		PhoneNumber string `json:"phone_number"`
		Role        string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	user, err := h.svc.CreateAdminUser(r.Context(), actorID, req.FullName, req.PhoneNumber, req.Role)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(user)
}

// VerifyLiveness godoc
// @Summary Courier Liveness Verification (Mobile)
// @Description Verify courier is a real person via face capture
// @Tags couriers
// @Accept json
// @Produce json
// @Security Bearer
// @Param request body object true "Liveness Image"
// @Success 200 {object} map[string]string
// @Router /couriers/liveness [post]
func (h *AuthHandler) VerifyLiveness(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		ImageBase64 string `json:"image_base64"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	success, err := h.svc.VerifyCourierLiveness(r.Context(), userID, req.ImageBase64)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	if !success {
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]string{"message": "Liveness verification failed. Please try again."})
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Liveness verification successful"})
}

// HandleAdminSetCourierProfilePhoto handles admin requests to set and lock a courier's profile photo
func (h *AuthHandler) HandleAdminSetCourierProfilePhoto(w http.ResponseWriter, r *http.Request) {
	// 1. Get Admin ID from context
	adminID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || adminID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	// 2. Extract Courier ID from path
	// Assuming router is something like /api/v1/admin/couriers/{id}/profile-photo
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 2 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid path", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	// We'll extract the ID based on standard mux / chi path params if available,
	// but since we don't have the router object directly, let's extract it manually for now.
	// We know the pattern is /admin/couriers/{id}/profile-photo
	var courierID string
	for i, part := range pathParts {
		if part == "couriers" && i+1 < len(pathParts) {
			courierID = pathParts[i+1]
			break
		}
	}

	if courierID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Courier ID is required", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	// 3. Parse multipart form
	err := r.ParseMultipartForm(5 << 20) // 5 MB max
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Failed to parse form: file too large or invalid", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	file, header, err := r.FormFile("photo")
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Photo file is required", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}
	defer file.Close()

	// 4. Validate file type
	contentType := header.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		middleware.WriteError(w, http.StatusUnsupportedMediaType, "ERR_UNSUPPORTED_MEDIA_TYPE", "File must be an image", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	// 5. Call service
	photoURL, err := h.svc.AdminSetCourierProfilePhoto(r.Context(), adminID, courierID, header.Filename, file)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", err.Error(), middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		} else if strings.Contains(err.Error(), "not a courier") {
			middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", err.Error(), middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		} else {
			middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to process photo upload", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		}
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"message":   "Profile photo updated successfully and locked.",
		"photo_url": photoURL,
	})
}

// LogLocalSecurity godoc
// @Summary Log courier local security challenge event
// @Description Log biometric or PIN success for tracking and auditing
// @Tags couriers
// @Accept json
// @Produce json
// @Param request body object true "Security Log Payload"
// @Success 200 {object} map[string]string
// @Router /couriers/local-security-log [post]
func (h *AuthHandler) LogLocalSecurity(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Missing or invalid token", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	var req struct {
		ActionType string  `json:"action_type"`
		Method     string  `json:"method"`
		OrderID    *string `json:"order_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request body", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	if req.ActionType == "" || req.Method == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Action type and method are required", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	err := h.svc.LogLocalSecurityEvent(r.Context(), userID, req.ActionType, req.Method, req.OrderID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to log security event", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Local security event logged successfully"})
}

// UpdateBankProfile handles PATCH /api/v1/profile/bank
// @Summary Update User Bank Account Profile
// @Description Update bank name, account number, and account holder for payout settlements
// @Tags Profile
// @Accept json
// @Produce json
// @Param request body object true "Bank Profile Payload"
// @Success 200 {object} map[string]string
// @Router /profile/bank [patch]
func (h *AuthHandler) UpdateBankProfile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Missing or invalid token", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	var req struct {
		BankName          string `json:"bank_name"`
		BankCode          string `json:"bank_code"`
		BankAccountNumber string `json:"bank_account_number"`
		BankAccountHolder string `json:"bank_account_holder"`
		BankAccountName   string `json:"bank_account_name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request body", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	bankName := strings.TrimSpace(req.BankName)
	if bankName == "" {
		bankName = strings.TrimSpace(req.BankCode)
	}
	accountHolder := strings.TrimSpace(req.BankAccountHolder)
	if accountHolder == "" {
		accountHolder = strings.TrimSpace(req.BankAccountName)
	}
	accountNumber := strings.TrimSpace(req.BankAccountNumber)

	if bankName == "" || accountNumber == "" || accountHolder == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "All bank profile fields are required", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	// OWASP 2026 Strict Input Validation & Sanitization
	if len(accountNumber) < 6 || len(accountNumber) > 30 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Bank account number must be between 6 and 30 characters", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}
	for _, ch := range accountNumber {
		if !(ch >= '0' && ch <= '9') && !(ch >= 'A' && ch <= 'Z') && !(ch >= 'a' && ch <= 'z') && ch != '-' {
			middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Bank account number contains invalid characters", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
			return
		}
	}
	if len(bankName) > 50 || len(accountHolder) > 100 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Bank name or account holder name exceeds maximum allowed length", middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}
	// Strip dangerous HTML/script characters
	bankName = strings.ReplaceAll(strings.ReplaceAll(bankName, "<", ""), ">", "")
	accountHolder = strings.ReplaceAll(strings.ReplaceAll(accountHolder, "<", ""), ">", "")

	if err := h.svc.UpdateBankProfile(r.Context(), userID, bankName, accountNumber, accountHolder); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to update bank profile: "+err.Error(), middleware.GetCorrelationID(r.Context()), middleware.GetRequestID(r.Context()), middleware.GetTraceID(r.Context()))
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": "Bank profile updated successfully",
	})
}
