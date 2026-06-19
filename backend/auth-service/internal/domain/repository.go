package domain

import "context"

type UserRepository interface {
	GetByPhoneNumber(ctx context.Context, phoneNumber string) (*User, error)
	GetByID(ctx context.Context, id string) (*User, error)
	Create(ctx context.Context, user *User) error
	Update(ctx context.Context, user *User) error
	MarkVerified(ctx context.Context, userID string) error
	UpdatePasswordHash(ctx context.Context, userID, passwordHash string) error
	SetPIN(ctx context.Context, userID, pinHash string) error
	UpdateLastLogin(ctx context.Context, userID string) error
	UpdatePhotoURL(ctx context.Context, userID, url string) error
	LockProfilePhoto(ctx context.Context, courierUserID, setByAdminID, photoURL string) error
	SetReferralCode(ctx context.Context, userID, code string) error
	UpdateRole(ctx context.Context, userID, role string) error
	GetPermissionsByRole(ctx context.Context, role string) ([]string, error)
	UpdateTOTP(ctx context.Context, userID string, secret string, backupCodes []string) error
	Enable2FA(ctx context.Context, userID string) error
}


type SessionRepository interface {
	CreateSession(ctx context.Context, session *Session) error
	GetSessionByToken(ctx context.Context, token string) (*Session, error)
	RevokeSession(ctx context.Context, token string) error
	RevokeUserSessions(ctx context.Context, userID string) error
	IsTrustedDevice(ctx context.Context, userID, userRole, deviceIDHash string) (bool, error)
	TrustDevice(ctx context.Context, userID, userRole, deviceIDHash string, deviceInfo []byte) error
	TouchTrustedDevice(ctx context.Context, userID, userRole, deviceIDHash string) error
}

type AuditRepository interface {
	CreateAuditLog(ctx context.Context, log *AuditLog) error
	GetAuditLogs(ctx context.Context, limit, offset int) ([]*AuditLog, error)
}

type CourierRepository interface {
	CreateProfile(ctx context.Context, profile *CourierProfile) error
	GetProfileByUserID(ctx context.Context, userID string) (*CourierProfile, error)
	UpdateProfile(ctx context.Context, profile *CourierProfile) error
	AddDocument(ctx context.Context, doc *CourierDocument) error
	GetDocuments(ctx context.Context, courierID string) ([]*CourierDocument, error)
	VerifyDocument(ctx context.Context, docID string) error
	ListProfiles(ctx context.Context, limit, offset int) ([]*CourierProfile, error)
	UpdateStatus(ctx context.Context, id string, status CourierStatus) error
	SetZone(ctx context.Context, id string, zoneID string) error
	UpdateLivenessStatus(ctx context.Context, id string, status bool) error
}
