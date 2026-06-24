package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"tembus/auth-service/internal/domain"
	"tembus/auth-service/pkg/utils"
	"time"

	"github.com/google/uuid"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
)

// ─────────────────────────────────────────────
// GoogleAuthRepository aggregates the new repositories
// ─────────────────────────────────────────────

// GoogleAuthRepository is the interface the service layer needs for new Google auth tables.
type GoogleAuthRepository interface {
	// Identity
	GetByProviderSubject(ctx context.Context, provider, subject string) (*domain.CustomerAuthIdentity, error)
	GetIdentitiesByUserID(ctx context.Context, userID string) ([]*domain.CustomerAuthIdentity, error)
	CreateIdentity(ctx context.Context, identity *domain.CustomerAuthIdentity) error
	MarkIdentityLastUsed(ctx context.Context, identityID string) error
	RevokeIdentity(ctx context.Context, identityID string) error
	RevokeIdentityByUserProvider(ctx context.Context, userID, provider string) error

	// Auth Transactions
	CreateAuthTransaction(ctx context.Context, tx *domain.CustomerAuthTransaction) error
	GetAuthTransactionByID(ctx context.Context, id string) (*domain.CustomerAuthTransaction, error)
	ConsumeAuthTransaction(ctx context.Context, id string) error
	UpdateAuthTransactionStatus(ctx context.Context, id string, status domain.CustomerAuthTransactionStatus) error
	SetAuthTransactionUserID(ctx context.Context, id string, userID string) error
	CleanExpiredAuthTransactions(ctx context.Context) error

	// OTP Challenges
	CreateOTPChallenge(ctx context.Context, challenge *domain.CustomerOTPChallenge) error
	GetOTPChallengeByID(ctx context.Context, id string) (*domain.CustomerOTPChallenge, error)
	GetActiveOTPChallengeByTransaction(ctx context.Context, transactionID string) (*domain.CustomerOTPChallenge, error)
	IncrementOTPAttempts(ctx context.Context, id string, lockDurationSeconds *int) error
	MarkOTPChallengeUsed(ctx context.Context, id string) error
	RecordOTPDelivery(ctx context.Context, delivery *domain.CustomerOTPDelivery) error
	GetOTPDeliveries(ctx context.Context, challengeID string) ([]*domain.CustomerOTPDelivery, error)
	UpdateOTPDeliveryStatus(ctx context.Context, providerMessageID string, status domain.OTPDeliveryStatus, deliveredAt, failedAt *int64) error

	// Feature flags
	IsCustomerGoogleLoginEnabled(ctx context.Context) bool
	IsCustomerGoogleRegistrationEnabled(ctx context.Context) bool
	IsOTPProviderLive(ctx context.Context) bool

	// Shared user repo methods
	GetByPhoneNumber(ctx context.Context, phoneNumber string) (*domain.User, error)
	GetByID(ctx context.Context, id string) (*domain.User, error)
	Create(ctx context.Context, user *domain.User) error
	MarkVerified(ctx context.Context, userID string) error
	SetReferralCode(ctx context.Context, userID, code string) error
	UpdateLastLogin(ctx context.Context, userID string) error
	GetPermissionsByRole(ctx context.Context, role string) ([]string, error)

	// Session
	CreateSession(ctx context.Context, session *domain.Session) error
	IsTrustedDevice(ctx context.Context, userID, userRole, deviceIDHash string) (bool, error)
	TrustDevice(ctx context.Context, userID, userRole, deviceIDHash string, deviceInfo []byte) error
	TouchTrustedDevice(ctx context.Context, userID, userRole, deviceIDHash string) error

	// Audit
	CreateAuditLog(ctx context.Context, log *domain.AuditLog) error
}

// ─────────────────────────────────────────────
// GoogleAuthService
// ─────────────────────────────────────────────

// GoogleAuthService implements Google login, account linking, and Zenziva OTP flows
// for the customer surface (web + Android).
type GoogleAuthService struct {
	repo            GoogleAuthRepository
	deviceFpRepo    domain.DeviceFingerprintRepository
	tokenVerifier   *GoogleTokenVerifier
	otpProvider     domain.OTPProvider  // selected at runtime (dry_run or zenziva)
	fallbackChannel domain.OTPChannel
}

// OTP configuration from environment
type otpConfig struct {
	TTLSeconds        int
	ResendCooldown    int
	MaxAttempts       int
	DefaultChannel    domain.OTPChannel
	FallbackChannel   domain.OTPChannel
	LockSeconds       int
}

