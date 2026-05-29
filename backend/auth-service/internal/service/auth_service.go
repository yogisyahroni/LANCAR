package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
	"tembus/auth-service/internal/domain"
	"tembus/auth-service/pkg/utils"
	"time"

	"github.com/google/uuid"
	"github.com/pquerna/otp/totp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

type AuthService struct {
	userRepo        domain.UserRepository
	authRepo        domain.AuthRepository
	sessionRepo     domain.SessionRepository
	courierRepo     domain.CourierRepository
	auditRepo       domain.AuditRepository
	livenessService LivenessService
	storageService  StorageService
}

const customerAuthOTPRequiredFlag = "customer_auth_otp_required"

var authTracer = otel.Tracer("tembus/auth-service")

func NewAuthService(u domain.UserRepository, a domain.AuthRepository, s domain.SessionRepository, c domain.CourierRepository, au domain.AuditRepository, l LivenessService, st StorageService) *AuthService {
	return &AuthService{
		userRepo:        u,
		authRepo:        a,
		sessionRepo:     s,
		courierRepo:     c,
		auditRepo:       au,
		livenessService: l,
		storageService:  st,
	}
}

func (s *AuthService) isCustomerAuthOTPRequired(ctx context.Context) bool {
	required, err := s.authRepo.IsFeatureFlagEnabled(ctx, customerAuthOTPRequiredFlag, true)
	if err != nil {
		return true
	}
	return required
}

func hashSensitiveIdentifier(value string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(strings.ToLower(value))))
	return hex.EncodeToString(sum[:])
}

func identifierType(identifier string) string {
	normalized := strings.TrimSpace(identifier)
	if normalized == "" {
		return "empty"
	}
	if strings.Contains(normalized, "@") {
		return "email"
	}
	return "phone"
}

func completeAuthSpan(span trace.Span, result string, failed bool) {
	span.SetAttributes(attribute.String("auth.result", result))
	if failed {
		span.SetStatus(codes.Error, "auth flow failed")
		return
	}
	span.SetStatus(codes.Ok, "")
}

func (s *AuthService) RequestOTP(ctx context.Context, phoneNumber string) error {
	ctx, span := authTracer.Start(ctx, "auth.otp.request")
	defer span.End()

	otpRequired := s.isCustomerAuthOTPRequired(ctx)
	span.SetAttributes(
		attribute.Bool("auth.otp.required", otpRequired),
		attribute.String("auth.identifier_type", identifierType(phoneNumber)),
	)

	if !otpRequired {
		completeAuthSpan(span, "otp_disabled", false)
		return nil
	}

	code, err := generateOTP(6)
	if err != nil {
		completeAuthSpan(span, "otp_generation_failed", true)
		return err
	}

	otp := &domain.OTPLog{
		PhoneNumber: phoneNumber,
		Code:        code,
		ExpiresAt:   time.Now().Add(5 * time.Minute),
		IsUsed:      false,
		CreatedAt:   time.Now(),
	}

	if err := s.authRepo.SaveOTP(ctx, otp); err != nil {
		completeAuthSpan(span, "otp_store_failed", true)
		return err
	}

	fmt.Printf(
		"{\"event\":\"customer_otp_issued\",\"recipient_hash\":\"%s\",\"expires_in_seconds\":300}\n",
		hashSensitiveIdentifier(phoneNumber),
	)

	completeAuthSpan(span, "otp_issued", false)
	return nil
}

