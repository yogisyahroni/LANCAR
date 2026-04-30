package repository

import (
	"context"
	"database/sql"
	"lancar/auth-service/internal/domain"
	"time"
)

type postgresRepo struct {
	db *sql.DB
}

func NewPostgresRepository(db *sql.DB) *postgresRepo {
	return &postgresRepo{db: db}
}

// User Repository Implementation
func (r *postgresRepo) GetByPhoneNumber(ctx context.Context, phoneNumber string) (*domain.User, error) {
	query := `SELECT id, phone_number, full_name, role, is_verified, created_at, updated_at FROM users WHERE phone_number = $1`
	user := &domain.User{}
	err := r.db.QueryRowContext(ctx, query, phoneNumber).Scan(
		&user.ID, &user.PhoneNumber, &user.FullName, &user.Role, &user.IsVerified, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func (r *postgresRepo) Create(ctx context.Context, user *domain.User) error {
	query := `INSERT INTO users (phone_number, role, is_verified, created_at, updated_at) VALUES ($1, $2, $3, $4, $5) RETURNING id`
	return r.db.QueryRowContext(ctx, query, user.PhoneNumber, user.Role, user.IsVerified, time.Now(), time.Now()).Scan(&user.ID)
}

func (r *postgresRepo) Update(ctx context.Context, user *domain.User) error {
	query := `UPDATE users SET full_name = $1, updated_at = $2 WHERE id = $3`
	_, err := r.db.ExecContext(ctx, query, user.FullName, time.Now(), user.ID)
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
	err := r.db.QueryRowContext(ctx, query, phoneNumber, code).Scan(
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