func loadOTPConfig() otpConfig {
	cfg := otpConfig{
		TTLSeconds:      300,
		ResendCooldown:  60,
		MaxAttempts:     5,
		DefaultChannel:  domain.OTPChannelWhatsApp,
		FallbackChannel: domain.OTPChannelSMS,
		LockSeconds:     300,
	}
	if v, err := strconv.Atoi(os.Getenv("OTP_TTL_SECONDS")); err == nil && v > 0 {
		cfg.TTLSeconds = v
	}
	if v, err := strconv.Atoi(os.Getenv("OTP_RESEND_COOLDOWN_SECONDS")); err == nil && v > 0 {
		cfg.ResendCooldown = v
	}
	if v, err := strconv.Atoi(os.Getenv("OTP_MAX_ATTEMPTS")); err == nil && v > 0 {
		cfg.MaxAttempts = v
	}
	if ch := os.Getenv("OTP_DEFAULT_CHANNEL"); ch == "sms" {
		cfg.DefaultChannel = domain.OTPChannelSMS
	}
	return cfg
}

// NewGoogleAuthService creates a new GoogleAuthService.
// The OTP provider is selected based on the otp_provider_live feature flag at runtime.
func NewGoogleAuthService(repo GoogleAuthRepository, df domain.DeviceFingerprintRepository, webClientID, androidClientID string) *GoogleAuthService {
	clientIDs := []string{}
	if webClientID != "" {
		clientIDs = append(clientIDs, webClientID)
	}
	if androidClientID != "" {
		clientIDs = append(clientIDs, androidClientID)
	}

	// Default to dry-run; the live provider is initialized separately and injected.
	return &GoogleAuthService{
		repo:          repo,
		deviceFpRepo:  df,
		tokenVerifier: NewGoogleTokenVerifier(clientIDs),
		otpProvider:   NewDryRunOTPProvider(),
		fallbackChannel: domain.OTPChannelSMS,
	}
}

// SetOTPProvider allows injecting a live provider (e.g., Zenziva) at startup.
func (s *GoogleAuthService) SetOTPProvider(provider domain.OTPProvider) {
	s.otpProvider = provider
}

// ─────────────────────────────────────────────
// Google Start
// ─────────────────────────────────────────────

// StartGoogleAuth creates a new auth transaction and returns the OAuth start parameters.
func (s *GoogleAuthService) StartGoogleAuth(ctx context.Context, req *domain.GoogleAuthStartRequest) (*domain.GoogleAuthStartResponse, error) {
	ctx, span := authTracer.Start(ctx, "google_auth.start")
	defer span.End()

	if !s.repo.IsCustomerGoogleLoginEnabled(ctx) && !s.repo.IsCustomerGoogleRegistrationEnabled(ctx) {
		span.SetStatus(codes.Error, "feature_disabled")
		return nil, errors.New("Google login is not currently available")
	}

	// Generate cryptographically random state and nonce
	state, err := generateSecureToken(32)
	if err != nil {
		return nil, fmt.Errorf("failed to generate state: %w", err)
	}
	nonce, err := generateSecureToken(32)
	if err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	stateHash := hashString(state)
	nonceHash := hashString(nonce)
	deviceIDHash := ""
	if req.DeviceID != "" {
		deviceIDHash = hashDeviceID(req.DeviceID)
	}

	txType := domain.AuthTxGoogleStart
	txStatus := domain.AuthTxPending
	provider := "google"
	tx := &domain.CustomerAuthTransaction{
		Type:         txType,
		Status:       txStatus,
		Provider:     &provider,
		StateHash:    &stateHash,
		NonceHash:    &nonceHash,
		DeviceIDHash: &deviceIDHash,
		Platform:     req.Platform,
		ExpiresAt:    time.Now().Add(10 * time.Minute),
	}

	if err := s.repo.CreateAuthTransaction(ctx, tx); err != nil {
		return nil, fmt.Errorf("failed to create auth transaction: %w", err)
	}

	span.SetAttributes(
		attribute.String("auth.transaction_id", tx.ID),
		attribute.String("auth.platform", req.Platform),
	)

	// Build authorization URL
	webClientID := os.Getenv("GOOGLE_CUSTOMER_WEB_CLIENT_ID")
	if webClientID == "" {
		webClientID = "YOUR_GOOGLE_WEB_CLIENT_ID"
	}
	redirectURI := req.RedirectURI
	if redirectURI == "" {
		redirectURI = "https://app.bawain.my.id/auth/google/callback"
	}

	authURL := fmt.Sprintf(
		"https://accounts.google.com/o/oauth2/v2/auth?client_id=%s&redirect_uri=%s&response_type=code&scope=openid%%20email%%20profile&state=%s&nonce=%s&prompt=select_account",
		webClientID, redirectURI, state, nonce,
	)

	return &domain.GoogleAuthStartResponse{
		TransactionID:    tx.ID,
		State:            state,
		Nonce:            nonce,
		AuthorizationURL: authURL,
	}, nil
}

// ─────────────────────────────────────────────
// Google Complete
// ─────────────────────────────────────────────