func (s *AuthService) StartCustomerPasswordLogin(ctx context.Context, email, password, deviceID string, deviceInfo []byte) (*AuthResponse, error) {
	ctx, span := authTracer.Start(ctx, "auth.customer_login.start")
	result := "unknown"
	failed := false
	defer func() {
		completeAuthSpan(span, result, failed)
		span.End()
	}()

	email = strings.TrimSpace(strings.ToLower(email))
	span.SetAttributes(
		attribute.String("auth.flow", "customer_password_login"),
		attribute.String("auth.identifier_type", identifierType(email)),
		attribute.Bool("auth.device_id_present", strings.TrimSpace(deviceID) != ""),
	)

	if email == "" || password == "" {
		result = "invalid_input"
		failed = true
		return nil, errors.New("email and password are required")
	}
	if strings.TrimSpace(deviceID) == "" {
		result = "missing_device_id"
		failed = true
		return nil, errors.New("device_id is required")
	}

	lookupCtx, lookupSpan := authTracer.Start(ctx, "auth.customer_credential_lookup")
	lookupSpan.SetAttributes(attribute.String("auth.identifier_type", identifierType(email)))
	user, err := s.userRepo.GetByPhoneNumber(lookupCtx, email)
	lookupSpan.SetAttributes(attribute.Bool("auth.record_found", err == nil && user != nil && user.ID != ""))
	lookupSpan.End()
	if err != nil || user == nil || user.Role != domain.RoleCustomer {
		result = "invalid_credentials"
		failed = true
		return nil, errors.New("invalid email or password")
	}
	if user.PasswordHash == nil || !utils.CheckPasswordHash(password, *user.PasswordHash) {
		result = "invalid_credentials"
		failed = true
		return nil, errors.New("invalid email or password")
	}
	otpRequired := s.isCustomerAuthOTPRequired(ctx)
	span.SetAttributes(attribute.Bool("auth.otp.required", otpRequired))

	issueCustomerSession := func(isNewUser bool, totpVerified bool, successResult string) (*AuthResponse, error) {
		response, err := s.issueAuthSession(ctx, user, deviceID, deviceInfo, isNewUser, totpVerified)
		if err != nil {
			result = "session_issue_failed"
			failed = true
			return nil, err
		}
		result = successResult
		return response, nil
	}

	if user.Status == domain.StatusPendingVerification && !user.IsVerified {
		if !otpRequired {
			_ = s.userRepo.MarkVerified(ctx, user.ID)
			user.IsVerified = true
			user.Status = domain.StatusActive
			return issueCustomerSession(true, false, "session_issued_after_auto_verify")
		}

		if err := s.RequestOTP(ctx, email); err != nil {
			result = "otp_request_failed"
			failed = true
			return nil, err
		}
		result = "otp_required_registration"
		return &AuthResponse{
			User:       user,
			RequireOTP: true,
			OTPReason:  "registration",
			IsNewUser:  true,
		}, nil
	}

	if user.Status != domain.StatusActive {
		result = "account_inactive"
		failed = true
		return nil, errors.New("customer account is not active")
	}

	deviceIDHash := hashDeviceID(deviceID)
	isTrusted, err := s.sessionRepo.IsTrustedDevice(ctx, user.ID, string(user.Role), deviceIDHash)
	if err != nil {
		result = "trusted_device_lookup_failed"
		failed = true
		return nil, err
	}
	span.SetAttributes(attribute.Bool("auth.trusted_device", isTrusted))
	if isTrusted {
		_ = s.sessionRepo.TouchTrustedDevice(ctx, user.ID, string(user.Role), deviceIDHash)
		return issueCustomerSession(false, false, "session_issued_trusted_device")
	}

	if !otpRequired {
		return issueCustomerSession(false, false, "session_issued_otp_disabled")
	}

	if err := s.RequestOTP(ctx, email); err != nil {
		result = "otp_request_failed"
		failed = true
		return nil, err
	}
	result = "otp_required_new_device"
	return &AuthResponse{
		User:       user,
		RequireOTP: true,
		OTPReason:  "new_device",
	}, nil
}

