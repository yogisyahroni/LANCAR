package domain

import (
	"context"
	"errors"
	"time"
)

// StaffNotifier — interface kirim notifikasi undangan staff.
// Implementasi di infrastructure (SMTP + integration-gateway WA).
type StaffNotifier interface {
	// SendInviteEmail kirim token undangan ke email staff.
	SendInviteEmail(ctx context.Context, email, staffName, token, merchantName string) error
	// SendInviteWhatsApp kirim token undangan ke nomor WA staff.
	SendInviteWhatsApp(ctx context.Context, phone, staffName, token, merchantName string) error
}

// ── Staff Management (M1, CORPORATE ONLY) ──────────────────────────
// Merchant bertipe 'perusahaan' WAJIB punya staff; 'perorangan' TIDAK.
// Semua akses staff divalidasi server-side (anti-BOLA ala Enatega).

// StaffRole — peran staff di dalam toko.
type StaffRole string

const (
	StaffRoleManager StaffRole = "manager" // full kecuali payout/withdraw & hapus toko
	StaffRoleKasir   StaffRole = "kasir"   // terima/tolak order, lihat menu, chat
	StaffRoleKitchen StaffRole = "kitchen" // update status masak (prep), lihat order
)

// ValidStaffRole — true kalau r peran valid.
func ValidStaffRole(r string) bool {
	switch StaffRole(r) {
	case StaffRoleManager, StaffRoleKasir, StaffRoleKitchen:
		return true
	}
	return false
}

// StaffStatus — lifecycle undangan staff.
type StaffStatus string

const (
	StaffStatusPending StaffStatus = "pending" // belum accept invite
	StaffStatusActive  StaffStatus = "active"
	StaffStatusRevoked StaffStatus = "revoked"
)

// StaffPermission — bitmask aksi yang boleh dilakukan staff.
// (Satu int, bukan array, agar ringan di DB & mudah dicek server-side.)
const (
	PermViewStore    = 1 << 0 // lihat profil/menu/order toko
	PermManageMenu   = 1 << 1 // CRUD menu item & varian
	PermAcceptOrder  = 1 << 2 // terima/tolak order food
	PermUpdatePrep   = 1 << 3 // update status masak (kitchen)
	PermChatCustomer = 1 << 4 // chat dengan customer
	PermManageStaff  = 1 << 5 // invite/revoke/role staff lain (manager only)
	PermViewReports  = 1 << 6 // lihat laporan penjualan
	PermManagePromo  = 1 << 7 // buat/edit promo
	// Payout/withdraw & delete toko SELALU milik owner (tidak pernah di-bitmask).
)

// DefaultPermissionsForRole — mapping role → bitmask default.
func DefaultPermissionsForRole(role StaffRole) int {
	switch role {
	case StaffRoleManager:
		return PermViewStore | PermManageMenu | PermAcceptOrder | PermUpdatePrep |
			PermChatCustomer | PermManageStaff | PermViewReports | PermManagePromo
	case StaffRoleKasir:
		return PermViewStore | PermAcceptOrder | PermChatCustomer | PermViewReports
	case StaffRoleKitchen:
		return PermViewStore | PermUpdatePrep
	}
	return 0
}

// HasPermission — true kalau staff punya bit p.
func (s *MerchantStaff) HasPermission(p int) bool {
	if s == nil || s.Status != string(StaffStatusActive) {
		return false
	}
	return s.Permissions&p != 0
}