// CompleteGoogleAuth processes a Google ID token and determines the auth outcome.
// Returns one of: authenticated, requires_phone, requires_step_up_otp, blocked.
func (s *GoogleAuthService) CompleteGoogleAuth(ctx context.Context, req *domain.GoogleAuthCompleteRequest) (*domain.GoogleAuthCompleteResponse, error) {
	ctx, span := authTracer.Start(ctx, "google_auth.complete")
	defer span.End()

	span.SetAttributes(
		attribute.String("auth.platform", req.Platform),
		attribute.Bool("auth.device_id_present", req.DeviceID != ""),
	)

	if !s.repo.IsCustomerGoogleLoginEnabled(ctx) {
		return &domain.GoogleAuthCompleteResponse{Status: domain.GoogleAuthStatusBlocked}, errors.New("Google login is not currently available")
	}

	// Verify the ID token
	claims, err := s.tokenVerifier.VerifyIDToken(ctx, req.IDToken, req.Nonce)
	if err != nil {
		span.SetStatus(codes.Error, "token_verification_failed")
		// Anti-enumeration: use a generic message
		return nil, errors.New("login tidak dapat diproses, silakan coba lagi")
	}

	span.SetAttributes(
		attribute.Bool("auth.email_verified", claims.EmailVerified),
		attribute.String("auth.email_hash", hashString(claims.Email)),
	)

	// Validate transaction if provided (web flow)
	if req.TransactionID != "" {
		tx, err := s.repo.GetAuthTransactionByID(ctx, req.TransactionID)
		if err != nil || tx == nil || tx.Status != domain.AuthTxPending || time.Now().After(tx.ExpiresAt) {
			return nil, errors.New("sesi login tidak valid atau sudah kedaluwarsa")
		}
		// Consume the transaction (one-time use)
		if err := s.repo.ConsumeAuthTransaction(ctx, req.TransactionID); err != nil {
			return nil, errors.New("sesi login tidak valid atau sudah digunakan")
		}
	}

	// Look up existing Google identity
	identity, err := s.repo.GetByProviderSubject(ctx, "google", claims.Sub)
	if err != nil {
		return nil, fmt.Errorf("identity lookup failed: %w", err)
	}

	deviceIDHash := hashDeviceID(req.DeviceID)
	deviceInfoJSON, _ := json.Marshal(req.DeviceInfo)

	// ---- ANTI-TERNAK & DEVICE FINGERPRINTING ----
	if s.deviceFpRepo != nil && req.DeviceID != "" {
		isBlocked, _ := s.deviceFpRepo.IsDeviceBlocked(ctx, deviceIDHash)
		if isBlocked {
			span.SetStatus(codes.Error, "device_blocked")
			return &domain.GoogleAuthCompleteResponse{Status: domain.GoogleAuthStatusBlocked}, errors.New("login tidak dapat diproses (device_blocked)")
		}
	}
	// ---------------------------------------------

	// ─── Case 1: Existing Google identity found ───
	if identity != nil {
		user, err := s.repo.GetByID(ctx, identity.UserID)
		if err != nil || user == nil || user.Status != domain.StatusActive {
			return &domain.GoogleAuthCompleteResponse{Status: domain.GoogleAuthStatusBlocked}, errors.New("akun tidak aktif")
		}

		_ = s.repo.MarkIdentityLastUsed(ctx, identity.ID)
		_ = s.repo.SetAuthTransactionUserID(ctx, req.TransactionID, user.ID)

		// Check if device is trusted
		isTrusted, _ := s.repo.IsTrustedDevice(ctx, user.ID, string(domain.RoleCustomer), deviceIDHash)
		if isTrusted {
			_ = s.repo.TouchTrustedDevice(ctx, user.ID, string(domain.RoleCustomer), deviceIDHash)
			
			// Record fingerprint
			if s.deviceFpRepo != nil && req.DeviceID != "" {
				fp := &domain.DeviceFingerprint{
					DeviceIDHash: deviceIDHash,
					UserID:       user.ID,
					IPAddress:    req.IPAddress,
					DeviceType:   "unknown",
				}
				_ = s.deviceFpRepo.RecordFingerprint(ctx, fp)
			}

			return s.issueGoogleSession(ctx, user, req.DeviceID, deviceInfoJSON, isTrusted)
		}

		// New device — trigger step-up OTP
		return s.triggerStepUpOTP(ctx, user, req.TransactionID, req.DeviceID, string(domain.OTPPurposeNewDevice))
	}

	// ─── Case 2: No existing identity — check if email matches an existing user ───
	existingUser, _ := s.repo.GetByPhoneNumber(ctx, claims.Email)
	if existingUser != nil && existingUser.ID != "" && existingUser.Role == domain.RoleCustomer {
		// Email match found — link Google to existing account but require OTP step-up first
		txProvider := "google"
		linkTx := &domain.CustomerAuthTransaction{
			Type:         domain.AuthTxLinkGoogle,
			Status:       domain.AuthTxPending,
			Provider:     &txProvider,
			UserID:       &existingUser.ID,
			DeviceIDHash: &deviceIDHash,
			Platform:     req.Platform,
			ExpiresAt:    time.Now().Add(10 * time.Minute),
		}
		metaBytes, _ := json.Marshal(map[string]string{
			"google_sub":   claims.Sub, // stored temporarily in metadata for linking after OTP
			"google_email": claims.Email,
		})
		linkTx.Metadata = metaBytes
		_ = s.repo.CreateAuthTransaction(ctx, linkTx)

		return s.triggerStepUpOTP(ctx, existingUser, linkTx.ID, req.DeviceID, string(domain.OTPPurposeLinkGoogle))
	}

	// ─── Case 3: Brand new user — requires phone number ───
	if !s.repo.IsCustomerGoogleRegistrationEnabled(ctx) {
		return &domain.GoogleAuthCompleteResponse{Status: domain.GoogleAuthStatusBlocked}, errors.New("Registrasi dengan Google belum tersedia")
	}

	// Store claims in a pending transaction for the registration flow
	txProvider := "google"
	regTxStatus := domain.AuthTxPending
	regTx := &domain.CustomerAuthTransaction{
		Type:         domain.AuthTxGoogleComplete,
		Status:       regTxStatus,
		Provider:     &txProvider,
		DeviceIDHash: &deviceIDHash,
		Platform:     req.Platform,
		ExpiresAt:    time.Now().Add(10 * time.Minute),
	}
	metaBytes, _ := json.Marshal(map[string]string{
		"google_sub":    claims.Sub,
		"google_email":  claims.Email,
		"full_name":     claims.FullName,
		"picture":       claims.Picture,
	})
	regTx.Metadata = metaBytes
	_ = s.repo.CreateAuthTransaction(ctx, regTx)

	span.SetStatus(codes.Ok, "requires_phone")
	return &domain.GoogleAuthCompleteResponse{
		Status:        domain.GoogleAuthStatusRequiresPhone,
		TransactionID: regTx.ID,
		Email:         claims.Email,
		FullName:      claims.FullName,
	}, nil
}

