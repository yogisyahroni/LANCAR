package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"tembus/merchant-service/internal/domain"
)

// postgresMerchantStaffRepository — implementasi domain.StaffRepository.
// Semua akses staff lewat repo ini; constraint corporate-only di enforce
// service layer (merchant.business_type == 'perusahaan').
type postgresMerchantStaffRepository struct {
	db     *sql.DB
	readDB *sql.DB
}

func NewPostgresMerchantStaffRepository(db, readDB *sql.DB) domain.StaffRepository {
	return &postgresMerchantStaffRepository{db: db, readDB: readDB}
}

const staffColumns = `id, merchant_id, user_id, role, invite_token, invited_by, status, permissions, created_at, updated_at`

func scanStaff(row interface{ Scan(...any) error }) (*domain.MerchantStaff, error) {
	var s domain.MerchantStaff
	var uid, invitedBy sql.NullString
	err := row.Scan(
		&s.ID, &s.MerchantID, &uid, &s.Role, &s.InviteToken, &invitedBy, &s.Status, &s.Permissions,
		&s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if uid.Valid {
		v := uid.String
		s.UserID = &v
	}
	if invitedBy.Valid {
		s.InvitedBy = invitedBy.String
	}
	return &s, nil
}

// Create — simpan undangan baru (status pending).
func (r *postgresMerchantStaffRepository) Create(ctx context.Context, s *domain.MerchantStaff) error {
	query := `INSERT INTO merchant_staff
		(merchant_id, user_id, role, invite_token, invited_by, status, permissions)
		VALUES ($1, $2, $3, $4, $5, 'pending', $6)
		RETURNING id, created_at, updated_at`
	err := r.db.QueryRowContext(ctx, query,
		s.MerchantID, nullableString(s.UserID), s.Role, s.InviteToken, s.InvitedBy, s.Permissions,
	).Scan(&s.ID, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return fmt.Errorf("insert staff: %w", err)
	}
	return nil
}

// ListByMerchant — semua staff toko (termasuk pending/revoked).
func (r *postgresMerchantStaffRepository) ListByMerchant(ctx context.Context, merchantID string) ([]*domain.MerchantStaff, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT `+staffColumns+` FROM merchant_staff
		WHERE merchant_id = $1
		ORDER BY created_at DESC`, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*domain.MerchantStaff
	for rows.Next() {
		s, err := scanStaff(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// GetByID — satu staff by id di toko tertentu (scope merchant → anti-BOLA).
func (r *postgresMerchantStaffRepository) GetByID(ctx context.Context, merchantID, staffID string) (*domain.MerchantStaff, error) {
	row := r.readDB.QueryRowContext(ctx, `
		SELECT `+staffColumns+` FROM merchant_staff WHERE id = $1 AND merchant_id = $2`, staffID, merchantID)
	s, err := scanStaff(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return s, err
}

// GetByToken — ambil undangan by invite_token (untuk staff accept).
func (r *postgresMerchantStaffRepository) GetByToken(ctx context.Context, token string) (*domain.MerchantStaff, error) {
	row := r.readDB.QueryRowContext(ctx, `
		SELECT `+staffColumns+` FROM merchant_staff WHERE invite_token = $1`, token)
	s, err := scanStaff(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return s, err
}

// SetUserAndActivate — accept invite: set user_id + status active.
func (r *postgresMerchantStaffRepository) SetUserAndActivate(ctx context.Context, id string, userID string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchant_staff
		SET user_id = $2, status = 'active', updated_at = NOW()
		WHERE id = $1 AND status = 'pending'`, id, userID)
	if err != nil {
		return fmt.Errorf("activate staff: %w", err)
	}
	return nil
}

// UpdateRole — ubah role + permissions staff.
func (r *postgresMerchantStaffRepository) UpdateRole(ctx context.Context, id string, role string, permissions int) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchant_staff
		SET role = $2, permissions = $3, updated_at = NOW()
		WHERE id = $1`, id, role, permissions)
	if err != nil {
		return fmt.Errorf("update staff role: %w", err)
	}
	return nil
}

// UpdateStatus — set status aktif/revoked.
func (r *postgresMerchantStaffRepository) UpdateStatus(ctx context.Context, id string, status string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchant_staff SET status = $2, updated_at = NOW() WHERE id = $1`, id, status)
	if err != nil {
		return fmt.Errorf("update staff status: %w", err)
	}
	return nil
}

// GetActiveByUser staff aktif milik user (auth staff → merchant).
func (r *postgresMerchantStaffRepository) GetActiveByUser(ctx context.Context, userID string) (*domain.MerchantStaff, error) {
	row := r.readDB.QueryRowContext(ctx, `
		SELECT `+staffColumns+` FROM merchant_staff WHERE user_id = $1 AND status = 'active'
		LIMIT 1`, userID)
	s, err := scanStaff(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return s, err
}

// SetUserRole — set role user (accept invite → 'merchant_staff').
func (r *postgresMerchantStaffRepository) SetUserRole(ctx context.Context, userID, role string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE users SET role = $2 WHERE id = $1`, userID, role)
	if err != nil {
		return fmt.Errorf("set user role: %w", err)
	}
	return nil
}

// StaffName lookup: join users untuk nama/email staff (dipanggil service).
func (r *postgresMerchantStaffRepository) enrichNames(ctx context.Context, staff []*domain.MerchantStaff) error {
	for _, s := range staff {
		if s.UserID == nil {
			continue
		}
		var name, email sql.NullString
		err := r.readDB.QueryRowContext(ctx, `
			SELECT name, email FROM users WHERE id = $1`, *s.UserID).Scan(&name, &email)
		if err != nil {
			continue // best-effort; jangan gagal list karena nama kosong
		}
		if name.Valid {
			v := name.String
			s.StaffName = &v
		}
		if email.Valid {
			v := email.String
			s.StaffEmail = &v
		}
	}
	return nil
}

func nullableString(s *string) any {
	if s == nil {
		return nil
	}
	return *s
}

// Ensure time import used (ke depan bisa dipakai untuk audit).
var _ = time.Time{}