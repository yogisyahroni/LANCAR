package repository

import (
	"context"
	"database/sql"
	"lancar/auth-service/internal/domain"
	"time"
)

type postgresRepo struct {
	db     *sql.DB // writer
	readDB *sql.DB // reader
}

func NewPostgresRepository(db, readDB *sql.DB) *postgresRepo {
	return &postgresRepo{
		db:     db,
		readDB: readDB,
	}
}

// User Repository Implementation
func (r *postgresRepo) GetByPhoneNumber(ctx context.Context, phoneNumber string) (*domain.User, error) {
	query := `SELECT id, phone_number, email, full_name, photo_url, role, status, referral_code, referred_by, pin_hash, is_verified, 
			  totp_secret, is_2fa_enabled, totp_backup_codes, last_login_at, created_at, updated_at 
			  FROM users WHERE phone_number = $1`
	user := &domain.User{}
	err := r.readDB.QueryRowContext(ctx, query, phoneNumber).Scan(
		&user.ID, &user.PhoneNumber, &user.Email, &user.FullName, &user.PhotoURL, &user.Role, &user.Status, 
		&user.ReferralCode, &user.ReferredBy, &user.PINHash, &user.IsVerified, 
		&user.TOTPSecret, &user.Is2FAEnabled, &user.TOTPBackupCodes, &user.LastLoginAt, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func (r *postgresRepo) GetByID(ctx context.Context, id string) (*domain.User, error) {
	query := `SELECT id, phone_number, email, full_name, photo_url, role, status, referral_code, referred_by, pin_hash, is_verified, 
			  totp_secret, is_2fa_enabled, totp_backup_codes, last_login_at, created_at, updated_at 
			  FROM users WHERE id = $1`
	user := &domain.User{}
	err := r.readDB.QueryRowContext(ctx, query, id).Scan(
		&user.ID, &user.PhoneNumber, &user.Email, &user.FullName, &user.PhotoURL, &user.Role, &user.Status, 
		&user.ReferralCode, &user.ReferredBy, &user.PINHash, &user.IsVerified, 
		&user.TOTPSecret, &user.Is2FAEnabled, &user.TOTPBackupCodes, &user.LastLoginAt, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func (r *postgresRepo) Create(ctx context.Context, user *domain.User) error {
	query := `INSERT INTO users (phone_number, full_name, role, status, is_verified, referral_code, created_at, updated_at) 
			  VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`
	return r.db.QueryRowContext(ctx, query, 
		user.PhoneNumber, user.FullName, user.Role, user.Status, user.IsVerified, user.ReferralCode, time.Now(), time.Now(),
	).Scan(&user.ID)
}

func (r *postgresRepo) Update(ctx context.Context, user *domain.User) error {
	query := `UPDATE users SET full_name = $1, email = $2, photo_url = $3, updated_at = $4 WHERE id = $5`
	_, err := r.db.ExecContext(ctx, query, user.FullName, user.Email, user.PhotoURL, time.Now(), user.ID)
	return err
}

func (r *postgresRepo) UpdateLastLogin(ctx context.Context, userID string) error {
	query := `UPDATE users SET last_login_at = $1 WHERE id = $2`
	_, err := r.db.ExecContext(ctx, query, time.Now(), userID)
	return err
}

func (r *postgresRepo) SetPIN(ctx context.Context, userID, pinHash string) error {
	query := `UPDATE users SET pin_hash = $1, updated_at = $2 WHERE id = $3`
	_, err := r.db.ExecContext(ctx, query, pinHash, time.Now(), userID)
	return err
}

func (r *postgresRepo) UpdatePhotoURL(ctx context.Context, userID, url string) error {
	query := `UPDATE users SET photo_url = $1, updated_at = $2 WHERE id = $3`
	_, err := r.db.ExecContext(ctx, query, url, time.Now(), userID)
	return err
}

func (r *postgresRepo) SetReferralCode(ctx context.Context, userID, code string) error {
	query := `UPDATE users SET referral_code = $1, updated_at = $2 WHERE id = $3`
	_, err := r.db.ExecContext(ctx, query, code, time.Now(), userID)
	return err
}

func (r *postgresRepo) UpdateRole(ctx context.Context, userID, role string) error {
	query := `UPDATE users SET role = $1, updated_at = $2 WHERE id = $3`
	_, err := r.db.ExecContext(ctx, query, role, time.Now(), userID)
	return err
}

func (r *postgresRepo) GetPermissionsByRole(ctx context.Context, role string) ([]string, error) {
	query := `SELECT p.name FROM permissions p 
			  JOIN role_permissions rp ON p.id = rp.permission_id 
			  WHERE rp.role = $1`
	rows, err := r.readDB.QueryContext(ctx, query, role)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var perms []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		perms = append(perms, p)
	}
	return perms, nil
}

func (r *postgresRepo) UpdateTOTP(ctx context.Context, userID string, secret string, backupCodes []string) error {
	query := `UPDATE users SET totp_secret = $1, totp_backup_codes = $2, updated_at = $3 WHERE id = $4`
	_, err := r.db.ExecContext(ctx, query, secret, backupCodes, time.Now(), userID)
	return err
}

func (r *postgresRepo) Enable2FA(ctx context.Context, userID string) error {
	query := `UPDATE users SET is_2fa_enabled = true, updated_at = $1 WHERE id = $2`
	_, err := r.db.ExecContext(ctx, query, time.Now(), userID)
	return err
}

// Session Repository Implementation
func (r *postgresRepo) CreateSession(ctx context.Context, s *domain.Session) error {
	query := `INSERT INTO user_sessions (user_id, refresh_token, device_id, device_info, expires_at, created_at, updated_at) 
			  VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`
	return r.db.QueryRowContext(ctx, query,
		s.UserID, s.RefreshToken, s.DeviceID, s.DeviceInfo, s.ExpiresAt, time.Now(), time.Now(),
	).Scan(&s.ID)
}

func (r *postgresRepo) GetSessionByToken(ctx context.Context, token string) (*domain.Session, error) {
	query := `SELECT id, user_id, refresh_token, device_id, device_info, is_revoked, expires_at, created_at, updated_at 
			  FROM user_sessions WHERE refresh_token = $1`
	s := &domain.Session{}
	err := r.readDB.QueryRowContext(ctx, query, token).Scan(
		&s.ID, &s.UserID, &s.RefreshToken, &s.DeviceID, &s.DeviceInfo, &s.IsRevoked, &s.ExpiresAt, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return s, nil
}

func (r *postgresRepo) RevokeSession(ctx context.Context, token string) error {
	query := `UPDATE user_sessions SET is_revoked = true, updated_at = $1 WHERE refresh_token = $2`
	_, err := r.db.ExecContext(ctx, query, time.Now(), token)
	return err
}

func (r *postgresRepo) RevokeUserSessions(ctx context.Context, userID string) error {
	query := `UPDATE user_sessions SET is_revoked = true, updated_at = $1 WHERE user_id = $2 AND is_revoked = false`
	_, err := r.db.ExecContext(ctx, query, time.Now(), userID)
	return err
}

// Auth Repository Implementation
func (r *postgresRepo) SaveOTP(ctx context.Context, otp *domain.OTPLog) error {
	query := `INSERT INTO otp_logs (phone_number, code, expires_at, is_used, created_at) VALUES ($1, $2, $3, $4, $5)`
	_, err := r.db.ExecContext(ctx, query, otp.PhoneNumber, otp.Code, otp.ExpiresAt, false, time.Now())
	return err
}

func (r *postgresRepo) VerifyOTP(ctx context.Context, phoneNumber, code string) (*domain.OTPLog, error) {
	query := `SELECT id, phone_number, code, expires_at, is_used, created_at FROM otp_logs WHERE phone_number = $1 AND code = $2 ORDER BY created_at DESC LIMIT 1`
	otp := &domain.OTPLog{}
	err := r.readDB.QueryRowContext(ctx, query, phoneNumber, code).Scan(
		&otp.ID, &otp.PhoneNumber, &otp.Code, &otp.ExpiresAt, &otp.IsUsed, &otp.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return otp, nil
}

func (r *postgresRepo) MarkOTPAsUsed(ctx context.Context, id string) error {
	query := `UPDATE otp_logs SET is_used = true WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

// Audit Repository Implementation
func (r *postgresRepo) CreateAuditLog(ctx context.Context, l *domain.AuditLog) error {
	query := `INSERT INTO audit_logs (actor_id, action, target_id, payload, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id`
	return r.db.QueryRowContext(ctx, query, l.ActorID, l.Action, l.TargetID, l.Payload, time.Now()).Scan(&l.ID)
}

func (r *postgresRepo) GetAuditLogs(ctx context.Context, limit, offset int) ([]*domain.AuditLog, error) {
	query := `SELECT id, actor_id, action, target_id, payload, created_at FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`
	rows, err := r.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []*domain.AuditLog
	for rows.Next() {
		l := &domain.AuditLog{}
		if err := rows.Scan(&l.ID, &l.ActorID, &l.Action, &l.TargetID, &l.Payload, &l.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, nil
}

// Courier Repository Implementation
func (r *postgresRepo) CreateProfile(ctx context.Context, p *domain.CourierProfile) error {
	query := `INSERT INTO courier_profiles (user_id, vehicle_type, vehicle_plate, status, relay_score, created_at, updated_at) 
			  VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`
	return r.db.QueryRowContext(ctx, query, p.UserID, p.VehicleType, p.VehiclePlate, p.Status, 100.0, time.Now(), time.Now()).Scan(&p.ID)
}

func (r *postgresRepo) GetProfileByUserID(ctx context.Context, userID string) (*domain.CourierProfile, error) {
	query := `SELECT id, user_id, vehicle_type, vehicle_plate, current_zone_id, status, relay_score, is_verified, verified_at, created_at, updated_at 
			  FROM courier_profiles WHERE user_id = $1`
	p := &domain.CourierProfile{}
	err := r.readDB.QueryRowContext(ctx, query, userID).Scan(
		&p.ID, &p.UserID, &p.VehicleType, &p.VehiclePlate, &p.CurrentZoneID, &p.Status, &p.RelayScore, &p.IsVerified, &p.VerifiedAt, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (r *postgresRepo) UpdateProfile(ctx context.Context, p *domain.CourierProfile) error {
	query := `UPDATE courier_profiles SET vehicle_type = $1, vehicle_plate = $2, current_zone_id = $3, status = $4, is_verified = $5, verified_at = $6, updated_at = $7 WHERE id = $8`
	_, err := r.db.ExecContext(ctx, query, p.VehicleType, p.VehiclePlate, p.CurrentZoneID, p.Status, p.IsVerified, p.VerifiedAt, time.Now(), p.ID)
	return err
}

func (r *postgresRepo) AddDocument(ctx context.Context, d *domain.CourierDocument) error {
	query := `INSERT INTO courier_documents (courier_id, document_type, document_url, created_at) VALUES ($1, $2, $3, $4) RETURNING id`
	return r.db.QueryRowContext(ctx, query, d.CourierID, d.DocumentType, d.DocumentURL, time.Now()).Scan(&d.ID)
}

func (r *postgresRepo) GetDocuments(ctx context.Context, courierID string) ([]*domain.CourierDocument, error) {
	query := `SELECT id, courier_id, document_type, document_url, is_verified, created_at FROM courier_documents WHERE courier_id = $1`
	rows, err := r.readDB.QueryContext(ctx, query, courierID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var docs []*domain.CourierDocument
	for rows.Next() {
		d := &domain.CourierDocument{}
		if err := rows.Scan(&d.ID, &d.CourierID, &d.DocumentType, &d.DocumentURL, &d.IsVerified, &d.CreatedAt); err != nil {
			return nil, err
		}
		docs = append(docs, d)
	}
	return docs, nil
}

func (r *postgresRepo) VerifyDocument(ctx context.Context, docID string) error {
	query := `UPDATE courier_documents SET is_verified = true WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, docID)
	return err
}

func (r *postgresRepo) ListProfiles(ctx context.Context, limit, offset int) ([]*domain.CourierProfile, error) {
	query := `SELECT id, user_id, vehicle_type, vehicle_plate, current_zone_id, status, relay_score, is_verified, verified_at, created_at, updated_at 
			  FROM courier_profiles ORDER BY created_at DESC LIMIT $1 OFFSET $2`
	rows, err := r.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var profiles []*domain.CourierProfile
	for rows.Next() {
		p := &domain.CourierProfile{}
		if err := rows.Scan(
			&p.ID, &p.UserID, &p.VehicleType, &p.VehiclePlate, &p.CurrentZoneID, &p.Status, &p.RelayScore, &p.IsVerified, &p.VerifiedAt, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		profiles = append(profiles, p)
	}
	return profiles, nil
}

func (r *postgresRepo) UpdateStatus(ctx context.Context, id string, status domain.CourierStatus) error {
	query := `UPDATE courier_profiles SET status = $1, updated_at = $2 WHERE id = $3`
	_, err := r.db.ExecContext(ctx, query, status, time.Now(), id)
	return err
}

func (r *postgresRepo) SetZone(ctx context.Context, id string, zoneID string) error {
	query := `UPDATE courier_profiles SET current_zone_id = $1, updated_at = $2 WHERE id = $3`
	_, err := r.db.ExecContext(ctx, query, zoneID, time.Now(), id)
	return err
}

func (r *postgresRepo) UpdateLivenessStatus(ctx context.Context, id string, status bool) error {
	query := `UPDATE courier_profiles SET liveness_verified = $1, updated_at = $2 WHERE id = $3`
	_, err := r.db.ExecContext(ctx, query, status, time.Now(), id)
	return err
}