func (s *AuthService) StartCustomerPasswordRegistration(ctx context.Context, fullName, email, phoneNumber, password, deviceID string, deviceInfo []byte) (*AuthResponse, error) {
	fullName = strings.TrimSpace(fullName)
	email = strings.TrimSpace(strings.ToLower(email))
	phoneNumber = strings.TrimSpace(phoneNumber)
	if len(fullName) < 2 || email == "" || len(phoneNumber) < 9 || len(password) < 8 {
		return nil, errors.New("registration data is incomplete")
	}
	if strings.TrimSpace(deviceID) == "" {
		return nil, errors.New("device_id is required")
	}

	if existing, err := s.userRepo.GetByPhoneNumber(ctx, email); err == nil && existing.ID != "" {
		return nil, errors.New("email is already registered")
	}
	if existing, err := s.userRepo.GetByPhoneNumber(ctx, phoneNumber); err == nil && existing.ID != "" {
		return nil, errors.New("phone number is already registered")
	}

	passwordHash, err := utils.HashPassword(password)
	if err != nil {
		return nil, err
	}
	emailVal := email
	user := &domain.User{
		ID:           uuid.New().String(),
		PhoneNumber:  phoneNumber,
		Email:        &emailVal,
		FullName:     fullName,
		Role:         domain.RoleCustomer,
		Status:       domain.StatusPendingVerification,
		IsVerified:   false,
		PasswordHash: &passwordHash,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}

	randomPart, _ := utils.GenerateRandomString(6)
	refCode := fmt.Sprintf("RLY-%s", randomPart)
	_ = s.userRepo.SetReferralCode(ctx, user.ID, refCode)

	if !s.isCustomerAuthOTPRequired(ctx) {
		_ = s.userRepo.MarkVerified(ctx, user.ID)
		user.IsVerified = true
		user.Status = domain.StatusActive
		return s.issueAuthSession(ctx, user, deviceID, deviceInfo, true, false)
	}

	if err := s.RequestOTP(ctx, email); err != nil {
		return nil, err
	}

	return &AuthResponse{
		User:       user,
		IsNewUser:  true,
		RequireOTP: true,
		OTPReason:  "registration",
	}, nil
}

type AuthResponse struct {
	AccessToken  string       `json:"access_token,omitempty"`
	RefreshToken string       `json:"refresh_token,omitempty"`
	ExpiresIn    int64        `json:"expires_in,omitempty"`
	User         *domain.User `json:"user,omitempty"`
	IsNewUser    bool         `json:"is_new_user"`
	RequireOTP   bool         `json:"require_otp,omitempty"`
	OTPReason    string       `json:"otp_reason,omitempty"`
	Require2FA   bool         `json:"require_2fa,omitempty"`
	MFAUserID    string       `json:"mfa_user_id,omitempty"`
}

