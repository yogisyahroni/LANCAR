package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"lancar/auth-service/internal/domain"
	"lancar/auth-service/internal/middleware"
	"lancar/auth-service/internal/service"
	"net/http"
)

type AuthHandler struct {
	abuse *middleware.AuthAbuseProtector
	svc   interface {
		RequestOTP(ctx context.Context, phoneNumber string) error
		StartCustomerPasswordLogin(ctx context.Context, email, password, deviceID string, deviceInfo []byte) (*service.AuthResponse, error)
		StartCustomerPasswordRegistration(ctx context.Context, fullName, email, phoneNumber, password, deviceID string, deviceInfo []byte) (*service.AuthResponse, error)
		VerifyOTP(ctx context.Context, phoneNumber, code, deviceID string, deviceInfo []byte) (*service.AuthResponse, error)
		RefreshToken(ctx context.Context, oldRefreshToken, deviceID string) (*service.AuthResponse, error)
		Logout(ctx context.Context, refreshToken string) error
		Register(ctx context.Context, userID, fullName, email string) error
		SetPIN(ctx context.Context, userID string, pin string) error
		GetUserByID(ctx context.Context, id string) (*domain.User, error)
		UpdateProfilePhoto(ctx context.Context, userID string, filename string, content io.Reader) (string, error)
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
		middleware.WriteError(w, abuseErr.StatusCode, abuseErr.Code, abuseErr.Message, middleware.GetCorrelationID(r.Context()))
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

	if h.rejectIfAuthAbuseBlocked(w, r, middleware.ScopeCustomerPasswordLogin, req.Email) {
		return
	}

	res, err := h.svc.StartCustomerPasswordLogin(r.Context(), req.Email, req.Password, req.DeviceID, req.DeviceInfo)
	if err != nil {
		h.recordAuthFailure(r, middleware.ScopeCustomerPasswordLogin, req.Email, "invalid_customer_password_login")
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}
	h.recordAuthSuccess(r, middleware.ScopeCustomerPasswordLogin, req.Email)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(res)
}

func (h *AuthHandler) StartCustomerPasswordRegistration(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FullName    string          `json:"full_name"`
		Email       string          `json:"email"`
		PhoneNumber string          `json:"phone_number"`
		Password    string          `json:"password"`
		DeviceID    string          `json:"device_id"`
		DeviceInfo  json.RawMessage `json:"device_info"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	res, err := h.svc.StartCustomerPasswordRegistration(r.Context(), req.FullName, req.Email, req.PhoneNumber, req.Password, req.DeviceID, req.DeviceInfo)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(res)
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "OTP sent successfully"})
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

	res, err := h.svc.VerifyOTP(r.Context(), req.PhoneNumber, req.Code, req.DeviceID, req.DeviceInfo)
	if err != nil {
		h.recordAuthFailure(r, middleware.ScopeCustomerOTPVerify, req.PhoneNumber, "invalid_customer_otp")
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}
	h.recordAuthSuccess(r, middleware.ScopeCustomerOTPVerify, req.PhoneNumber)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(res)
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
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(res)
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Logged out successfully"})
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
		FullName string `json:"full_name"`
		Email    string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	err := h.svc.Register(r.Context(), userID, req.FullName, req.Email)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Profile updated successfully"})
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "PIN set successfully"})
}

func (h *AuthHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.svc.GetUserByID(r.Context(), userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(user)
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
		http.Error(w, err.Error(), http.StatusUnsupportedMediaType)
		return
	}

	url, err := h.svc.UpdateProfilePhoto(r.Context(), userID, secureUpload.Filename, bytes.NewReader(secureUpload.Content))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "User role updated successfully"})
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"message": "Courier profile created successfully"})
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
		http.Error(w, err.Error(), http.StatusUnsupportedMediaType)
		return
	}

	url, err := h.svc.UploadCourierDocument(r.Context(), userID, docType, secureUpload.Filename, bytes.NewReader(secureUpload.Content))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message":      "Document uploaded successfully",
		"document_url": url,
	})
}

func (h *AuthHandler) GetAuditLogs(w http.ResponseWriter, r *http.Request) {
	// Role validation handled by middleware
	logs, err := h.svc.GetAuditLogs(r.Context(), 50, 0)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(logs)
}

func (h *AuthHandler) GetCourierProfile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	profile, err := h.svc.GetCourierProfile(r.Context(), userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(profile)
}

func (h *AuthHandler) ListCouriers(w http.ResponseWriter, r *http.Request) {
	profiles, err := h.svc.ListCouriers(r.Context(), 50, 0)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(profiles)
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Courier verified successfully"})
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Courier suspended successfully"})
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Zone assigned successfully"})
}

func (h *AuthHandler) Setup2FA(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	secret, qrURL, err := h.svc.Setup2FA(r.Context(), userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
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
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "2FA verified successfully"})
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
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}
	h.recordAuthSuccess(r, middleware.ScopeCustomer2FAComplete, req.UserID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(res)
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(user)
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if !success {
		w.WriteHeader(http.StatusUnprocessableEntity)
		json.NewEncoder(w).Encode(map[string]string{"message": "Liveness verification failed. Please try again."})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Liveness verification successful"})
}