// MerchantStaff — satu record staff toko (corporate only).
type MerchantStaff struct {
	ID          string    `json:"id"`
	MerchantID  string    `json:"merchant_id"`
	UserID      *string   `json:"user_id,omitempty"` // NULL sampai accept invite
	Role        string    `json:"role"`
	InviteToken string    `json:"-"` // tidak pernah dikirim ke client response list
	InvitedBy   string    `json:"-"` // diisi service
	Status      string    `json:"status"`
	Permissions int       `json:"permissions"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	// Field denormalisasi untuk response (diisi service, bukan DB):
	StaffName  *string `json:"staff_name,omitempty"`
	StaffEmail *string `json:"staff_email,omitempty"`
}

// StaffPublicView — response list (tanpa invite_token).
type StaffPublicView struct {
	ID          string  `json:"id"`
	MerchantID  string  `json:"merchant_id"`
	UserID      *string `json:"user_id,omitempty"`
	Role        string  `json:"role"`
	Status      string  `json:"status"`
	Permissions int     `json:"permissions"`
	StaffName   *string `json:"staff_name,omitempty"`
	StaffEmail  *string `json:"staff_email,omitempty"`
	InvitedAt   string  `json:"invited_at"`
}

// ToPublic — strip invite_token.
func (s *MerchantStaff) ToPublic() StaffPublicView {
	return StaffPublicView{
		ID:          s.ID,
		MerchantID:  s.MerchantID,
		UserID:      s.UserID,
		Role:        s.Role,
		Status:      s.Status,
		Permissions: s.Permissions,
		StaffName:   s.StaffName,
		StaffEmail:  s.StaffEmail,
		InvitedAt:   s.CreatedAt.Format(time.RFC3339),
	}
}

// InviteStaffRequest — body owner mengundang staff.
type InviteStaffRequest struct {
	// Email/WA tujuan (disimpan sebagai identifier undangan, dikirim notif oleh caller).
	Email   string `json:"email,omitempty"`
	Phone   string `json:"phone,omitempty"`
	Role    string `json:"role"` // manager|kasir|kitchen
	Message string `json:"message,omitempty"`
}

// AcceptStaffInviteRequest — body staff menerima undangan.
type AcceptStaffInviteRequest struct {
	InviteToken string `json:"invite_token"`
}

// UpdateStaffRequest — owner ubah role/status staff.
type UpdateStaffRequest struct {
	Role   *string `json:"role,omitempty"`
	Status *string `json:"status,omitempty"` // active|revoked
}

// ValidateInvite — cek field undangan valid.
func (r InviteStaffRequest) Validate() error {
	if !ValidStaffRole(r.Role) {
		return errors.New("role staff tidak valid (manager|kasir|kitchen)")
	}
	if r.Email == "" && r.Phone == "" {
		return errors.New("email atau phone wajib diisi")
	}
	return nil
}

// StaffRepository — akses data staff toko (corporate only; guard di service).
type StaffRepository interface {
	// Create simpan undangan baru (status pending).
	Create(ctx context.Context, s *MerchantStaff) error
	// ListByMerchant semua staff toko.
	ListByMerchant(ctx context.Context, merchantID string) ([]*MerchantStaff, error)
	// GetByID staff by id — scope merchant (anti-BOLA).
	GetByID(ctx context.Context, merchantID, staffID string) (*MerchantStaff, error)
	// GetByToken undangan by invite_token (accept flow).
	GetByToken(ctx context.Context, token string) (*MerchantStaff, error)
	// SetUserAndActivate accept: set user_id + status active (hanya dari pending).
	SetUserAndActivate(ctx context.Context, id, userID string) error
	// UpdateRole ubah role + permissions.
	UpdateRole(ctx context.Context, id, role string, permissions int) error
	// UpdateStatus set status (active|revoked).
	UpdateStatus(ctx context.Context, id, status string) error
	// GetActiveByUser staff aktif milik user (auth staff → merchant).
	GetActiveByUser(ctx context.Context, userID string) (*MerchantStaff, error)
	// SetUserRole set role user (dipakai saat staff accept invite → 'merchant_staff').
	SetUserRole(ctx context.Context, userID, role string) error
}

// StaffListResult carries the staff rows and the requester's effective
// management permission so clients can render an honest read-only state.
type StaffListResult struct {
	Staff     []*MerchantStaff
	CanManage bool
}

// StaffService — logika staff (corporate-only + authorization server-side).
type StaffService interface {
	// Invite owner mengundang staff (merchant korporat only).
	Invite(ctx context.Context, ownerUserID, merchantID string, req InviteStaffRequest) (*MerchantStaff, error)
	// ListStaff list staff toko (owner atau manager dengan PermManageStaff).
	ListStaff(ctx context.Context, requesterUserID, merchantID string) (*StaffListResult, error)
	// AcceptInvite staff menerima undangan → active + role merchant_staff.
	AcceptInvite(ctx context.Context, userID, token string) (*MerchantStaff, error)
	// UpdateStaff owner ubah role/status staff (scope merchant).
	UpdateStaff(ctx context.Context, ownerUserID, merchantID, staffID string, req UpdateStaffRequest) (*MerchantStaff, error)
	// PermissionCheck cek staff punya permission tertentu di toko.
	PermissionCheck(ctx context.Context, userID, merchantID string, perm int) (bool, error)
}