func (s *AuthService) VerifyOTP(ctx context.Context, phoneNumber, code, deviceID string, deviceInfo []byte) (*AuthResponse, error) {
	ctx, span := authTracer.Start(ctx, "auth.otp.verify")
	result := "unknown"
	failed := false
	defer func() {
		completeAuthSpan(span, result, failed)
		span.End()
	}()

	otpRequired := s.isCustomerAuthOTPRequired(ctx)
	span.SetAttributes(
		attribute.Bool("auth.otp.required", otpRequired),
		attribute.String("auth.identifier_type", identifierType(phoneNumber)),
		attribute.Bool("auth.device_id_present", strings.TrimSpace(deviceID) != ""),
	)

	if otpRequired {
		otp, err := s.authRepo.VerifyOTP(ctx, phoneNumber, code)
		if err != nil {
			result = "invalid_or_expired_otp"
			failed = true
			return nil, errors.New("invalid or expired OTP")
		}

		if otp.IsUsed || otp.ExpiresAt.Before(time.Now()) {
			result = "otp_no_longer_valid"
			failed = true
			return nil, errors.New("OTP is no longer valid")
		}

		// Mark as used
		_ = s.authRepo.MarkOTPAsUsed(ctx, otp.ID)
	}

	// Check if user exists
	isNewUser := false
	user, err := s.userRepo.GetByPhoneNumber(ctx, phoneNumber)
	if err != nil {
		isNewUser = true
		user = &domain.User{
			ID:          uuid.New().String(),
			PhoneNumber: phoneNumber,
			FullName:    "New User",
			Role:        domain.RoleCustomer,
			Status:      domain.StatusPendingVerification,
			IsVerified:  false,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}
		if strings.Contains(phoneNumber, "@") {
			emailVal := phoneNumber
			user.Email = &emailVal
		}
		err = s.userRepo.Create(ctx, user)
		if err != nil {
			result = "user_create_failed"
			failed = true
			return nil, err
		}

		// Generate Referral Code for new user
		randomPart, _ := utils.GenerateRandomString(6)
		refCode := fmt.Sprintf("RLY-%s", randomPart)
		_ = s.userRepo.SetReferralCode(ctx, user.ID, refCode)
		user.ReferralCode = &refCode
	}
	span.SetAttributes(attribute.Bool("auth.is_new_user", isNewUser))

	_ = s.userRepo.MarkVerified(ctx, user.ID)
	user.IsVerified = true
	if user.Status == domain.StatusPendingVerification {
		user.Status = domain.StatusActive
	}

	// Check 2FA Policy
	if user.Is2FAEnabled || user.Role == domain.RoleSuperAdmin || user.Role == domain.RoleFinance {
		result = "2fa_required"
		span.SetAttributes(attribute.Bool("auth.require_2fa", true))
		// If 2FA is enabled or mandated for the role, return challenge
		// Note: SuperAdmin and Finance MUST enable 2FA on first login if not already enabled
		return &AuthResponse{
			Require2FA: true,
			MFAUserID:  user.ID,
		}, nil
	}
	span.SetAttributes(attribute.Bool("auth.require_2fa", false))

	response, err := s.issueAuthSession(ctx, user, deviceID, deviceInfo, isNewUser, false)
	if err != nil {
		result = "session_issue_failed"
		failed = true
		return nil, err
	}
	result = "session_issued"
	return response, nil
}

func (s *AuthService) issueAuthSession(ctx context.Context, user *domain.User, deviceID string, deviceInfo []byte, isNewUser bool, totpVerified bool) (*AuthResponse, error) {
	ctx, span := authTracer.Start(ctx, "auth.session.issue")
	result := "unknown"
	failed := false
	defer func() {
		completeAuthSpan(span, result, failed)
		span.End()
	}()
	span.SetAttributes(
		attribute.String("auth.user_role", string(user.Role)),
		attribute.Bool("auth.is_new_user", isNewUser),
		attribute.Bool("auth.totp_verified", totpVerified),
		attribute.Bool("auth.device_id_present", strings.TrimSpace(deviceID) != ""),
	)

	accessToken, err := utils.GenerateToken(user.ID, string(user.Role), totpVerified, 15*time.Minute)
	if err != nil {
		result = "access_token_generation_failed"
		failed = true
		return nil, err
	}

	refreshToken := uuid.New().String()
	session := &domain.Session{
		ID:           uuid.New().String(),
		UserID:       user.ID,
		RefreshToken: refreshToken,
		DeviceID:     deviceID,
		DeviceInfo:   deviceInfo,
		IsRevoked:    false,
		ExpiresAt:    time.Now().Add(7 * 24 * time.Hour),
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	if err := s.sessionRepo.CreateSession(ctx, session); err != nil {
		result = "session_create_failed"
		failed = true
		return nil, err
	}

	deviceIDHash := hashDeviceID(deviceID)
	_ = s.sessionRepo.TrustDevice(ctx, user.ID, string(user.Role), deviceIDHash, deviceInfo)
	_ = s.userRepo.UpdateLastLogin(ctx, user.ID)

	result = "session_issued"
	return &AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    900,
		User:         user,
		IsNewUser:    isNewUser,
	}, nil
}

func hashDeviceID(deviceID string) string {
	normalized := strings.TrimSpace(deviceID)
	if normalized == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(normalized))
	return "sha256:" + hex.EncodeToString(sum[:])
}

