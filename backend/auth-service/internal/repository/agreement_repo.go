package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"tembus/auth-service/internal/domain"
	"tembus/auth-service/pkg/logger"
	"time"

	"github.com/lib/pq"
)

type PostgresAgreementRepository struct {
	db     *sql.DB
	readDB *sql.DB
}

func NewPostgresAgreementRepository(db, readDB *sql.DB) *PostgresAgreementRepository {
	return &PostgresAgreementRepository{db: db, readDB: readDB}
}

// ── Notification helpers ───────────────────────────────────────────────────

var adminRoles = []string{"super_admin", "admin", "manager", "finance_admin", "ops_security", "ops_admin"}

// GetAdminUserIDs returns all user IDs with admin roles
func (r *PostgresAgreementRepository) GetAdminUserIDs(ctx context.Context) ([]string, error) {
	query := `SELECT id FROM users WHERE role = ANY($1) AND status = 'active'`
	rows, err := r.readDB.QueryContext(ctx, query, pq.Array(adminRoles))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// InsertAdminNotification inserts a notification for all admin users
func (r *PostgresAgreementRepository) InsertAdminNotification(ctx context.Context, title, body, notifType, deepLink string, metadata map[string]interface{}) ([]string, error) {
	adminIDs, err := r.GetAdminUserIDs(ctx)
	if err != nil {
		return nil, fmt.Errorf("get admin users: %w", err)
	}
	if len(adminIDs) == 0 {
		return nil, nil
	}

	metaJSON, _ := json.Marshal(metadata)
	var insertedIDs []string

	for _, adminID := range adminIDs {
		var notifID string
		err := r.db.QueryRowContext(ctx, `
			INSERT INTO notifications (user_id, title, body, type, category, channel, metadata, deep_link)
			VALUES ($1, $2, $3, $4, 'system', 'in_app', $5, $6)
			RETURNING id
		`, adminID, title, body, notifType, metaJSON, deepLink).Scan(&notifID)
		if err != nil {
			logger.Error("Failed to insert admin notification", "admin_id", adminID, "error", err)
			continue
		}
		insertedIDs = append(insertedIDs, notifID)
	}
	return insertedIDs, nil
}

func (r *PostgresAgreementRepository) Create(ctx context.Context, a *domain.Agreement) error {
	if a.ID == "" {
		a.ID = generateUUID()
	}
	if a.CreatedAt.IsZero() {
		a.CreatedAt = time.Now()
	}
	if a.UpdatedAt.IsZero() {
		a.UpdatedAt = time.Now()
	}

	var metadataJSON []byte
	if a.Metadata != nil {
		metadataJSON = a.Metadata
	} else {
		metadataJSON = []byte("{}")
	}

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO agreements (id, user_id, user_type, agreement_type, agreed_at, agreed_ip, user_agent, html_content, metadata, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`,
		a.ID, a.UserID, a.UserType, string(a.AgreementType), a.AgreedAt,
		a.AgreedIP, a.UserAgent, a.HTMLContent, metadataJSON,
		a.CreatedAt, a.UpdatedAt,
	)
	return err
}

func (r *PostgresAgreementRepository) GetByID(ctx context.Context, id string) (*domain.Agreement, error) {
	a := &domain.Agreement{}
	err := r.readDB.QueryRowContext(ctx, `
		SELECT a.id, a.user_id, a.user_type, a.agreement_type, a.agreed_at, a.agreed_ip,
		       a.user_agent, a.pdf_path, a.html_content, a.metadata, a.created_at, a.updated_at,
		       COALESCE(u.full_name, u.name, '') as user_name,
		       COALESCE(u.email, '') as user_email,
		       COALESCE(u.phone_number, '') as user_phone
		FROM agreements a
		LEFT JOIN users u ON u.id = a.user_id
		WHERE a.id = $1
	`, id).Scan(
		&a.ID, &a.UserID, &a.UserType, &a.AgreementType, &a.AgreedAt,
		&a.AgreedIP, &a.UserAgent, &a.PDFPath, &a.HTMLContent, &a.Metadata,
		&a.CreatedAt, &a.UpdatedAt,
		&a.UserName, &a.UserEmail, &a.UserPhone,
	)
	if err != nil {
		return nil, err
	}
	return a, nil
}

func (r *PostgresAgreementRepository) GetByUserID(ctx context.Context, userID string, userType string) ([]*domain.Agreement, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT id, user_id, user_type, agreement_type, agreed_at, agreed_ip,
		       user_agent, pdf_path, html_content, metadata, created_at, updated_at
		FROM agreements
		WHERE user_id = $1 AND user_type = $2
		ORDER BY agreed_at DESC
	`, userID, userType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var agreements []*domain.Agreement
	for rows.Next() {
		a := &domain.Agreement{}
		if err := rows.Scan(
			&a.ID, &a.UserID, &a.UserType, &a.AgreementType, &a.AgreedAt,
			&a.AgreedIP, &a.UserAgent, &a.PDFPath, &a.HTMLContent, &a.Metadata,
			&a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			return nil, err
		}
		agreements = append(agreements, a)
	}
	return agreements, nil
}

func (r *PostgresAgreementRepository) List(ctx context.Context, limit, offset int, userType, agreementType string) ([]*domain.Agreement, int, error) {
	where := "1=1"
	args := []interface{}{}
	argIdx := 1

	if userType != "" {
		where += fmt.Sprintf(" AND a.user_type = $%d", argIdx)
		args = append(args, userType)
		argIdx++
	}
	if agreementType != "" {
		where += fmt.Sprintf(" AND a.agreement_type = $%d", argIdx)
		args = append(args, agreementType)
		argIdx++
	}

	// Count
	var total int
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM agreements a WHERE %s", where)
	err := r.readDB.QueryRowContext(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Data
	args = append(args, limit, offset)
	query := fmt.Sprintf(`
		SELECT a.id, a.user_id, a.user_type, a.agreement_type, a.agreed_at, a.agreed_ip,
		       a.user_agent, a.pdf_path, a.html_content, a.metadata, a.created_at, a.updated_at,
		       COALESCE(u.full_name, u.name, '') as user_name,
		       COALESCE(u.email, '') as user_email,
		       COALESCE(u.phone_number, '') as user_phone
		FROM agreements a
		LEFT JOIN users u ON u.id = a.user_id
		WHERE %s
		ORDER BY a.agreed_at DESC
		LIMIT $%d OFFSET $%d
	`, where, argIdx, argIdx+1)

	rows, err := r.readDB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var agreements []*domain.Agreement
	for rows.Next() {
		a := &domain.Agreement{}
		if err := rows.Scan(
			&a.ID, &a.UserID, &a.UserType, &a.AgreementType, &a.AgreedAt,
			&a.AgreedIP, &a.UserAgent, &a.PDFPath, &a.HTMLContent, &a.Metadata,
			&a.CreatedAt, &a.UpdatedAt,
			&a.UserName, &a.UserEmail, &a.UserPhone,
		); err != nil {
			return nil, 0, err
		}
		agreements = append(agreements, a)
	}
	return agreements, total, nil
}

func (r *PostgresAgreementRepository) UpdatePDFPath(ctx context.Context, id, pdfPath string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE agreements SET pdf_path = $1, updated_at = $2 WHERE id = $3",
		pdfPath, time.Now(), id)
	return err
}

func generateUUID() string {
	b := make([]byte, 16)
	// Simple UUID v4 generation
	for i := range b {
		b[i] = byte(i) // placeholder, will be replaced by DB gen_random_uuid()
	}
	return ""
}
