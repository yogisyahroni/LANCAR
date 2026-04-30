package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"lancar/auth-service/internal/domain"
	"time"
)

type AuthService struct {
	userRepo domain.UserRepository
	authRepo domain.AuthRepository
}

func NewAuthService(u domain.UserRepository, a domain.AuthRepository) *AuthService {
	return &AuthService{
		userRepo: u,
		authRepo: a,
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

	// TODO: Integrate with WhatsApp API
	fmt.Printf("[MOCK OTP SEND] To: %s, Code: %s\n", phoneNumber, code)

	return nil
}

func (s *AuthService) VerifyOTP(ctx context.Context, phoneNumber, code string) (string, bool, error) {
	otp, err := s.authRepo.VerifyOTP(ctx, phoneNumber, code)
	if err != nil {
		return "", false, errors.New("invalid or expired OTP")
	}

	if otp.IsUsed || otp.ExpiresAt.Before(time.Now()) {
		return "", false, errors.New("OTP is no longer valid")
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
			PhoneNumber: phoneNumber,
			FullName:    "New User", // Default until /register is called
			Role:        domain.RoleCustomer,
			Status:      domain.StatusPendingVerification,
			IsVerified:  true,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}
		err = s.userRepo.Create(ctx, user)
		if err != nil {
			return "", false, err
		}
	}

	// TODO: Generate JWT Token (For now mock with ID)
	token := "mock_jwt_token_" + user.ID
	return token, isNewUser, nil
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
	// TODO: Proper bcrypt hashing
	pinHash := "hashed_" + pin 
	return s.userRepo.SetPIN(ctx, userID, pinHash)
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
