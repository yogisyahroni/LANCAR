package domain

import "time"

// ─────────────────────────────────────────────
// Customer Auth Identity (external providers)
// ─────────────────────────────────────────────

// CustomerAuthIdentity stores an external login provider entry for a customer.
// provider_subject is the stable "sub" from Google — never logged.
type CustomerAuthIdentity struct {
	ID              string     `json:"id" db:"id"`
	UserID          string     `json:"user_id" db:"user_id"`
	Provider        string     `json:"provider" db:"provider"`        // "google"
	ProviderSubject string     `json:"-" db:"provider_subject"`       // Google sub — never expose
	ProviderEmail   *string    `json:"provider_email" db:"provider_email"`
	EmailVerified   bool       `json:"email_verified" db:"email_verified"`
	LinkedAt        time.Time  `json:"linked_at" db:"linked_at"`
	LastUsedAt      *time.Time `json:"last_used_at" db:"last_used_at"`
	RevokedAt       *time.Time `json:"-" db:"revoked_at"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
}

// ─────────────────────────────────────────────
// Customer Auth Transaction
// ─────────────────────────────────────────────

// CustomerAuthTransactionType enumerates all transaction types.
type CustomerAuthTransactionType string

const (
	AuthTxGoogleStart    CustomerAuthTransactionType = "google_start"
	AuthTxGoogleComplete CustomerAuthTransactionType = "google_complete"
	AuthTxOTPSend        CustomerAuthTransactionType = "otp_send"
	AuthTxLinkGoogle     CustomerAuthTransactionType = "link_google"
	AuthTxStepUp         CustomerAuthTransactionType = "step_up"
)

// CustomerAuthTransactionStatus enumerates transaction lifecycle states.
type CustomerAuthTransactionStatus string

const (
	AuthTxPending   CustomerAuthTransactionStatus = "pending"
	AuthTxCompleted CustomerAuthTransactionStatus = "completed"
	AuthTxExpired   CustomerAuthTransactionStatus = "expired"
	AuthTxConsumed  CustomerAuthTransactionStatus = "consumed"
)

// CustomerAuthTransaction is a short-lived (10-min) state bag for auth flows.
// All sensitive fields are stored as hashes — never raw values.
type CustomerAuthTransaction struct {
	ID             string                        `json:"id" db:"id"`
	Type           CustomerAuthTransactionType   `json:"type" db:"type"`
	Status         CustomerAuthTransactionStatus `json:"status" db:"status"`
	Provider       *string                       `json:"-" db:"provider"`
	UserID         *string                       `json:"user_id,omitempty" db:"user_id"`
	IdentifierHash *string                       `json:"-" db:"identifier_hash"`  // hash of email or phone
	StateHash      *string                       `json:"-" db:"state_hash"`       // hash of OAuth state
	NonceHash      *string                       `json:"-" db:"nonce_hash"`       // hash of OIDC nonce
	DeviceIDHash   *string                       `json:"-" db:"device_id_hash"`   // hash of device_id
	Platform       string                        `json:"platform" db:"platform"`  // "web", "android_customer"
	ExpiresAt      time.Time                     `json:"expires_at" db:"expires_at"`
	ConsumedAt     *time.Time                    `json:"-" db:"consumed_at"`
	Metadata       []byte                        `json:"-" db:"metadata"`
	CreatedAt      time.Time                     `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time                     `json:"updated_at" db:"updated_at"`
}

// ─────────────────────────────────────────────
// Customer OTP Challenge
// ─────────────────────────────────────────────

// OTPPurpose enumerates the reason an OTP is requested.
type OTPPurpose string

const (
	OTPPurposeRegistrationPhone OTPPurpose = "registration_phone"
	OTPPurposeNewDevice         OTPPurpose = "new_device"
	OTPPurposeLinkGoogle        OTPPurpose = "link_google"
	OTPPurposePasswordReset     OTPPurpose = "password_reset"
	OTPPurposeStepUp            OTPPurpose = "step_up"
)

// OTPChannel is the delivery channel.
type OTPChannel string

const (
	OTPChannelWhatsApp OTPChannel = "whatsapp"
	OTPChannelSMS      OTPChannel = "sms"
)

// OTPProviderName identifies the OTP provider implementation.
type OTPProviderName string

const (
	OTPProviderZenziva OTPProviderName = "zenziva"
	OTPProviderDryRun  OTPProviderName = "dry_run"
)

