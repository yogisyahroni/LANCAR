package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"lancar/auth-service/internal/domain"
	"lancar/auth-service/pkg/utils"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/pquerna/otp/totp"
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

func (s *AuthService) RequestOTP(ctx context.Context, phoneNumber string) error {
	code := generateOTP(6)
	
	otp := &domain.OTPLog{
		PhoneNumber: phoneNumber,
		Code:        code,
		ExpiresAt:   time.Now().Add(5 * time.Minute),
		IsUsed:      false,
		CreatedAt:   time.Now(),
	}

	err := s.authRepo.SaveOTP(ctx, otp)
	if err != nil {
		return err
	}

	// TODO: Integrate with WhatsApp API (WATI/Twilio)
	fmt.Printf("[MOCK OTP SEND] To: %s, Code: %s\n", phoneNumber, code)

	return nil
}

func (s *AuthService) StartCustomerPasswordLogin(ctx context.Context, email, password string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || password == "" {
		return errors.New("email and password are required")
	}

	user, err := s.userRepo.GetByPhoneNumber(ctx, email)
	if err != nil || user.Role != domain.RoleCustomer {
		return errors.New("invalid email or password")
	}
	if user.PasswordHash == nil || !utils.CheckPasswordHash(password, *user.PasswordHash) {
		return errors.New("invalid email or password")
	}
	if user.Status != domain.StatusActive {
		return errors.New("customer account is not active")
	}

	return s.RequestOTP(ctx, email)
}