func (s *AuthService) RefreshToken(ctx context.Context, oldRefreshToken, deviceID string) (*AuthResponse, error) {
	ctx, span := authTracer.Start(ctx, "auth.refresh_token.rotate")
	result := "unknown"
	failed := false
	defer func() {
		completeAuthSpan(span, result, failed)
		span.End()
	}()
	span.SetAttributes(attribute.Bool("auth.device_id_present", strings.TrimSpace(deviceID) != ""))

	session, err := s.sessionRepo.GetSessionByToken(ctx, oldRefreshToken)
	if err != nil {
		result = "invalid_refresh_token"
		failed = true
		return nil, errors.New("invalid refresh token")
	}

	if session.IsRevoked || session.ExpiresAt.Before(time.Now()) {
		result = "refresh_token_expired_or_revoked"
		failed = true
		return nil, errors.New("refresh token expired or revoked")
	}

	// Revoke old session (Rotation)
	_ = s.sessionRepo.RevokeSession(ctx, oldRefreshToken)

	user, err := s.userRepo.GetByID(ctx, session.UserID)
	if err != nil {
		result = "user_lookup_failed"
		failed = true
		return nil, err
	}
	span.SetAttributes(attribute.String("auth.user_role", string(user.Role)))

	// Generate New Pair
	// Note: We'll assume the session was verified if it exists and 2FA was required.
	// For now, if role is SuperAdmin/Finance, we should check if they actually verified.
	// We'll pass true if the user's role doesn't require 2FA, or if the session is valid.
	accessToken, err := utils.GenerateToken(user.ID, string(user.Role), true, 15*time.Minute)
	if err != nil {
		result = "access_token_generation_failed"
		failed = true
		return nil, err
	}

	newRefreshToken := uuid.New().String()

	newSession := &domain.Session{
		ID:           uuid.New().String(),
		UserID:       user.ID,
		RefreshToken: newRefreshToken,
		DeviceID:     deviceID,
		DeviceInfo:   session.DeviceInfo,
		IsRevoked:    false,
		ExpiresAt:    time.Now().Add(7 * 24 * time.Hour),
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	err = s.sessionRepo.CreateSession(ctx, newSession)
	if err != nil {
		result = "session_create_failed"
		failed = true
		return nil, err
	}

	result = "refresh_token_rotated"
	return &AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
		ExpiresIn:    900,
		User:         user,
	}, nil
}

func (s *AuthService) Logout(ctx context.Context, refreshToken string) error {
	return s.sessionRepo.RevokeSession(ctx, refreshToken)
}

func (s *AuthService) Register(ctx context.Context, userID string, fullName, email string) error {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return errors.New("user not found")
	}

	user.FullName = fullName
	if email != "" {
		user.Email = &email
	}
	user.Status = domain.StatusActive
	user.UpdatedAt = time.Now()

	return s.userRepo.Update(ctx, user)
}

func (s *AuthService) SetPIN(ctx context.Context, userID string, pin string) error {
	pinHash, err := utils.HashPassword(pin)
	if err != nil {
		return err
	}
	err = s.userRepo.SetPIN(ctx, userID, pinHash)
	if err != nil {
		return err
	}

	// Create Audit Log
	_ = s.auditRepo.CreateAuditLog(ctx, &domain.AuditLog{
		ActorID:  userID,
		Action:   "set_pin",
		TargetID: userID,
		Payload:  "{}",
	})

	return nil
}

func (s *AuthService) GetUserByID(ctx context.Context, id string) (*domain.User, error) {
	return s.userRepo.GetByID(ctx, id)
}

func (s *AuthService) UpdateProfilePhoto(ctx context.Context, userID string, filename string, content io.Reader) (string, error) {
	url, err := s.storageService.Save(ctx, filename, content)
	if err != nil {
		return "", fmt.Errorf("failed to save profile photo: %w", err)
	}

	err = s.userRepo.UpdatePhotoURL(ctx, userID, url)
	if err != nil {
		return "", err
	}

	return url, nil
}

