package domain

import (
	"context"
	"errors"
	"strings"
	"time"
)

// MerchantBranch is the canonical operational branch owned by a merchant.
type MerchantBranch struct {
	ID         string    `json:"id"`
	MerchantID string    `json:"merchant_id"`
	Code       string    `json:"code"`
	Name       string    `json:"name"`
	Address    string    `json:"address"`
	IsActive   bool      `json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type CreateMerchantBranchRequest struct {
	Code    string `json:"code"`
	Name    string `json:"name"`
	Address string `json:"address"`
}

func (r CreateMerchantBranchRequest) Validate() error {
	if strings.TrimSpace(r.Code) == "" || len(strings.TrimSpace(r.Code)) > 32 {
		return errors.New("code branch wajib diisi dan maksimal 32 karakter")
	}
	if strings.TrimSpace(r.Name) == "" || len([]rune(strings.TrimSpace(r.Name))) > 120 {
		return errors.New("nama branch wajib diisi dan maksimal 120 karakter")
	}
	if strings.TrimSpace(r.Address) == "" || len([]rune(strings.TrimSpace(r.Address))) > 500 {
		return errors.New("alamat branch wajib diisi dan maksimal 500 karakter")
	}
	return nil
}

type UpdateMerchantBranchRequest struct {
	Name     *string `json:"name,omitempty"`
	Address  *string `json:"address,omitempty"`
	IsActive *bool   `json:"is_active,omitempty"`
}

type MerchantStaffBranchAssignment struct {
	BranchIDs []string `json:"branch_ids"`
}

// MerchantDeviceSession is returned once when a device session is opened.
// SessionToken is never persisted in plaintext and is never returned by reads.
type MerchantDeviceSession struct {
	ID                 string     `json:"id"`
	MerchantID         string     `json:"merchant_id"`
	BranchID           string     `json:"branch_id"`
	UserID             string     `json:"user_id"`
	StaffID            *string    `json:"staff_id,omitempty"`
	DeviceID           string     `json:"device_id"`
	DeviceLabel        string     `json:"device_label,omitempty"`
	EffectiveRole      string     `json:"effective_role"`
	GrantedPermissions int        `json:"granted_permissions"`
	SessionToken       string     `json:"session_token,omitempty"`
	ExpiresAt          time.Time  `json:"expires_at"`
	LastSeenAt         time.Time  `json:"last_seen_at"`
	RevokedAt          *time.Time `json:"revoked_at,omitempty"`
}

type CreateMerchantDeviceSessionRequest struct {
	BranchID    string `json:"branch_id"`
	DeviceID    string `json:"device_id"`
	DeviceLabel string `json:"device_label,omitempty"`
	TTLMinutes  int    `json:"ttl_minutes,omitempty"`
}

func (r CreateMerchantDeviceSessionRequest) Validate() error {
	if strings.TrimSpace(r.BranchID) == "" {
		return errors.New("branch_id wajib diisi")
	}
	if strings.TrimSpace(r.DeviceID) == "" || len(strings.TrimSpace(r.DeviceID)) > 255 {
		return errors.New("device_id wajib diisi dan maksimal 255 karakter")
	}
	if r.TTLMinutes == 0 {
		return nil
	}
	if r.TTLMinutes < 15 || r.TTLMinutes > 43200 {
		return errors.New("ttl_minutes harus antara 15 dan 43200")
	}
	return nil
}

type MerchantSessionAuthorization struct {
	UserID             string
	MerchantID         string
	BranchID           string
	DeviceID           string
	SessionToken       string
	RequiredPermission int
}

type MerchantAccessContext struct {
	SessionToken       string
	BranchID           string
	DeviceID           string
	RequiredPermission int
}

type merchantAccessContextKey struct{}

func WithMerchantAccess(ctx context.Context, access MerchantAccessContext) context.Context {
	return context.WithValue(ctx, merchantAccessContextKey{}, access)
}

func MerchantAccessFromContext(ctx context.Context) MerchantAccessContext {
	if access, ok := ctx.Value(merchantAccessContextKey{}).(MerchantAccessContext); ok {
		return access
	}
	return MerchantAccessContext{}
}

type MerchantSecurityApproval struct {
	ID                string     `json:"id"`
	MerchantID        string     `json:"merchant_id"`
	RequestedBy       string     `json:"requested_by"`
	ChangeType        string     `json:"change_type"`
	IdempotencyKey    string     `json:"idempotency_key"`
	Status            string     `json:"status"`
	ApprovalReference string     `json:"approval_reference,omitempty"`
	ApprovedBy        *string    `json:"approved_by,omitempty"`
	ExpiresAt         time.Time  `json:"expires_at"`
	CreatedAt         time.Time  `json:"created_at"`
	ApprovedAt        *time.Time `json:"approved_at,omitempty"`
}

type CreateSecurityApprovalRequest struct {
	ChangeType     string `json:"change_type"`
	IdempotencyKey string `json:"idempotency_key"`
}

func (r CreateSecurityApprovalRequest) Validate() error {
	switch strings.TrimSpace(r.ChangeType) {
	case "bank_account", "payout", "merchant_config":
	default:
		return errors.New("change_type tidak valid")
	}
	if len(strings.TrimSpace(r.IdempotencyKey)) < 12 {
		return errors.New("idempotency_key minimal 12 karakter")
	}
	return nil
}

type ApproveSecurityApprovalRequest struct {
	ApprovalReference string `json:"approval_reference"`
}

type MerchantAccessRepository interface {
	ListBranches(ctx context.Context, merchantID string) ([]*MerchantBranch, error)
	GetBranch(ctx context.Context, merchantID, branchID string) (*MerchantBranch, error)
	CreateBranch(ctx context.Context, branch *MerchantBranch) error
	UpdateBranch(ctx context.Context, merchantID, branchID string, req UpdateMerchantBranchRequest) error
	ReplaceStaffBranches(ctx context.Context, merchantID, staffID string, branchIDs []string) error
	ListStaffBranches(ctx context.Context, merchantID, staffID string) ([]string, error)
	CreateDeviceSession(ctx context.Context, input MerchantSessionAuthorization, deviceLabel string, ttl time.Duration) (*MerchantDeviceSession, error)
	AuthorizeDeviceSession(ctx context.Context, input MerchantSessionAuthorization) (*MerchantDeviceSession, error)
	RevokeDeviceSession(ctx context.Context, merchantID, userID, sessionID string) error
	RevokeSessionsForStaff(ctx context.Context, staffID string) error
	CreateSecurityApproval(ctx context.Context, approval *MerchantSecurityApproval) error
	GetSecurityApproval(ctx context.Context, merchantID, approvalID string) (*MerchantSecurityApproval, error)
	GetSecurityApprovalByKey(ctx context.Context, merchantID, requestedBy, idempotencyKey string) (*MerchantSecurityApproval, error)
	ApproveSecurityApproval(ctx context.Context, merchantID, approvalID, approverID, reference string) error
	ValidateApprovedSecurityApproval(ctx context.Context, merchantID, requestedBy, approvalID, changeType string) error
}

type MerchantAccessService interface {
	CreateBranch(ctx context.Context, ownerUserID, merchantID string, req CreateMerchantBranchRequest) (*MerchantBranch, error)
	ListBranches(ctx context.Context, requesterUserID, merchantID string) ([]*MerchantBranch, error)
	UpdateBranch(ctx context.Context, ownerUserID, merchantID, branchID string, req UpdateMerchantBranchRequest) (*MerchantBranch, error)
	AssignStaffBranches(ctx context.Context, ownerUserID, merchantID, staffID string, assignment MerchantStaffBranchAssignment) error
	ListStaffBranches(ctx context.Context, requesterUserID, merchantID, staffID string) ([]string, error)
	CreateDeviceSession(ctx context.Context, userID, merchantID string, req CreateMerchantDeviceSessionRequest) (*MerchantDeviceSession, error)
	AuthorizeDeviceSession(ctx context.Context, input MerchantSessionAuthorization) (*MerchantDeviceSession, error)
	RevokeDeviceSession(ctx context.Context, userID, merchantID, sessionID string) error
	CreateSecurityApproval(ctx context.Context, ownerUserID, merchantID string, req CreateSecurityApprovalRequest) (*MerchantSecurityApproval, error)
	ApproveSecurityApproval(ctx context.Context, approverID, approverRole, merchantID, approvalID string, req ApproveSecurityApprovalRequest) error
}