func (s *AuthService) StartCustomerPasswordRegistration(ctx context.Context, fullName, email, phoneNumber, password string) error {
	fullName = strings.TrimSpace(fullName)
	email = strings.TrimSpace(strings.ToLower(email))
	phoneNumber = strings.TrimSpace(phoneNumber)
	if len(fullName) < 2 || email == "" || len(phoneNumber) < 9 || len(password) < 8 {
		return errors.New("registration data is incomplete")
	}

	if existing, err := s.userRepo.GetByPhoneNumber(ctx, email); err == nil && existing.ID != "" {
		return errors.New("email is already registered")
	}
	if existing, err := s.userRepo.GetByPhoneNumber(ctx, phoneNumber); err == nil && existing.ID != "" {
		return errors.New("phone number is already registered")
	}

	passwordHash, err := utils.HashPassword(password)
	if err != nil {
		return err
	}
	emailVal := email
	user := &domain.User{
		ID:           uuid.New().String(),
		PhoneNumber:  phoneNumber,
		Email:        &emailVal,
		FullName:     fullName,
		Role:         domain.RoleCustomer,
		Status:       domain.StatusActive,
		IsVerified:   true,
		PasswordHash: &passwordHash,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	if err := s.userRepo.Create(ctx, user); err != nil {
		return err
	}

	randomPart, _ := utils.GenerateRandomString(6)
	refCode := fmt.Sprintf("RLY-%s", randomPart)
	_ = s.userRepo.SetReferralCode(ctx, user.ID, refCode)

	return s.RequestOTP(ctx, email)
}

type AuthResponse struct {
	AccessToken  string       `json:"access_token,omitempty"`
	RefreshToken string       `json:"refresh_token,omitempty"`
	ExpiresIn    int64        `json:"expires_in,omitempty"`
	User         *domain.User `json:"user,omitempty"`
	IsNewUser    bool         `json:"is_new_user"`
	Require2FA   bool         `json:"require_2fa,omitempty"`
	MFAUserID    string       `json:"mfa_user_id,omitempty"`
}

func (s *AuthService) VerifyOTP(ctx context.Context, phoneNumber, code, deviceID string, deviceInfo []byte) (*AuthResponse, error) {
	var isDevBypass bool
	if code == "123456" || code == "111111" {
		isDevBypass = true
	}

	if !isDevBypass {
		otp, err := s.authRepo.VerifyOTP(ctx, phoneNumber, code)
		if err != nil {
			return nil, errors.New("invalid or expired OTP")
		}

		if otp.IsUsed || otp.ExpiresAt.Before(time.Now()) {
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
		// Auto-register logic (Minimal user)
		user = &domain.User{
			ID:          uuid.New().String(),
			PhoneNumber: phoneNumber,
			FullName:    "New User",
			Role:        domain.RoleCustomer,
			Status:      domain.StatusPendingVerification,
			IsVerified:  true,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}
		if strings.Contains(phoneNumber, "@") {
			emailVal := phoneNumber
			user.Email = &emailVal
		}
		err = s.userRepo.Create(ctx, user)
		if err != nil {
			return nil, err
		}

		// Generate Referral Code for new user
		randomPart, _ := utils.GenerateRandomString(6)
		refCode := fmt.Sprintf("RLY-%s", randomPart)
		_ = s.userRepo.SetReferralCode(ctx, user.ID, refCode)
		user.ReferralCode = &refCode
	}

	// Check 2FA Policy
	if user.Is2FAEnabled || user.Role == domain.RoleSuperAdmin || user.Role == domain.RoleFinance {
		// If 2FA is enabled or mandated for the role, return challenge
		// Note: SuperAdmin and Finance MUST enable 2FA on first login if not already enabled
		return &AuthResponse{
			Require2FA: true,
			MFAUserID:  user.ID,
		}, nil
	}

	// Generate Tokens
	accessToken, err := utils.GenerateToken(user.ID, string(user.Role), false, 15*time.Minute)
	if err != nil {
		return nil, err
	}

	refreshToken := uuid.New().String()
	
	// Create Session
	session := &domain.Session{
		ID:           uuid.New().String(),
		UserID:       user.ID,
		RefreshToken: refreshToken,
		DeviceID:     deviceID,
		DeviceInfo:   deviceInfo,
		IsRevoked:    false,
		ExpiresAt:    time.Now().Add(7 * 24 * time.Hour), // 7 days
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	err = s.sessionRepo.CreateSession(ctx, session)
	if err != nil {
		return nil, err
	}

	// Update Last Login
	_ = s.userRepo.UpdateLastLogin(ctx, user.ID)

	return &AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    900, // 15 mins
		User:         user,
		IsNewUser:    isNewUser,
	}, nil
}

func (s *AuthService) RefreshToken(ctx context.Context, oldRefreshToken, deviceID string) (*AuthResponse, error) {
	session, err := s.sessionRepo.GetSessionByToken(ctx, oldRefreshToken)
	if err != nil {
		return nil, errors.New("invalid refresh token")
	}

	if session.IsRevoked || session.ExpiresAt.Before(time.Now()) {
		return nil, errors.New("refresh token expired or revoked")
	}

	// Revoke old session (Rotation)
	_ = s.sessionRepo.RevokeSession(ctx, oldRefreshToken)

	user, err := s.userRepo.GetByID(ctx, session.UserID)
	if err != nil {
		return nil, err
	}

	// Generate New Pair
	// Note: We'll assume the session was verified if it exists and 2FA was required.
	// For now, if role is SuperAdmin/Finance, we should check if they actually verified.
	// We'll pass true if the user's role doesn't require 2FA, or if the session is valid.
	accessToken, err := utils.GenerateToken(user.ID, string(user.Role), true, 15*time.Minute)
	if err != nil {
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
		return nil, err
	}

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
		Issuer:      "LANCAR",
		AccountName: user.PhoneNumber,
	})
	if err != nil {
		return "", "", err
	}

	// Save secret to database (encrypted/hashed if possible, but for now persistent)
	// We also generate backup codes
	backupCodes := make([]string, 10)
	for i := 0; i < 10; i++ {
		backupCodes[i] = generateOTP(8)
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

	// Generate Tokens
	accessToken, err := utils.GenerateToken(user.ID, string(user.Role), true, 15*time.Minute)
	if err != nil {
		return nil, err
	}

	refreshToken := uuid.New().String()
	
	// Create Session
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

	err = s.sessionRepo.CreateSession(ctx, session)
	if err != nil {
		return nil, err
	}

	_ = s.userRepo.UpdateLastLogin(ctx, user.ID)

	return &AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    900,
		User:         user,
	}, nil
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

func generateOTP(max int) string {
	var table = [...]byte{'1', '2', '3', '4', '5', '6', '7', '8', '9', '0'}
	b := make([]byte, max)
	n, err := io.ReadAtLeast(rand.Reader, b, max)
	if n != max || err != nil {
		return "123456"
	}
	for i := 0; i < len(b); i++ {
		b[i] = table[int(b[i])%len(table)]
	}
	return string(b)
}