func (s *AuthService) UpdateUserRole(ctx context.Context, userID string, role string) error {
	err := s.userRepo.UpdateRole(ctx, userID, role)
	if err != nil {
		return err
	}

	// Create Audit Log
	_ = s.auditRepo.CreateAuditLog(ctx, &domain.AuditLog{
		ActorID:  "system", // Ideally get from context if available
		Action:   "update_user_role",
		TargetID: userID,
		Payload:  fmt.Sprintf(`{"role": "%s"}`, role),
	})

	return nil
}

func (s *AuthService) RegisterCourier(ctx context.Context, userID string, vehicleType, vehiclePlate string) error {
	profile := &domain.CourierProfile{
		UserID:       userID,
		VehicleType:  vehicleType,
		VehiclePlate: vehiclePlate,
		Status:       domain.CourierStatusPending,
		RelayScore:   100.0,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	err := s.courierRepo.CreateProfile(ctx, profile)
	if err != nil {
		return err
	}

	// Update user role to courier
	_ = s.userRepo.UpdateRole(ctx, userID, string(domain.RoleCourier))

	// Create Audit Log
	_ = s.auditRepo.CreateAuditLog(ctx, &domain.AuditLog{
		ActorID:  userID,
		Action:   "register_courier",
		TargetID: userID,
		Payload:  fmt.Sprintf(`{"vehicle_type": "%s", "vehicle_plate": "%s"}`, vehicleType, vehiclePlate),
	})

	return nil
}

func (s *AuthService) UploadCourierDocument(ctx context.Context, userID string, docType string, filename string, content io.Reader) (string, error) {
	profile, err := s.courierRepo.GetProfileByUserID(ctx, userID)
	if err != nil {
		return "", errors.New("courier profile not found")
	}

	url, err := s.storageService.Save(ctx, filename, content)
	if err != nil {
		return "", fmt.Errorf("failed to save document: %w", err)
	}

	doc := &domain.CourierDocument{
		CourierID:    profile.ID,
		DocumentType: docType,
		DocumentURL:  url,
		IsVerified:   false,
		CreatedAt:    time.Now(),
	}

	err = s.courierRepo.AddDocument(ctx, doc)
	if err != nil {
		return "", err
	}

	// Create Audit Log
	_ = s.auditRepo.CreateAuditLog(ctx, &domain.AuditLog{
		ActorID:  userID,
		Action:   "upload_document",
		TargetID: profile.ID,
		Payload:  fmt.Sprintf(`{"document_type": "%s", "url": "%s"}`, docType, url),
	})

	return url, nil
}

func (s *AuthService) GetCourierProfile(ctx context.Context, userID string) (*domain.CourierProfile, error) {
	return s.courierRepo.GetProfileByUserID(ctx, userID)
}

func (s *AuthService) GetAuditLogs(ctx context.Context, limit, offset int) ([]*domain.AuditLog, error) {
	return s.auditRepo.GetAuditLogs(ctx, limit, offset)
}

func (s *AuthService) ListCouriers(ctx context.Context, limit, offset int) ([]*domain.CourierProfile, error) {
	return s.courierRepo.ListProfiles(ctx, limit, offset)
}

func (s *AuthService) VerifyCourier(ctx context.Context, userID string) error {
	profile, err := s.courierRepo.GetProfileByUserID(ctx, userID)
	if err != nil {
		return errors.New("courier profile not found")
	}

	profile.Status = domain.CourierStatusActive
	profile.IsVerified = true
	now := time.Now()
	profile.VerifiedAt = &now

	err = s.courierRepo.UpdateProfile(ctx, profile)
	if err != nil {
		return err
	}

	// Create Audit Log
	_ = s.auditRepo.CreateAuditLog(ctx, &domain.AuditLog{
		ActorID:  "admin", // TODO: Get from context
		Action:   "verify_courier",
		TargetID: userID,
		Payload:  "{}",
	})

	return nil
}

func (s *AuthService) SuspendCourier(ctx context.Context, userID string) error {
	profile, err := s.courierRepo.GetProfileByUserID(ctx, userID)
	if err != nil {
		return errors.New("courier profile not found")
	}

	profile.Status = domain.CourierStatusSuspended
	err = s.courierRepo.UpdateStatus(ctx, profile.ID, domain.CourierStatusSuspended)
	if err != nil {
		return err
	}

	// Also suspend user account
	_ = s.userRepo.Update(ctx, &domain.User{ID: userID, Status: domain.StatusSuspended})

	// Create Audit Log
	_ = s.auditRepo.CreateAuditLog(ctx, &domain.AuditLog{
		ActorID:  "admin", // TODO: Get from context
		Action:   "suspend_courier",
		TargetID: userID,
		Payload:  "{}",
	})

	return nil
}

func (s *AuthService) AssignCourierZone(ctx context.Context, userID string, zoneID string) error {
	profile, err := s.courierRepo.GetProfileByUserID(ctx, userID)
	if err != nil {
		return errors.New("courier profile not found")
	}

	err = s.courierRepo.SetZone(ctx, profile.ID, zoneID)
	if err != nil {
		return err
	}

	// Create Audit Log
	_ = s.auditRepo.CreateAuditLog(ctx, &domain.AuditLog{
		ActorID:  "admin", // TODO: Get from context
		Action:   "assign_courier_zone",
		TargetID: userID,
		Payload:  fmt.Sprintf(`{"zone_id": "%s"}`, zoneID),
	})

	return nil
}

func (s *AuthService) Setup2FA(ctx context.Context, userID string) (string, string, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return "", "", errors.New("user not found")
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "TEMBUS",
		AccountName: user.PhoneNumber,
	})
	if err != nil {
		return "", "", err
	}

	// Save secret to database (encrypted/hashed if possible, but for now persistent)
	// We also generate backup codes
	backupCodes := make([]string, 10)
	for i := 0; i < 10; i++ {
		backupCode, err := generateOTP(8)
		if err != nil {
			return "", "", err
		}
		backupCodes[i] = backupCode
	}

	err = s.userRepo.UpdateTOTP(ctx, userID, key.Secret(), backupCodes)
	if err != nil {
		return "", "", err
	}

	return key.Secret(), key.URL(), nil
}