// ─────────────────────────────────────────────
// OTP Send
// ─────────────────────────────────────────────

// SendCustomerOTP sends an OTP to the customer's phone number.
// Tries WhatsApp first (unless overridden), falls back to SMS on failure.
func (s *GoogleAuthService) SendCustomerOTP(ctx context.Context, req *domain.CustomerOTPSendRequest) (*domain.CustomerOTPSendResponse, error) {
	ctx, span := authTracer.Start(ctx, "google_auth.otp.send")
	defer span.End()

	cfg := loadOTPConfig()

	// Validate transaction
	tx, err := s.repo.GetAuthTransactionByID(ctx, req.TransactionID)
	if err != nil || tx == nil || tx.Status != domain.AuthTxPending || time.Now().After(tx.ExpiresAt) {
		return nil, errors.New("sesi tidak valid atau sudah kedaluwarsa")
	}

	// Normalize phone number
	phone := normalizePhone(req.PhoneNumber)
	if phone == "" {
		return nil, errors.New("nomor telepon tidak valid")
	}

	// Determine channel
	channel := domain.OTPChannelWhatsApp
	if req.PreferredChannel == string(domain.OTPChannelSMS) {
		channel = domain.OTPChannelSMS
	}

	// Generate OTP code (6 digits)
	code, err := generateNumericOTP(6)
	if err != nil {
		return nil, fmt.Errorf("failed to generate OTP: %w", err)
	}

	// Hash the code before storing
	codeHash, err := HashOTPCode(code)
	if err != nil {
		return nil, fmt.Errorf("failed to hash OTP: %w", err)
	}

	phoneHash := hashString(phone)
	recipientMask := MaskPhoneNumber(phone)
	lockSeconds := cfg.LockSeconds

	challenge := &domain.CustomerOTPChallenge{
		TransactionID:  req.TransactionID,
		UserID:         tx.UserID,
		Purpose:        domain.OTPPurpose(req.Purpose),
		IdentifierHash: phoneHash,
		RecipientMask:  recipientMask,
		Channel:        channel,
		Provider:       s.otpProvider.Name(),
		CodeHash:       codeHash,
		MaxAttempts:    cfg.MaxAttempts,
		ExpiresAt:      time.Now().Add(time.Duration(cfg.TTLSeconds) * time.Second),
	}

	if err := s.repo.CreateOTPChallenge(ctx, challenge); err != nil {
		return nil, fmt.Errorf("failed to create OTP challenge: %w", err)
	}

	// Send OTP via provider
	correlationID := uuid.New().String()
	idempotencyKey := fmt.Sprintf("otp-%s-%s", challenge.ID, correlationID)

	sendReq := domain.OTPSendRequest{
		RecipientPhone: phone,
		Channel:        channel,
		Purpose:        domain.OTPPurpose(req.Purpose),
		OTPCode:        code, // plaintext only lives here; never stored
		IdempotencyKey: idempotencyKey,
		CorrelationID:  correlationID,
	}

	result, sendErr := s.otpProvider.SendOTP(ctx, sendReq)

	// Record delivery audit
	now := time.Now()
	delivery := &domain.CustomerOTPDelivery{
		ChallengeID:       challenge.ID,
		Provider:          s.otpProvider.Name(),
		Channel:           channel,
		ProviderMessageID: nilableString(result.ProviderMessageID),
		Status:            result.Status,
		ErrorCode:         nilableString(result.NormalizedError),
		SentAt:            &now,
	}
	_ = s.repo.RecordOTPDelivery(ctx, delivery)

	// Fallback: if WhatsApp failed, try SMS
	if sendErr != nil && channel == domain.OTPChannelWhatsApp && result.Retryable == false {
		span.SetAttributes(attribute.Bool("auth.channel.fallback", true))
		smsReq := sendReq
		smsReq.Channel = domain.OTPChannelSMS
		smsResult, smsErr := s.otpProvider.SendOTP(ctx, smsReq)

		smsDelivery := &domain.CustomerOTPDelivery{
			ChallengeID:       challenge.ID,
			Provider:          s.otpProvider.Name(),
			Channel:           domain.OTPChannelSMS,
			ProviderMessageID: nilableString(smsResult.ProviderMessageID),
			Status:            domain.OTPDeliveryFallback,
			ErrorCode:         nilableString(smsResult.NormalizedError),
			SentAt:            &now,
		}
		_ = s.repo.RecordOTPDelivery(ctx, smsDelivery)

		if smsErr != nil {
			// Both channels failed — fail closed
			_ = s.repo.CreateAuditLog(ctx, &domain.AuditLog{
				ActorID:  "system",
				Action:   "otp_both_channels_failed",
				TargetID: challenge.ID,
				Payload:  fmt.Sprintf(`{"challenge_id":"%s","wa_error":"redacted","sms_error":"redacted"}`, challenge.ID),
			})
			return nil, errors.New("Kode belum dapat dikirim. Coba lagi beberapa saat.")
		}

		// SMS fallback succeeded — update challenge channel
		challenge.Channel = domain.OTPChannelSMS
	} else if sendErr != nil {
		return nil, errors.New("Kode belum dapat dikirim. Coba lagi beberapa saat.")
	}

	// Audit log (no PII, no OTP plaintext)
	_ = s.repo.CreateAuditLog(ctx, &domain.AuditLog{
		ActorID:  "system",
		Action:   "customer_otp_sent",
		TargetID: challenge.ID,
		Payload:  fmt.Sprintf(`{"challenge_id":"%s","channel":"%s","purpose":"%s","identifier_hash":"%s"}`, challenge.ID, challenge.Channel, challenge.Purpose, phoneHash),
	})

	span.SetAttributes(
		attribute.String("auth.challenge_id", challenge.ID),
		attribute.String("auth.channel", string(challenge.Channel)),
		attribute.String("auth.purpose", string(challenge.Purpose)),
	)
	_ = lockSeconds

	return &domain.CustomerOTPSendResponse{
		Status:             "sent",
		ChallengeID:        challenge.ID,
		Channel:            string(challenge.Channel),
		MaskedRecipient:    recipientMask,
		ExpiresInSeconds:   cfg.TTLSeconds,
		ResendAfterSeconds: cfg.ResendCooldown,
	}, nil
}

