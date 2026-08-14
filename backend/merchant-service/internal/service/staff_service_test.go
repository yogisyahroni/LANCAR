package service

import (
	"context"
	"errors"
	"testing"

	"tembus/merchant-service/internal/domain"
)

// ── mocks ──────────────────────────────────────────────

type mockMerchantRepoStaff struct {
	domain.MerchantRepository
	getByID func(ctx context.Context, id string) (*domain.Merchant, error)
}

func (m *mockMerchantRepoStaff) GetByID(ctx context.Context, id string) (*domain.Merchant, error) {
	return m.getByID(ctx, id)
}

type mockStaffRepo struct {
	domain.StaffRepository
	create        func(ctx context.Context, s *domain.MerchantStaff) error
	listByMerch   func(ctx context.Context, merchantID string) ([]*domain.MerchantStaff, error)
	getByID       func(ctx context.Context, merchantID, staffID string) (*domain.MerchantStaff, error)
	getByToken    func(ctx context.Context, token string) (*domain.MerchantStaff, error)
	setUserActive func(ctx context.Context, id, userID string) error
	updateRole    func(ctx context.Context, id, role string, perms int) error
	updateStatus  func(ctx context.Context, id, status string) error
	getActiveByUsr func(ctx context.Context, userID string) (*domain.MerchantStaff, error)
	setUserRole   func(ctx context.Context, userID, role string) error
}

func (m *mockStaffRepo) Create(ctx context.Context, s *domain.MerchantStaff) error {
	return m.create(ctx, s)
}
func (m *mockStaffRepo) ListByMerchant(ctx context.Context, merchantID string) ([]*domain.MerchantStaff, error) {
	return m.listByMerch(ctx, merchantID)
}
func (m *mockStaffRepo) GetByID(ctx context.Context, merchantID, staffID string) (*domain.MerchantStaff, error) {
	return m.getByID(ctx, merchantID, staffID)
}
func (m *mockStaffRepo) GetByToken(ctx context.Context, token string) (*domain.MerchantStaff, error) {
	return m.getByToken(ctx, token)
}
func (m *mockStaffRepo) SetUserAndActivate(ctx context.Context, id, userID string) error {
	return m.setUserActive(ctx, id, userID)
}
func (m *mockStaffRepo) UpdateRole(ctx context.Context, id, role string, perms int) error {
	return m.updateRole(ctx, id, role, perms)
}
func (m *mockStaffRepo) UpdateStatus(ctx context.Context, id, status string) error {
	return m.updateStatus(ctx, id, status)
}
func (m *mockStaffRepo) GetActiveByUser(ctx context.Context, userID string) (*domain.MerchantStaff, error) {
	return m.getActiveByUsr(ctx, userID)
}
func (m *mockStaffRepo) SetUserRole(ctx context.Context, userID, role string) error {
	return m.setUserRole(ctx, userID, role)
}

// ── tests ──────────────────────────────────────────────

var ownerID = "owner-1"
var corpMerchant = &domain.Merchant{ID: "m-1", UserID: ownerID, BusinessType: domain.BusinessTypePerusahaan}

func newTestStaffSvc(m *domain.Merchant, sr *mockStaffRepo) *staffServiceImpl {
	mr := &mockMerchantRepoStaff{
		getByID: func(ctx context.Context, id string) (*domain.Merchant, error) {
			if m == nil {
				return nil, nil
			}
			return m, nil
		},
	}
	return &staffServiceImpl{merchantRepo: mr, staffRepo: sr}
}

// T1: perorangan TIDAK boleh invite → error.
func TestInvite_IndividualRejected(t *testing.T) {
	indiv := &domain.Merchant{ID: "m-2", UserID: ownerID, BusinessType: domain.BusinessTypePerorangan}
	svc := newTestStaffSvc(indiv, &mockStaffRepo{})
	_, err := svc.Invite(context.Background(), ownerID, "m-2", domain.InviteStaffRequest{Role: "kasir", Email: "a@b.com"})
	if err == nil || err.Error() != "staff management hanya untuk merchant tipe perusahaan" {
		t.Fatalf("expected corporate-only error, got: %v", err)
	}
}