func (s *AuthService) Verify2FA(ctx context.Context, userID, code string) error {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return errors.New("user not found")
	}

	if user.TOTPSecret == nil {
		return errors.New("2FA not set up")
	}

	valid := totp.Validate(code, *user.TOTPSecret)
	if !valid {
		// Check backup codes
		for i, bc := range user.TOTPBackupCodes {
			if bc == code {
				// Remove used backup code
				user.TOTPBackupCodes = append(user.TOTPBackupCodes[:i], user.TOTPBackupCodes[i+1:]...)
				_ = s.userRepo.UpdateTOTP(ctx, userID, *user.TOTPSecret, user.TOTPBackupCodes)
				return nil
			}
		}
		return errors.New("invalid verification code")
	}

	// If valid and not enabled, enable it
	if !user.Is2FAEnabled {
		err = s.userRepo.Enable2FA(ctx, userID)
		if err != nil {
			return err
		}
	}

	return nil
}

func (s *AuthService) Complete2FALogin(ctx context.Context, userID, code, deviceID string, deviceInfo []byte) (*AuthResponse, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, errors.New("user not found")
	}

	// For sensitive roles that haven't set up 2FA, we treat the verification differently
	// But first, if they HAVE it enabled, they MUST provide a valid code.
	if user.Is2FAEnabled {
		if user.TOTPSecret == nil {
			return nil, errors.New("2FA secret missing despite being enabled")
		}
		valid := totp.Validate(code, *user.TOTPSecret)
		if !valid {
			// Check backup codes
			found := false
			for i, bc := range user.TOTPBackupCodes {
				if bc == code {
					user.TOTPBackupCodes = append(user.TOTPBackupCodes[:i], user.TOTPBackupCodes[i+1:]...)
					_ = s.userRepo.UpdateTOTP(ctx, userID, *user.TOTPSecret, user.TOTPBackupCodes)
					found = true
					break
				}
			}
			if !found {
				return nil, errors.New("invalid 2FA code")
			}
		}
	} else if user.Role == domain.RoleSuperAdmin || user.Role == domain.RoleFinance {
		// Mandatory setup flow: if they reach here and !Is2FAEnabled, they must have just verified a setup code
		// or they are in the process of setting it up.
		// For login purpose, if !Is2FAEnabled, we reject Complete2FALogin until they finish Verify2FA (which enables it).
		return nil, errors.New("2FA must be enabled for this role. Please complete 2FA setup first")
	} else {
		return nil, errors.New("2FA not required for this user")
	}

	return s.issueAuthSession(ctx, user, deviceID, deviceInfo, false, true)
}

