package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"tembus/merchant-service/internal/domain"

	"github.com/google/uuid"
)

type merchantAccessService struct {
	merchantRepo domain.MerchantRepository
	staffRepo    domain.StaffRepository
	accessRepo   domain.MerchantAccessRepository
}

func NewMerchantAccessService(mr domain.MerchantRepository, sr domain.StaffRepository, ar domain.MerchantAccessRepository) domain.MerchantAccessService {
	return &merchantAccessService{merchantRepo: mr, staffRepo: sr, accessRepo: ar}
}

func (s *merchantAccessService) ownerMerchant(ctx context.Context, userID, merchantID string) (*domain.Merchant, error) {
	m, err := s.merchantRepo.GetByID(ctx, merchantID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, errors.New("merchant tidak ditemukan")
	}
	if m.UserID != userID {
		return nil, errors.New("hanya owner merchant yang boleh melakukan perubahan ini")
	}
	return m, nil
}

func (s *merchantAccessService) CreateBranch(ctx context.Context, ownerUserID, merchantID string, req domain.CreateMerchantBranchRequest) (*domain.MerchantBranch, error) {
	if s.accessRepo == nil {
		return nil, errors.New("merchant access repository not wired")
	}
	if _, err := s.ownerMerchant(ctx, ownerUserID, merchantID); err != nil {
		return nil, err
	}
	if err := req.Validate(); err != nil {
		return nil, err
	}
	branch := &domain.MerchantBranch{
		MerchantID: merchantID,
		Code:       strings.ToUpper(strings.TrimSpace(req.Code)),
		Name:       strings.TrimSpace(req.Name),
		Address:    strings.TrimSpace(req.Address),
		IsActive:   true,
	}
	if err := s.accessRepo.CreateBranch(ctx, branch); err != nil {
		return nil, err
	}
	return branch, nil
}

func (s *merchantAccessService) ListBranches(ctx context.Context, requesterUserID, merchantID string) ([]*domain.MerchantBranch, error) {
	if s.accessRepo == nil {
		return nil, errors.New("merchant access repository not wired")
	}
	m, err := s.merchantRepo.GetByID(ctx, merchantID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, errors.New("merchant tidak ditemukan")
	}
	if m.UserID == requesterUserID {
		return s.accessRepo.ListBranches(ctx, merchantID)
	}
	access, err := s.authorizeFromContext(ctx, requesterUserID, merchantID, domain.PermViewStore)
	if err != nil {
		return nil, err
	}
	branch, err := s.accessRepo.GetBranch(ctx, merchantID, access.BranchID)
	if err != nil {
		return nil, err
	}
	if branch == nil {
		return nil, errors.New("branch tidak ditemukan")
	}
	return []*domain.MerchantBranch{branch}, nil
}

func (s *merchantAccessService) UpdateBranch(ctx context.Context, ownerUserID, merchantID, branchID string, req domain.UpdateMerchantBranchRequest) (*domain.MerchantBranch, error) {
	if s.accessRepo == nil {
		return nil, errors.New("merchant access repository not wired")
	}
	if _, err := s.ownerMerchant(ctx, ownerUserID, merchantID); err != nil {
		return nil, err
	}
	if _, err := uuid.Parse(branchID); err != nil {
		return nil, errors.New("branch_id tidak valid")
	}
	if err := s.accessRepo.UpdateBranch(ctx, merchantID, branchID, req); err != nil {
		return nil, err
	}
	return s.accessRepo.GetBranch(ctx, merchantID, branchID)
}

func (s *merchantAccessService) AssignStaffBranches(ctx context.Context, ownerUserID, merchantID, staffID string, assignment domain.MerchantStaffBranchAssignment) error {
	if s.accessRepo == nil || s.staffRepo == nil {
		return errors.New("merchant access repository not wired")
	}
	if _, err := s.ownerMerchant(ctx, ownerUserID, merchantID); err != nil {
		return err
	}
	if _, err := uuid.Parse(staffID); err != nil {
		return errors.New("staff_id tidak valid")
	}
	if len(assignment.BranchIDs) == 0 {
		return errors.New("minimal satu branch harus diberikan")
	}
	return s.accessRepo.ReplaceStaffBranches(ctx, merchantID, staffID, assignment.BranchIDs)
}

func (s *merchantAccessService) ListStaffBranches(ctx context.Context, requesterUserID, merchantID, staffID string) ([]string, error) {
	if s.accessRepo == nil {
		return nil, errors.New("merchant access repository not wired")
	}
	m, err := s.merchantRepo.GetByID(ctx, merchantID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, errors.New("merchant tidak ditemukan")
	}
	if m.UserID != requesterUserID {
		if _, err := s.authorizeFromContext(ctx, requesterUserID, merchantID, domain.PermManageStaff); err != nil {
			return nil, err
		}
	}
	return s.accessRepo.ListStaffBranches(ctx, merchantID, staffID)
}

func newSessionToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func (s *merchantAccessService) CreateDeviceSession(ctx context.Context, userID, merchantID string, req domain.CreateMerchantDeviceSessionRequest) (*domain.MerchantDeviceSession, error) {
	if s.accessRepo == nil {
		return nil, errors.New("merchant access repository not wired")
	}
	if err := req.Validate(); err != nil {
		return nil, err
	}
	token, err := newSessionToken()
	if err != nil {
		return nil, err
	}
	ttl := 12 * time.Hour
	if req.TTLMinutes > 0 {
		ttl = time.Duration(req.TTLMinutes) * time.Minute
	}
	session, err := s.accessRepo.CreateDeviceSession(ctx, domain.MerchantSessionAuthorization{
		UserID: userID, MerchantID: merchantID, BranchID: req.BranchID,
		DeviceID: req.DeviceID, SessionToken: token,
	}, strings.TrimSpace(req.DeviceLabel), ttl)
	if err != nil {
		return nil, err
	}
	return session, nil
}

func (s *merchantAccessService) authorizeFromContext(ctx context.Context, userID, merchantID string, permission int) (*domain.MerchantDeviceSession, error) {
	if s.accessRepo == nil {
		return nil, errors.New("merchant access repository not wired")
	}
	access := domain.MerchantAccessFromContext(ctx)
	if strings.TrimSpace(access.SessionToken) == "" || strings.TrimSpace(access.BranchID) == "" || strings.TrimSpace(access.DeviceID) == "" {
		return nil, errors.New("merchant session, branch, dan device wajib diisi")
	}
	return s.accessRepo.AuthorizeDeviceSession(ctx, domain.MerchantSessionAuthorization{
		UserID: userID, MerchantID: merchantID, BranchID: access.BranchID,
		DeviceID: access.DeviceID, SessionToken: access.SessionToken,
		RequiredPermission: permission,
	})
}

func (s *merchantAccessService) AuthorizeDeviceSession(ctx context.Context, input domain.MerchantSessionAuthorization) (*domain.MerchantDeviceSession, error) {
	if s.accessRepo == nil {
		return nil, errors.New("merchant access repository not wired")
	}
	return s.accessRepo.AuthorizeDeviceSession(ctx, input)
}

func (s *merchantAccessService) RevokeDeviceSession(ctx context.Context, userID, merchantID, sessionID string) error {
	if s.accessRepo == nil {
		return errors.New("merchant access repository not wired")
	}
	if _, err := uuid.Parse(sessionID); err != nil {
		return errors.New("session_id tidak valid")
	}
	return s.accessRepo.RevokeDeviceSession(ctx, merchantID, userID, sessionID)
}

func (s *merchantAccessService) CreateSecurityApproval(ctx context.Context, ownerUserID, merchantID string, req domain.CreateSecurityApprovalRequest) (*domain.MerchantSecurityApproval, error) {
	if s.accessRepo == nil {
		return nil, errors.New("merchant access repository not wired")
	}
	if _, err := s.ownerMerchant(ctx, ownerUserID, merchantID); err != nil {
		return nil, err
	}
	if err := req.Validate(); err != nil {
		return nil, err
	}
	if existing, err := s.accessRepo.GetSecurityApprovalByKey(ctx, merchantID, ownerUserID, req.IdempotencyKey); err != nil {
		return nil, err
	} else if existing != nil {
		return existing, nil
	}
	approval := &domain.MerchantSecurityApproval{
		ID: uuid.New().String(), MerchantID: merchantID, RequestedBy: ownerUserID,
		ChangeType: strings.TrimSpace(req.ChangeType), IdempotencyKey: strings.TrimSpace(req.IdempotencyKey),
		Status: "pending",
	}
	if err := s.accessRepo.CreateSecurityApproval(ctx, approval); err != nil {
		return nil, err
	}
	return approval, nil
}

func (s *merchantAccessService) ApproveSecurityApproval(ctx context.Context, approverID, approverRole, merchantID, approvalID string, req domain.ApproveSecurityApprovalRequest) error {
	if s.accessRepo == nil {
		return errors.New("merchant access repository not wired")
	}
	switch strings.ToLower(strings.TrimSpace(approverRole)) {
	case "ops_security", "ops_admin", "finance_admin", "super_admin":
	default:
		return errors.New("role tidak berwenang menyetujui perubahan high-risk")
	}
	if strings.TrimSpace(req.ApprovalReference) == "" || len(strings.TrimSpace(req.ApprovalReference)) > 160 {
		return errors.New("approval_reference wajib diisi")
	}
	if _, err := uuid.Parse(approvalID); err != nil {
		return errors.New("approval_id tidak valid")
	}
	return s.accessRepo.ApproveSecurityApproval(ctx, merchantID, approvalID, approverID, strings.TrimSpace(req.ApprovalReference))
}