// ─────────────────────────────────────────────
// OTP Verify
// ─────────────────────────────────────────────

// VerifyCustomerOTP verifies the OTP code and, on success, completes the auth flow.
func (s *GoogleAuthService) VerifyCustomerOTP(ctx context.Context, req *domain.CustomerOTPVerifyRequest, deviceInfoJSON []byte) (*domain.CustomerOTPVerifyResponse, error) {
	ctx, span := authTracer.Start(ctx, "google_auth.otp.verify")
	defer span.End()

	// Validate transaction
	tx, err := s.repo.GetAuthTransactionByID(ctx, req.TransactionID)
	if err != nil || tx == nil || time.Now().After(tx.ExpiresAt) {
		return nil, errors.New("sesi tidak valid atau sudah kedaluwarsa")
	}

	// Get challenge
	challenge, err := s.repo.GetOTPChallengeByID(ctx, req.ChallengeID)
	if err != nil || challenge == nil {
		return nil, errors.New("kode tidak valid atau sudah kedaluwarsa")
	}

	// Unified error for all invalid states (anti-enumeration)
	invalidErr := errors.New("kode tidak valid atau sudah kedaluwarsa")

	if challenge.IsExpired() || challenge.IsUsed() {
		_ = s.repo.IncrementOTPAttempts(ctx, challenge.ID, nil)
		span.SetStatus(codes.Error, "otp_expired_or_used")
		return nil, invalidErr
	}

	if challenge.IsLocked() {
		span.SetStatus(codes.Error, "otp_locked")
		return nil, errors.New("Terlalu banyak percobaan. Silakan tunggu sebentar.")
	}

	if challenge.Attempts >= challenge.MaxAttempts {
		span.SetStatus(codes.Error, "otp_max_attempts")
		return nil, errors.New("Terlalu banyak percobaan. Silakan minta kode baru.")
	}

	// Verify code (constant-time comparison)
	codeOK, err := VerifyOTPCode(strings.TrimSpace(req.OTPCode), challenge.CodeHash)
	if err != nil {
		return nil, fmt.Errorf("OTP verification error: %w", err)
	}
	if !codeOK {
		lockSec := 300 // lock for 5 minutes after max attempts
		_ = s.repo.IncrementOTPAttempts(ctx, challenge.ID, &lockSec)
		span.SetStatus(codes.Error, "otp_wrong_code")
		return nil, invalidErr
	}

	// Mark OTP as used
	if err := s.repo.MarkOTPChallengeUsed(ctx, challenge.ID); err != nil {
		return nil, fmt.Errorf("failed to consume OTP: %w", err)
	}

	// Consume transaction
	_ = s.repo.ConsumeAuthTransaction(ctx, req.TransactionID)

	deviceIDHash := hashDeviceID(req.DeviceID)

	// Determine what to do based on transaction type and purpose
	switch challenge.Purpose {
	case domain.OTPPurposeRegistrationPhone:
		return s.completeRegistration(ctx, tx, req.DeviceID, deviceIDHash, deviceInfoJSON)
	case domain.OTPPurposeNewDevice, domain.OTPPurposeStepUp:
		return s.completeStepUp(ctx, tx, req.DeviceID, deviceIDHash, deviceInfoJSON)
	case domain.OTPPurposeLinkGoogle:
		return s.completeLinkGoogle(ctx, tx, req.DeviceID, deviceIDHash, deviceInfoJSON)
	default:
		return s.completeStepUp(ctx, tx, req.DeviceID, deviceIDHash, deviceInfoJSON)
	}
}