// T2: bukan owner → error.
func TestInvite_NotOwnerRejected(t *testing.T) {
	svc := newTestStaffSvc(corpMerchant, &mockStaffRepo{})
	_, err := svc.Invite(context.Background(), "bukan-owner", "m-1", domain.InviteStaffRequest{Role: "kasir", Email: "a@b.com"})
	if err == nil || err.Error() != "hanya owner toko yang boleh mengelola staff" {
		t.Fatalf("expected owner-only error, got: %v", err)
	}
}

// T3: owner corporate → invite sukses (token ter-generate, pending).
func TestInvite_OwnerCorporateOK(t *testing.T) {
	var saved *domain.MerchantStaff
	sr := &mockStaffRepo{
		create: func(ctx context.Context, s *domain.MerchantStaff) error {
			saved = s
			return nil
		},
	}
	svc := newTestStaffSvc(corpMerchant, sr)
	_, err := svc.Invite(context.Background(), ownerID, "m-1", domain.InviteStaffRequest{Role: "manager", Email: "a@b.com"})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if saved == nil || saved.Status != string(domain.StaffStatusPending) {
		t.Fatalf("invite not saved as pending")
	}
	if saved.InviteToken == "" {
		t.Fatalf("invite token empty")
	}
	if saved.Permissions == 0 {
		t.Fatalf("permissions not defaulted for role")
	}
}

// T4: accept invite flow → active + role merchant_staff.
func TestAcceptInvite_Flow(t *testing.T) {
	staff := &domain.MerchantStaff{ID: "s-1", MerchantID: "m-1", Status: string(domain.StaffStatusPending), Role: "kasir"}
	var activated, roleSet bool
	sr := &mockStaffRepo{
		getByToken:    func(ctx context.Context, token string) (*domain.MerchantStaff, error) { return staff, nil },
		setUserActive: func(ctx context.Context, id, userID string) error {
			if id != "s-1" || userID != "user-x" {
				return errors.New("bad")
			}
			activated = true
			staff.Status = string(domain.StaffStatusActive)
			return nil
		},
		setUserRole: func(ctx context.Context, userID, role string) error {
			if userID != "user-x" || role != "merchant_staff" {
				return errors.New("bad role")
			}
			roleSet = true
			return nil
		},
	}
	svc := newTestStaffSvc(corpMerchant, sr)
	res, err := svc.AcceptInvite(context.Background(), "user-x", "tok-abc")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if !activated || !roleSet {
		t.Fatalf("accept flow did not activate/set role")
	}
	if res.Status != string(domain.StaffStatusActive) {
		t.Fatalf("status not active: %s", res.Status)
	}
}

// T5: BOLA scope — GetByID harus dipanggil dengan merchantID benar (anti cross-merchant).
func TestUpdateStaff_ScopeGuard(t *testing.T) {
	var gotMerchant, gotStaff string
	sr := &mockStaffRepo{
		getByID: func(ctx context.Context, merchantID, staffID string) (*domain.MerchantStaff, error) {
			gotMerchant, gotStaff = merchantID, staffID
			return &domain.MerchantStaff{ID: staffID, MerchantID: merchantID, Role: "kasir"}, nil
		},
		updateRole: func(ctx context.Context, id, role string, perms int) error { return nil },
	}
	svc := newTestStaffSvc(corpMerchant, sr)
	_, err := svc.UpdateStaff(context.Background(), ownerID, "m-1", "s-9", domain.UpdateStaffRequest{Role: ptr("kitchen")})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if gotMerchant != "m-1" || gotStaff != "s-9" {
		t.Fatalf("scope leak: merchant=%s staff=%s", gotMerchant, gotStaff)
	}
}

// T6: manager perm check.
func TestPermissionCheck(t *testing.T) {
	sr := &mockStaffRepo{
		getActiveByUsr: func(ctx context.Context, userID string) (*domain.MerchantStaff, error) {
			return &domain.MerchantStaff{MerchantID: "m-1", Status: string(domain.StaffStatusActive),
				Permissions: domain.PermAcceptOrder | domain.PermViewStore}, nil
		},
	}
	svc := newTestStaffSvc(corpMerchant, sr)
	ok, err := svc.PermissionCheck(context.Background(), "u", "m-1", domain.PermAcceptOrder)
	if err != nil || !ok {
		t.Fatalf("expected accept-order perm true, got ok=%v err=%v", ok, err)
	}
	ok, _ = svc.PermissionCheck(context.Background(), "u", "m-1", domain.PermManageStaff)
	if ok {
		t.Fatalf("expected manage-staff perm false for kasir")
	}
}

func ptr(s string) *string { return &s }