// CustomerOTPChallenge is the single source of truth for one OTP lifecycle.
// code_hash is HMAC-SHA256(code, OTP_HASH_PEPPER). Plaintext OTP is never stored.
type CustomerOTPChallenge struct {
	ID             string          `json:"id" db:"id"`
	TransactionID  string          `json:"transaction_id" db:"transaction_id"`
	UserID         *string         `json:"-" db:"user_id"`
	Purpose        OTPPurpose      `json:"purpose" db:"purpose"`
	IdentifierHash string          `json:"-" db:"identifier_hash"` // hash of phone number
	RecipientMask  string          `json:"recipient_mask" db:"recipient_mask"` // shown to user
	Channel        OTPChannel      `json:"channel" db:"channel"`
	Provider       OTPProviderName `json:"provider" db:"provider"`
	CodeHash       string          `json:"-" db:"code_hash"` // HMAC-SHA256 — never expose
	Attempts       int             `json:"attempts" db:"attempts"`
	MaxAttempts    int             `json:"max_attempts" db:"max_attempts"`
	ExpiresAt      time.Time       `json:"expires_at" db:"expires_at"`
	UsedAt         *time.Time      `json:"-" db:"used_at"`
	LockedUntil    *time.Time      `json:"-" db:"locked_until"`
	CreatedAt      time.Time       `json:"created_at" db:"created_at"`
}

// IsExpired returns true if the OTP has passed its expiry time.
func (c *CustomerOTPChallenge) IsExpired() bool {
	return time.Now().After(c.ExpiresAt)
}

// IsLocked returns true if the challenge is temporarily locked due to too many attempts.
func (c *CustomerOTPChallenge) IsLocked() bool {
	return c.LockedUntil != nil && time.Now().Before(*c.LockedUntil)
}

// IsUsed returns true if the OTP has already been consumed.
func (c *CustomerOTPChallenge) IsUsed() bool {
	return c.UsedAt != nil
}

// ─────────────────────────────────────────────
// Customer OTP Delivery (audit)
// ─────────────────────────────────────────────

// OTPDeliveryStatus represents the outcome of a single send attempt.
type OTPDeliveryStatus string

const (
	OTPDeliveryAccepted  OTPDeliveryStatus = "accepted"
	OTPDeliverySent      OTPDeliveryStatus = "sent"
	OTPDeliveryDelivered OTPDeliveryStatus = "delivered"
	OTPDeliveryFailed    OTPDeliveryStatus = "failed"
	OTPDeliveryFallback  OTPDeliveryStatus = "fallback"
)

// CustomerOTPDelivery is an audit record for each send attempt.
// provider_message_id is stored but treated as sensitive — not logged in plain.
type CustomerOTPDelivery struct {
	ID                string            `json:"id" db:"id"`
	ChallengeID       string            `json:"challenge_id" db:"challenge_id"`
	Provider          OTPProviderName   `json:"provider" db:"provider"`
	Channel           OTPChannel        `json:"channel" db:"channel"`
	ProviderMessageID *string           `json:"-" db:"provider_message_id"` // redacted in logs
	Status            OTPDeliveryStatus `json:"status" db:"status"`
	ErrorCode         *string           `json:"-" db:"error_code"` // internal code only
	SentAt            *time.Time        `json:"sent_at" db:"sent_at"`
	DeliveredAt       *time.Time        `json:"delivered_at" db:"delivered_at"`
	FailedAt          *time.Time        `json:"failed_at" db:"failed_at"`
	CreatedAt         time.Time         `json:"created_at" db:"created_at"`
}

// ─────────────────────────────────────────────
// Google Auth API Request/Response types
// ─────────────────────────────────────────────

// GoogleAuthStartRequest is the request body for POST /auth/customer/google/start
type GoogleAuthStartRequest struct {
	Platform    string `json:"platform"`
	DeviceID    string `json:"device_id"`
	RedirectURI string `json:"redirect_uri"`
	IPAddress   string `json:"-"`
}

// GoogleAuthStartResponse is returned to the client to begin the OAuth flow.
type GoogleAuthStartResponse struct {
	TransactionID    string `json:"transaction_id"`
	State            string `json:"state"`
	Nonce            string `json:"nonce"`
	AuthorizationURL string `json:"authorization_url"`
}