// ─────────────────────────────────────────────
// Post-OTP completion helpers
// ─────────────────────────────────────────────

func (s *GoogleAuthService) completeRegistration(ctx context.Context, tx *domain.CustomerAuthTransaction, deviceID, deviceIDHash string, deviceInfoJSON []byte) (*domain.CustomerOTPVerifyResponse, error) {
	// Parse Google claims from transaction metadata
	var meta map[string]string
	_ = json.Unmarshal(tx.Metadata, &meta)

	googleSub := meta["google_sub"]
	googleEmail := meta["google_email"]
	fullName := meta["full_name"]

	if googleSub == "" || googleEmail == "" {
		return nil, errors.New("sesi registrasi tidak valid")
	}

	// ---- ANTI-TERNAK & DEVICE FINGERPRINTING ----
	if s.deviceFpRepo != nil && deviceID != "" {
		count, _ := s.deviceFpRepo.CountUsersByDeviceHash(ctx, deviceIDHash)
		if count >= 3 {
			return nil, errors.New("maximum number of accounts for this device has been reached")
		}
	}
	// ---------------------------------------------

	// Create user account
	emailVal := googleEmail
	randomPart, _ := utils.GenerateRandomString(6)
	refCode := fmt.Sprintf("RLY-%s", randomPart)

	user := &domain.User{
		ID:          uuid.New().String(),
		Email:       &emailVal,
		FullName:    fullName,
		Role:        domain.RoleCustomer,
		Status:      domain.StatusActive,
		IsVerified:  true,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	if err := s.repo.Create(ctx, user); err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}
	_ = s.repo.SetReferralCode(ctx, user.ID, refCode)

	// Record fingerprint
	if s.deviceFpRepo != nil && deviceID != "" {
		fp := &domain.DeviceFingerprint{
			DeviceIDHash: deviceIDHash,
			UserID:       user.ID,
			IPAddress:    "unknown", // From VerifyOTP flow it's hard to get without changing signature, keep unknown
			DeviceType:   "unknown",
		}
		_ = s.deviceFpRepo.RecordFingerprint(ctx, fp)
	}

	// Create Google identity link
	emailForIdentity := googleEmail
	identity := &domain.CustomerAuthIdentity{
		UserID:          user.ID,
		Provider:        "google",
		ProviderSubject: googleSub,
		ProviderEmail:   &emailForIdentity,
		EmailVerified:   true,
	}
	_ = s.repo.CreateIdentity(ctx, identity)

	// Audit
	_ = s.repo.CreateAuditLog(ctx, &domain.AuditLog{
		ActorID:  user.ID,
		Action:   "customer_google_registration_completed",
		TargetID: user.ID,
		Payload:  fmt.Sprintf(`{"platform":"%s"}`, tx.Platform),
	})

	return s.issueOTPVerifySession(ctx, user, deviceID, deviceIDHash, deviceInfoJSON)
}

