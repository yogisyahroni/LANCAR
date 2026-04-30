package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"lancar/auth-service/internal/domain"
	"lancar/auth-service/pkg/utils"
	"time"

	"github.com/google/uuid"
)

type AuthService struct {
	userRepo    domain.UserRepository
	authRepo    domain.AuthRepository
	sessionRepo domain.SessionRepository
	courierRepo domain.CourierRepository
	auditRepo   domain.AuditRepository
}

func NewAuthService(u domain.UserRepository, a domain.AuthRepository, s domain.SessionRepository, c domain.CourierRepository, au domain.AuditRepository) *AuthService {
	return &AuthService{
		userRepo:    u,
		authRepo:    a,
		sessionRepo: s,
		courierRepo: c,
		auditRepo:   au,
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

type AuthResponse struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	ExpiresIn    int64        `json:"expires_in"` // in seconds
	User         *domain.User `json:"user"`
	IsNewUser    bool         `json:"is_new_user"`
}

func (s *AuthService) VerifyOTP(ctx context.Context, phoneNumber, code, deviceID string, deviceInfo []byte) (*AuthResponse, error) {
	otp, err := s.authRepo.VerifyOTP(ctx, phoneNumber, code)
	if err != nil {
		return nil, errors.New("invalid or expired OTP")
	}

	if otp.IsUsed || otp.ExpiresAt.Before(time.Now()) {
		return nil, errors.New("OTP is no longer valid")
	}

	// Mark as used
	_ = s.authRepo.MarkOTPAsUsed(ctx, otp.ID)

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
		err = s.userRepo.Create(ctx, user)
		if err != nil {
			return nil, err
		}

		// Generate Referral Code for new user
		refCode := fmt.Sprintf("RLY%s", user.ID[:6])
		_ = s.userRepo.SetReferralCode(ctx, user.ID, refCode)
		user.ReferralCode = &refCode
	}

	// Generate Tokens
	accessToken, err := utils.GenerateToken(user.ID, string(user.Role), 15*time.Minute)
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
	accessToken, err := utils.GenerateToken(user.ID, string(user.Role), 15*time.Minute)
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

func (s *AuthService) UpdateProfilePhoto(ctx context.Context, userID string, photoURL string) error {
	return s.userRepo.UpdatePhotoURL(ctx, userID, photoURL)
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

func (s *AuthService) UploadCourierDocument(ctx context.Context, userID string, docType, docURL string) error {
	profile, err := s.courierRepo.GetProfileByUserID(ctx, userID)
	if err != nil {
		return errors.New("courier profile not found")
	}

	doc := &domain.CourierDocument{
		CourierID:    profile.ID,
		DocumentType: docType,
		DocumentURL:  docURL,
		IsVerified:   false,
		CreatedAt:    time.Now(),
	}

	err = s.courierRepo.AddDocument(ctx, doc)
	if err != nil {
		return err
	}

	// Create Audit Log
	_ = s.auditRepo.CreateAuditLog(ctx, &domain.AuditLog{
		ActorID:  userID,
		Action:   "upload_document",
		TargetID: profile.ID,
		Payload:  fmt.Sprintf(`{"document_type": "%s"}`, docType),
	})

	return nil
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