// GoogleAuthCompleteRequest is the request body for POST /auth/customer/google/complete
type GoogleAuthCompleteRequest struct {
	Platform      string                     `json:"platform"`
	TransactionID string                     `json:"transaction_id,omitempty"`
	IDToken       string                     `json:"id_token"`
	Nonce         string                     `json:"nonce,omitempty"`
	DeviceID      string                     `json:"device_id"`
	DeviceInfo    GoogleAuthDeviceInfo       `json:"device_info"`
	IPAddress     string                     `json:"-"`
}

// GoogleAuthDeviceInfo carries device metadata from the client.
type GoogleAuthDeviceInfo struct {
	Model      string `json:"model"`
	OS         string `json:"os"`
	AppVersion string `json:"app_version"`
}

// GoogleAuthCompleteStatus enumerates the possible outcomes from /google/complete
type GoogleAuthCompleteStatus string

const (
	GoogleAuthStatusAuthenticated    GoogleAuthCompleteStatus = "authenticated"
	GoogleAuthStatusRequiresPhone    GoogleAuthCompleteStatus = "requires_phone"
	GoogleAuthStatusRequiresStepUp   GoogleAuthCompleteStatus = "requires_step_up_otp"
	GoogleAuthStatusRequiresLink     GoogleAuthCompleteStatus = "requires_link_confirmation"
	GoogleAuthStatusBlocked          GoogleAuthCompleteStatus = "blocked"
)

// GoogleAuthCompleteResponse is the polymorphic response from /google/complete
type GoogleAuthCompleteResponse struct {
	Status            GoogleAuthCompleteStatus `json:"status"`
	// Populated when status == "authenticated"
	AccessToken       string                   `json:"access_token,omitempty"`
	RefreshToken      string                   `json:"refresh_token,omitempty"`
	ExpiresIn         int64                    `json:"expires_in,omitempty"`
	User              *GoogleAuthUser          `json:"user,omitempty"`
	TrustedDevice     bool                     `json:"trusted_device,omitempty"`
	// Populated when status == "requires_step_up_otp" or "requires_phone"
	TransactionID     string                   `json:"transaction_id,omitempty"`
	MaskedRecipient   string                   `json:"masked_recipient,omitempty"`
	PreferredChannel  string                   `json:"preferred_channel,omitempty"`
	FallbackChannel   string                   `json:"fallback_channel,omitempty"`
	ExpiresInSeconds  int                      `json:"expires_in_seconds,omitempty"`
	// Populated when status == "requires_phone"
	Email             string                   `json:"email,omitempty"`
	FullName          string                   `json:"full_name,omitempty"`
	OtpRequired       *bool                    `json:"otp_required,omitempty"`
}

// GoogleAuthUser is a safe customer representation returned after auth.
type GoogleAuthUser struct {
	ID          string  `json:"id"`
	Email       string  `json:"email,omitempty"`
	PhoneNumber string  `json:"phone_number,omitempty"`
	FullName    string  `json:"full_name"`
}

// CustomerOTPSendRequest is the request body for POST /auth/customer/otp/send
type CustomerOTPSendRequest struct {
	TransactionID    string `json:"transaction_id"`
	Purpose          string `json:"purpose"`
	PhoneNumber      string `json:"phone_number"`
	PreferredChannel string `json:"preferred_channel"` // "whatsapp" or "sms"
}

// CustomerOTPSendResponse is the success response from /otp/send
type CustomerOTPSendResponse struct {
	Status             string `json:"status"` // "sent"
	ChallengeID        string `json:"challenge_id"`
	Channel            string `json:"channel"`
	MaskedRecipient    string `json:"masked_recipient"`
	ExpiresInSeconds   int    `json:"expires_in_seconds"`
	ResendAfterSeconds int    `json:"resend_cooldown_seconds"`
}

// CustomerOTPVerifyRequest is the request body for POST /auth/customer/otp/verify
type CustomerOTPVerifyRequest struct {
	TransactionID string `json:"transaction_id"`
	ChallengeID   string `json:"challenge_id"`
	OTPCode       string `json:"otp_code"`
	DeviceID      string `json:"device_id"`
}

// CustomerOTPVerifyResponse is the success response from /otp/verify
type CustomerOTPVerifyResponse struct {
	Status        string          `json:"status"` // "authenticated"
	AccessToken   string          `json:"access_token,omitempty"`
	RefreshToken  string          `json:"refresh_token,omitempty"`
	ExpiresIn     int64           `json:"expires_in,omitempty"`
	TrustedDevice bool            `json:"trusted_device"`
	User          *GoogleAuthUser `json:"user,omitempty"`
}
