package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"

	"tembus/merchant-service/internal/domain"
)

// staffServiceImpl — implementasi domain.StaffService.
// SEMUA guard corporate-only + server-side authorization ada di sini
// (anti-BOLA: Enatega gagal karena authz client-trusted).
type staffServiceImpl struct {
	merchantRepo domain.MerchantRepository
	staffRepo    domain.StaffRepository
	notifier     domain.StaffNotifier
}

func NewStaffService(mr domain.MerchantRepository, sr domain.StaffRepository, n domain.StaffNotifier) domain.StaffService {
	return &staffServiceImpl{merchantRepo: mr, staffRepo: sr, notifier: n}
}

// requireCorporateOwner — pastikan userID adalah OWNER merchant korporat.
// Individual (perorangan) TIDAK boleh punya staff → error explisit.
func (s *staffServiceImpl) requireCorporateOwner(ctx context.Context, userID, merchantID string) (*domain.Merchant, error) {
	m, err := s.merchantRepo.GetByID(ctx, merchantID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, errors.New("merchant tidak ditemukan")
	}
	if !m.IsCorporate() {
		return nil, errors.New("staff management hanya untuk merchant tipe perusahaan")
	}
	if m.UserID != userID {
		return nil, errors.New("hanya owner toko yang boleh mengelola staff")
	}
	return m, nil
}

func genInviteToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// Invite — owner mengundang staff baru (pending).
func (s *staffServiceImpl) Invite(ctx context.Context, ownerUserID, merchantID string, req domain.InviteStaffRequest) (*domain.MerchantStaff, error) {
	if err := req.Validate(); err != nil {
		return nil, err
	}
	m, err := s.requireCorporateOwner(ctx, ownerUserID, merchantID)
	if err != nil {
		return nil, err
	}
	token, err := genInviteToken()
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}
	role := domain.StaffRole(req.Role)
	staff := &domain.MerchantStaff{
		MerchantID:  merchantID,
		Role:        string(role),
		InviteToken: token,
		InvitedBy:   ownerUserID,
		Status:      string(domain.StaffStatusPending),
		Permissions: domain.DefaultPermissionsForRole(role),
	}
	if err := s.staffRepo.Create(ctx, staff); err != nil {
		return nil, err
	}
	// Kirim notifikasi (email/WA) best-effort; tidak gagal-kan invite kalau notif gagal.
	if s.notifier != nil {
		go func() {
			ctx := context.Background()
			if req.Email != "" {
				if err := s.notifier.SendInviteEmail(ctx, req.Email, req.Message, token, m.NamaToko); err != nil {
					log.Printf("[StaffInvite] email gagal: %v", err)
				}
			}
			if req.Phone != "" {
				if err := s.notifier.SendInviteWhatsApp(ctx, req.Phone, req.Message, token, m.NamaToko); err != nil {
					log.Printf("[StaffInvite] WA gagal: %v", err)
				}
			}
		}()
	}
	return staff, nil
}

// ListStaff — list staff toko. Akses: owner ATAU staff aktif dengan PermManageStaff.
func (s *staffServiceImpl) ListStaff(ctx context.Context, requesterUserID, merchantID string) (*domain.StaffListResult, error) {
	canManage := false
	// Owner selalu boleh lihat.
	m, err := s.merchantRepo.GetByID(ctx, merchantID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, errors.New("merchant tidak ditemukan")
	}
	if !m.IsCorporate() {
		return nil, errors.New("merchant perorangan tidak memiliki staff")
	}
	if m.UserID != requesterUserID {
		// Bukan owner → harus staff aktif dengan permission manage staff.
		st, err := s.staffRepo.GetActiveByUser(ctx, requesterUserID)
		if err != nil {
			return nil, err
		}
		if st == nil || st.MerchantID != merchantID || !st.HasPermission(domain.PermManageStaff) {
			return nil, errors.New("tidak memiliki akses ke staff toko ini")
		}
		canManage = true
	} else {
		canManage = true
	}
	list, err := s.staffRepo.ListByMerchant(ctx, merchantID)
	if err != nil {
		return nil, err
	}
	// enrich nama/email (best-effort).
	if repo, ok := s.staffRepo.(interface {
		enrichNames(context.Context, []*domain.MerchantStaff) error
	}); ok {
		_ = repo.enrichNames(ctx, list)
	}
	return &domain.StaffListResult{Staff: list, CanManage: canManage}, nil
}

// AcceptInvite — staff menerima undangan → user_id diset, status active, role merchant_staff.
func (s *staffServiceImpl) AcceptInvite(ctx context.Context, userID, token string) (*domain.MerchantStaff, error) {
	st, err := s.staffRepo.GetByToken(ctx, token)
	if err != nil {
		return nil, err
	}
	if st == nil {
		return nil, errors.New("undangan tidak valid atau sudah tidak tersedia")
	}
	if st.Status != string(domain.StaffStatusPending) {
		return nil, errors.New("undangan sudah digunakan atau dicabut")
	}
	if err := s.staffRepo.SetUserAndActivate(ctx, st.ID, userID); err != nil {
		return nil, err
	}
	// Promote role user → merchant_staff (login sebagai staff).
	if err := s.staffRepo.SetUserRole(ctx, userID, "merchant_staff"); err != nil {
		return nil, err
	}
	// Re-fetch untuk response.
	st, err = s.staffRepo.GetByToken(ctx, token)
	if err != nil {
		return nil, err
	}
	return st, nil
}

// UpdateStaff — owner ubah role/status staff. Guard: owner + scope merchant.
func (s *staffServiceImpl) UpdateStaff(ctx context.Context, ownerUserID, merchantID, staffID string, req domain.UpdateStaffRequest) (*domain.MerchantStaff, error) {
	if _, err := s.requireCorporateOwner(ctx, ownerUserID, merchantID); err != nil {
		return nil, err
	}
	st, err := s.staffRepo.GetByID(ctx, merchantID, staffID)
	if err != nil {
		return nil, err
	}
	if st == nil {
		return nil, errors.New("staff tidak ditemukan di toko ini")
	}
	if req.Role != nil {
		if !domain.ValidStaffRole(*req.Role) {
			return nil, errors.New("role staff tidak valid")
		}
		perms := domain.DefaultPermissionsForRole(domain.StaffRole(*req.Role))
		if err := s.staffRepo.UpdateRole(ctx, staffID, *req.Role, perms); err != nil {
			return nil, err
		}
		st.Role = *req.Role
		st.Permissions = perms
	}
	if req.Status != nil {
		if *req.Status != string(domain.StaffStatusActive) && *req.Status != string(domain.StaffStatusRevoked) {
			return nil, errors.New("status harus active atau revoked")
		}
		// Tidak boleh revoke diri sendiri (owner tetap pegang toko).
		if *req.Status == string(domain.StaffStatusRevoked) && st.UserID != nil && *st.UserID == ownerUserID {
			return nil, errors.New("tidak dapat mencabut akses owner")
		}
		if err := s.staffRepo.UpdateStatus(ctx, staffID, *req.Status); err != nil {
			return nil, err
		}
		st.Status = *req.Status
	}
	return st, nil
}

// PermissionCheck — untuk endpoint lain (order/accept) cek staff punya perm.
func (s *staffServiceImpl) PermissionCheck(ctx context.Context, userID, merchantID string, perm int) (bool, error) {
	st, err := s.staffRepo.GetActiveByUser(ctx, userID)
	if err != nil {
		return false, err
	}
	if st == nil || st.MerchantID != merchantID {
		return false, nil
	}
	return st.HasPermission(perm), nil
}