func (s *GoogleAuthService) completeStepUp(ctx context.Context, tx *domain.CustomerAuthTransaction, deviceID, deviceIDHash string, deviceInfoJSON []byte) (*domain.CustomerOTPVerifyResponse, error) {
	if tx.UserID == nil {
		return nil, errors.New("sesi tidak valid: user tidak ditemukan")
	}
	user, err := s.repo.GetByID(ctx, *tx.UserID)
	if err != nil || user == nil {
		return nil, errors.New("akun tidak ditemukan")
	}

	_ = s.repo.CreateAuditLog(ctx, &domain.AuditLog{
		ActorID:  user.ID,
		Action:   "customer_step_up_otp_completed",
		TargetID: user.ID,
		Payload:  fmt.Sprintf(`{"platform":"%s","device_id_hash":"%s"}`, tx.Platform, deviceIDHash),
	})

	return s.issueOTPVerifySession(ctx, user, deviceID, deviceIDHash, deviceInfoJSON)
}

func (s *GoogleAuthService) completeLinkGoogle(ctx context.Context, tx *domain.CustomerAuthTransaction, deviceID, deviceIDHash string, deviceInfoJSON []byte) (*domain.CustomerOTPVerifyResponse, error) {
	if tx.UserID == nil {
		return nil, errors.New("sesi tidak valid")
	}
	user, err := s.repo.GetByID(ctx, *tx.UserID)
	if err != nil || user == nil {
		return nil, errors.New("akun tidak ditemukan")
	}

	var meta map[string]string
	_ = json.Unmarshal(tx.Metadata, &meta)
	googleSub := meta["google_sub"]
	googleEmail := meta["google_email"]

	if googleSub != "" {
		emailForIdentity := googleEmail
		identity := &domain.CustomerAuthIdentity{
			UserID:          user.ID,
			Provider:        "google",
			ProviderSubject: googleSub,
			ProviderEmail:   &emailForIdentity,
			EmailVerified:   true,
		}
		_ = s.repo.CreateIdentity(ctx, identity)
	}

	_ = s.repo.CreateAuditLog(ctx, &domain.AuditLog{
		ActorID:  user.ID,
		Action:   "customer_google_linked",
		TargetID: user.ID,
		Payload:  fmt.Sprintf(`{"platform":"%s"}`, tx.Platform),
	})

	return s.issueOTPVerifySession(ctx, user, deviceID, deviceIDHash, deviceInfoJSON)
}

// ─────────────────────────────────────────────
// Session issuance helpers
// ─────────────────────────────────────────────