func (s *AuthService) CreateAdminUser(ctx context.Context, actorID string, fullName, phoneNumber, role string) (*domain.User, error) {
	// Only super_admin can create admins (enforced in handler, but good to check here if needed)

	// Check if user already exists
	existing, _ := s.userRepo.GetByPhoneNumber(ctx, phoneNumber)
	if existing != nil {
		return nil, errors.New("user with this phone number already exists")
	}

	user := &domain.User{
		ID:          uuid.New().String(),
		PhoneNumber: phoneNumber,
		FullName:    fullName,
		Role:        domain.UserRole(role),
		Status:      domain.StatusActive,
		IsVerified:  true,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	err := s.userRepo.Create(ctx, user)
	if err != nil {
		return nil, err
	}

	// Create Audit Log
	_ = s.auditRepo.CreateAuditLog(ctx, &domain.AuditLog{
		ActorID:  actorID,
		Action:   "create_admin_user",
		TargetID: user.ID,
		Payload:  fmt.Sprintf(`{"role": "%s", "full_name": "%s"}`, role, fullName),
	})

	return user, nil
}

func (s *AuthService) GetRolePermissions(ctx context.Context, role string) ([]string, error) {
	return s.userRepo.GetPermissionsByRole(ctx, role)
}

func (s *AuthService) VerifyCourierLiveness(ctx context.Context, userID string, imageBase64 string) (bool, error) {
	profile, err := s.courierRepo.GetProfileByUserID(ctx, userID)
	if err != nil {
		return false, errors.New("courier profile not found")
	}

	success, err := s.livenessService.Verify(ctx, imageBase64)
	if err != nil {
		return false, fmt.Errorf("liveness check failed: %w", err)
	}

	if success {
		err = s.courierRepo.UpdateLivenessStatus(ctx, profile.ID, true)
		if err != nil {
			return false, err
		}

		// Create Audit Log
		_ = s.auditRepo.CreateAuditLog(ctx, &domain.AuditLog{
			ActorID:  userID,
			Action:   "liveness_verification_success",
			TargetID: profile.ID,
			Payload:  "{}",
		})
	}

	return success, nil
}

func generateOTP(max int) (string, error) {
	if max <= 0 {
		return "", errors.New("OTP length must be positive")
	}

	var table = [...]byte{'1', '2', '3', '4', '5', '6', '7', '8', '9', '0'}
	b := make([]byte, max)
	n, err := io.ReadAtLeast(rand.Reader, b, max)
	if n != max || err != nil {
		return "", errors.New("failed to generate secure OTP")
	}
	for i := 0; i < len(b); i++ {
		b[i] = table[int(b[i])%len(table)]
	}
	return string(b), nil
}