func (s *GoogleAuthService) issueGoogleSession(ctx context.Context, user *domain.User, deviceID string, deviceInfoJSON []byte, trustedDevice bool) (*domain.GoogleAuthCompleteResponse, error) {
	permissions, err := s.repo.GetPermissionsByRole(ctx, string(user.Role))
	if err != nil {
		return nil, fmt.Errorf("failed to fetch permissions: %w", err)
	}

	accessToken, err := utils.GenerateToken(user.ID, string(user.Role), permissions, false, 15*time.Minute)
	if err != nil {
		return nil, fmt.Errorf("failed to issue access token: %w", err)
	}
	refreshToken := uuid.New().String()
	session := &domain.Session{
		ID:           uuid.New().String(),
		UserID:       user.ID,
		RefreshToken: refreshToken,
		DeviceID:     deviceID,
		DeviceInfo:   deviceInfoJSON,
		IsRevoked:    false,
		ExpiresAt:    time.Now().Add(7 * 24 * time.Hour),
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	if err := s.repo.CreateSession(ctx, session); err != nil {
		return nil, fmt.Errorf("failed to create session: %w", err)
	}

	deviceIDHash := hashDeviceID(deviceID)
	_ = s.repo.TrustDevice(ctx, user.ID, string(domain.RoleCustomer), deviceIDHash, deviceInfoJSON)
	_ = s.repo.UpdateLastLogin(ctx, user.ID)

	emailStr := ""
	if user.Email != nil {
		emailStr = *user.Email
	}

	return &domain.GoogleAuthCompleteResponse{
		Status:        domain.GoogleAuthStatusAuthenticated,
		AccessToken:   accessToken,
		RefreshToken:  refreshToken,
		ExpiresIn:     900,
		TrustedDevice: trustedDevice,
		User: &domain.GoogleAuthUser{
			ID:          user.ID,
			Email:       emailStr,
			PhoneNumber: user.PhoneNumber,
			FullName:    user.FullName,
		},
	}, nil
}

func (s *GoogleAuthService) issueOTPVerifySession(ctx context.Context, user *domain.User, deviceID, deviceIDHash string, deviceInfoJSON []byte) (*domain.CustomerOTPVerifyResponse, error) {
	permissions, err := s.repo.GetPermissionsByRole(ctx, string(user.Role))
	if err != nil {
		return nil, fmt.Errorf("failed to fetch permissions: %w", err)
	}

	accessToken, err := utils.GenerateToken(user.ID, string(user.Role), permissions, false, 15*time.Minute)
	if err != nil {
		return nil, fmt.Errorf("failed to issue access token: %w", err)
	}
	refreshToken := uuid.New().String()
	session := &domain.Session{
		ID:           uuid.New().String(),
		UserID:       user.ID,
		RefreshToken: refreshToken,
		DeviceID:     deviceID,
		DeviceInfo:   deviceInfoJSON,
		IsRevoked:    false,
		ExpiresAt:    time.Now().Add(7 * 24 * time.Hour),
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	if err := s.repo.CreateSession(ctx, session); err != nil {
		return nil, fmt.Errorf("failed to create session: %w", err)
	}

	_ = s.repo.TrustDevice(ctx, user.ID, string(domain.RoleCustomer), deviceIDHash, deviceInfoJSON)
	_ = s.repo.UpdateLastLogin(ctx, user.ID)

	emailStr := ""
	if user.Email != nil {
		emailStr = *user.Email
	}

	return &domain.CustomerOTPVerifyResponse{
		Status:        "authenticated",
		AccessToken:   accessToken,
		RefreshToken:  refreshToken,
		ExpiresIn:     900,
		TrustedDevice: true,
		User: &domain.GoogleAuthUser{
			ID:          user.ID,
			Email:       emailStr,
			PhoneNumber: user.PhoneNumber,
			FullName:    user.FullName,
		},
	}, nil
}

func (s *GoogleAuthService) triggerStepUpOTP(ctx context.Context, user *domain.User, transactionID, deviceID, purpose string) (*domain.GoogleAuthCompleteResponse, error) {
	if transactionID != "" {
		_ = s.repo.SetAuthTransactionUserID(ctx, transactionID, user.ID)
	}

	phoneNumber := user.PhoneNumber
	maskedRecipient := MaskPhoneNumber(phoneNumber)

	return &domain.GoogleAuthCompleteResponse{
		Status:           domain.GoogleAuthStatusRequiresStepUp,
		TransactionID:    transactionID,
		MaskedRecipient:  maskedRecipient,
		PreferredChannel: string(domain.OTPChannelWhatsApp),
		FallbackChannel:  string(domain.OTPChannelSMS),
		ExpiresInSeconds: 300,
	}, nil
}

// ─────────────────────────────────────────────
// Webhook handler for delivery status
// ─────────────────────────────────────────────

// HandleZenzivaWebhook processes a delivery status webhook from Zenziva.
func (s *GoogleAuthService) HandleZenzivaWebhook(ctx context.Context, payload []byte, signature, timestamp string) error {
	if err := s.otpProvider.VerifyWebhookSignature(payload, signature, timestamp); err != nil {
		return fmt.Errorf("webhook signature invalid: %w", err)
	}

	var webhookData struct {
		MessageID   string `json:"messageId"`
		Status      string `json:"status"`
		DeliveredAt int64  `json:"deliveredAt"`
		FailedAt    int64  `json:"failedAt"`
	}
	if err := json.Unmarshal(payload, &webhookData); err != nil {
		return fmt.Errorf("failed to parse webhook payload: %w", err)
	}
	if webhookData.MessageID == "" {
		return errors.New("webhook: missing messageId")
	}

	var deliveredAt, failedAt *int64
	if webhookData.DeliveredAt > 0 {
		deliveredAt = &webhookData.DeliveredAt
	}
	if webhookData.FailedAt > 0 {
		failedAt = &webhookData.FailedAt
	}

	status := domain.OTPDeliveryStatus(strings.ToLower(webhookData.Status))
	switch status {
	case domain.OTPDeliveryDelivered, domain.OTPDeliveryFailed, domain.OTPDeliverySent:
		// valid
	default:
		status = domain.OTPDeliverySent
	}

	return s.repo.UpdateOTPDeliveryStatus(ctx, webhookData.MessageID, status, deliveredAt, failedAt)
}

// ─────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────

// generateSecureToken generates a cryptographically random hex token of byteLen bytes.
func generateSecureToken(byteLen int) (string, error) {
	b := make([]byte, byteLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// hashString computes SHA-256 of a string for use as a lookup hash.
func hashString(s string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(strings.ToLower(s))))
	return hex.EncodeToString(sum[:])
}

// normalizePhone normalizes a phone number to E.164 format (+62...).
func normalizePhone(phone string) string {
	phone = strings.TrimSpace(phone)
	phone = strings.ReplaceAll(phone, " ", "")
	phone = strings.ReplaceAll(phone, "-", "")
	if strings.HasPrefix(phone, "0") {
		phone = "+62" + phone[1:]
	} else if strings.HasPrefix(phone, "62") && !strings.HasPrefix(phone, "+62") {
		phone = "+" + phone
	}
	if len(phone) < 10 || len(phone) > 16 {
		return ""
	}
	return phone
}

// nilableString converts an empty string to nil, or returns a pointer to the string.
func nilableString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
