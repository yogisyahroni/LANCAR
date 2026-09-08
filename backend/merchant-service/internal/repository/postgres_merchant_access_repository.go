package repository

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"tembus/merchant-service/internal/domain"

	"github.com/lib/pq"
)

type postgresMerchantAccessRepository struct {
	db     *sql.DB
	readDB *sql.DB
}

func NewPostgresMerchantAccessRepository(db, readDB *sql.DB) domain.MerchantAccessRepository {
	return &postgresMerchantAccessRepository{db: db, readDB: readDB}
}

func scanBranch(row interface{ Scan(...any) error }) (*domain.MerchantBranch, error) {
	var branch domain.MerchantBranch
	if err := row.Scan(&branch.ID, &branch.MerchantID, &branch.Code, &branch.Name, &branch.Address, &branch.IsActive, &branch.CreatedAt, &branch.UpdatedAt); err != nil {
		return nil, err
	}
	return &branch, nil
}

func (r *postgresMerchantAccessRepository) ListBranches(ctx context.Context, merchantID string) ([]*domain.MerchantBranch, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT id, merchant_id, code, name, address, is_active, created_at, updated_at
		FROM merchant_branches WHERE merchant_id = $1 ORDER BY is_active DESC, created_at ASC`, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.MerchantBranch
	for rows.Next() {
		branch, err := scanBranch(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, branch)
	}
	return out, rows.Err()
}

func (r *postgresMerchantAccessRepository) GetBranch(ctx context.Context, merchantID, branchID string) (*domain.MerchantBranch, error) {
	branch, err := scanBranch(r.readDB.QueryRowContext(ctx, `
		SELECT id, merchant_id, code, name, address, is_active, created_at, updated_at
		FROM merchant_branches WHERE merchant_id = $1 AND id = $2`, merchantID, branchID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return branch, err
}

func (r *postgresMerchantAccessRepository) CreateBranch(ctx context.Context, branch *domain.MerchantBranch) error {
	return r.db.QueryRowContext(ctx, `
		INSERT INTO merchant_branches (merchant_id, code, name, address)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at, updated_at`, branch.MerchantID, branch.Code, branch.Name, branch.Address).
		Scan(&branch.ID, &branch.CreatedAt, &branch.UpdatedAt)
}

func (r *postgresMerchantAccessRepository) UpdateBranch(ctx context.Context, merchantID, branchID string, req domain.UpdateMerchantBranchRequest) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE merchant_branches
		SET name = COALESCE(NULLIF($3, ''), name),
		    address = COALESCE(NULLIF($4, ''), address),
		    is_active = COALESCE($5, is_active), updated_at = NOW()
		WHERE merchant_id = $1 AND id = $2`, merchantID, branchID, nullableText(req.Name), nullableText(req.Address), req.IsActive)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *postgresMerchantAccessRepository) ReplaceStaffBranches(ctx context.Context, merchantID, staffID string, branchIDs []string) error {
	if len(branchIDs) == 0 {
		return errors.New("minimal satu branch harus diberikan")
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var staffExists bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM merchant_staff WHERE id = $1 AND merchant_id = $2)`, staffID, merchantID).Scan(&staffExists); err != nil {
		return err
	}
	if !staffExists {
		return sql.ErrNoRows
	}
	var validCount int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM merchant_branches WHERE merchant_id = $1 AND id = ANY($2)`, merchantID, pq.Array(branchIDs)).Scan(&validCount); err != nil {
		return err
	}
	if validCount != len(branchIDs) {
		return errors.New("branch tidak ditemukan di merchant ini")
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM merchant_staff_branch_access WHERE staff_id = $1`, staffID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO merchant_staff_branch_access (staff_id, branch_id)
		SELECT $1, UNNEST($2::uuid[])`, staffID, pq.Array(branchIDs)); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE merchant_device_sessions SET revoked_at = NOW()
		WHERE staff_id = $1 AND revoked_at IS NULL`, staffID); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *postgresMerchantAccessRepository) ListStaffBranches(ctx context.Context, merchantID, staffID string) ([]string, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT a.branch_id::text
		FROM merchant_staff_branch_access a
		JOIN merchant_staff s ON s.id = a.staff_id AND s.merchant_id = $1
		WHERE a.staff_id = $2 ORDER BY a.branch_id`, merchantID, staffID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func sessionTokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func scanDeviceSession(row interface{ Scan(...any) error }, token string) (*domain.MerchantDeviceSession, error) {
	var session domain.MerchantDeviceSession
	var staffID sql.NullString
	if err := row.Scan(&session.ID, &session.MerchantID, &session.BranchID, &session.UserID, &staffID,
		&session.DeviceID, &session.DeviceLabel, &session.GrantedPermissions, &session.ExpiresAt, &session.LastSeenAt, &session.RevokedAt, &session.EffectiveRole); err != nil {
		return nil, err
	}
	if staffID.Valid {
		session.StaffID = &staffID.String
	}
	session.SessionToken = token
	return &session, nil
}

const deviceSessionProjection = `
	d.id, d.merchant_id, d.branch_id, d.user_id, d.staff_id, d.device_id,
	d.device_label, CASE WHEN m.user_id = $2 THEN 255 ELSE s.permissions END,
	d.expires_at, d.last_seen_at, d.revoked_at,
	CASE WHEN m.user_id = $2 THEN 'owner' ELSE s.role END`

func (r *postgresMerchantAccessRepository) CreateDeviceSession(ctx context.Context, input domain.MerchantSessionAuthorization, deviceLabel string, ttl time.Duration) (*domain.MerchantDeviceSession, error) {
	if strings.TrimSpace(input.SessionToken) == "" {
		return nil, errors.New("session token wajib")
	}
	hash := sessionTokenHash(input.SessionToken)
	if ttl <= 0 {
		ttl = 12 * time.Hour
	}
	row := r.db.QueryRowContext(ctx, `
		INSERT INTO merchant_device_sessions
			(merchant_id, branch_id, user_id, staff_id, device_id, device_label, session_token_hash, granted_permissions, expires_at)
		SELECT m.id, b.id, $2, CASE WHEN m.user_id = $2 THEN NULL ELSE s.id END,
		       $4, NULLIF($5, ''), $6,
		       CASE WHEN m.user_id = $2 THEN 255 ELSE s.permissions END,
		       NOW() + $7::interval
		FROM merchants m
		JOIN merchant_branches b ON b.merchant_id = m.id AND b.id = $3 AND b.is_active
		LEFT JOIN merchant_staff s ON s.merchant_id = m.id AND s.user_id = $2 AND s.status = 'active'
		LEFT JOIN merchant_staff_branch_access a ON a.staff_id = s.id AND a.branch_id = b.id
		WHERE m.id = $1 AND (m.user_id = $2 OR a.staff_id IS NOT NULL)
		RETURNING id, merchant_id, branch_id, user_id, staff_id, device_id, device_label,
		          granted_permissions, expires_at, last_seen_at, revoked_at,
		          CASE WHEN (SELECT user_id FROM merchants WHERE id = $1) = $2 THEN 'owner'
		               ELSE (SELECT s2.role FROM merchant_staff s2 WHERE s2.id = merchant_device_sessions.staff_id) END`,
		input.MerchantID, input.UserID, input.BranchID, input.DeviceID, deviceLabel, hash,
		fmt.Sprintf("%d seconds", int(ttl.Seconds())))
	session, err := scanDeviceSession(row, input.SessionToken)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("user tidak memiliki akses ke branch ini")
	}
	if err != nil {
		return nil, fmt.Errorf("create merchant device session: %w", err)
	}
	return session, nil
}

func (r *postgresMerchantAccessRepository) AuthorizeDeviceSession(ctx context.Context, input domain.MerchantSessionAuthorization) (*domain.MerchantDeviceSession, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT `+deviceSessionProjection+`
		FROM merchant_device_sessions d
		JOIN merchants m ON m.id = d.merchant_id
		JOIN merchant_branches b ON b.id = d.branch_id AND b.merchant_id = d.merchant_id
		LEFT JOIN merchant_staff s ON s.id = d.staff_id
		LEFT JOIN merchant_staff_branch_access a ON a.staff_id = s.id AND a.branch_id = d.branch_id
		WHERE d.session_token_hash = $1 AND d.user_id = $2
		  AND (NULLIF($3::text, '') IS NULL OR d.merchant_id = NULLIF($3::text, '')::uuid)
		  AND d.branch_id = $4 AND d.device_id = $5
		  AND d.revoked_at IS NULL AND d.expires_at > NOW() AND b.is_active
		  AND (m.user_id = $2 OR (s.user_id = $2 AND s.status = 'active' AND a.staff_id IS NOT NULL))`,
		sessionTokenHash(input.SessionToken), input.UserID, input.MerchantID, input.BranchID, input.DeviceID)
	session, err := scanDeviceSession(row, "")
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("merchant device session tidak valid, expired, atau sudah dicabut")
	}
	if err != nil {
		return nil, err
	}
	if input.RequiredPermission != 0 && session.GrantedPermissions&input.RequiredPermission != input.RequiredPermission {
		return nil, errors.New("permission tidak cukup untuk operasi ini")
	}
	if _, err := r.db.ExecContext(ctx, `UPDATE merchant_device_sessions SET last_seen_at = NOW() WHERE id = $1`, session.ID); err != nil {
		return nil, err
	}
	return session, nil
}

func (r *postgresMerchantAccessRepository) RevokeDeviceSession(ctx context.Context, merchantID, userID, sessionID string) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE merchant_device_sessions d SET revoked_at = NOW()
		FROM merchants m
		WHERE d.id = $3 AND d.merchant_id = $1 AND (m.user_id = $2 OR d.user_id = $2)
		  AND m.id = d.merchant_id AND d.revoked_at IS NULL`, merchantID, userID, sessionID)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *postgresMerchantAccessRepository) RevokeSessionsForStaff(ctx context.Context, staffID string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE merchant_device_sessions SET revoked_at = NOW() WHERE staff_id = $1 AND revoked_at IS NULL`, staffID)
	return err
}

func (r *postgresMerchantAccessRepository) CreateSecurityApproval(ctx context.Context, approval *domain.MerchantSecurityApproval) error {
	return r.db.QueryRowContext(ctx, `
		INSERT INTO merchant_security_approvals
			(id, merchant_id, requested_by, change_type, idempotency_key, expires_at)
		VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '15 minutes')
		RETURNING expires_at, created_at`, approval.ID, approval.MerchantID, approval.RequestedBy,
		approval.ChangeType, approval.IdempotencyKey).Scan(&approval.ExpiresAt, &approval.CreatedAt)
}

func scanSecurityApproval(row interface{ Scan(...any) error }) (*domain.MerchantSecurityApproval, error) {
	var approval domain.MerchantSecurityApproval
	var approvedBy, reference sql.NullString
	if err := row.Scan(&approval.ID, &approval.MerchantID, &approval.RequestedBy, &approval.ChangeType,
		&approval.IdempotencyKey, &approval.Status, &reference, &approvedBy, &approval.ExpiresAt,
		&approval.CreatedAt, &approval.ApprovedAt); err != nil {
		return nil, err
	}
	if reference.Valid {
		approval.ApprovalReference = reference.String
	}
	if approvedBy.Valid {
		approval.ApprovedBy = &approvedBy.String
	}
	return &approval, nil
}

const securityApprovalColumns = `id, merchant_id, requested_by, change_type, idempotency_key,
	status, approval_reference, approved_by, expires_at, created_at, approved_at`

func (r *postgresMerchantAccessRepository) GetSecurityApproval(ctx context.Context, merchantID, approvalID string) (*domain.MerchantSecurityApproval, error) {
	approval, err := scanSecurityApproval(r.readDB.QueryRowContext(ctx, `
		SELECT `+securityApprovalColumns+` FROM merchant_security_approvals WHERE merchant_id = $1 AND id = $2`, merchantID, approvalID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return approval, err
}

func (r *postgresMerchantAccessRepository) GetSecurityApprovalByKey(ctx context.Context, merchantID, requestedBy, idempotencyKey string) (*domain.MerchantSecurityApproval, error) {
	approval, err := scanSecurityApproval(r.readDB.QueryRowContext(ctx, `
		SELECT `+securityApprovalColumns+` FROM merchant_security_approvals
		WHERE merchant_id = $1 AND requested_by = $2 AND idempotency_key = $3`, merchantID, requestedBy, idempotencyKey))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return approval, err
}

func (r *postgresMerchantAccessRepository) ApproveSecurityApproval(ctx context.Context, merchantID, approvalID, approverID, reference string) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE merchant_security_approvals
		SET status = 'approved', approved_by = $3, approval_reference = $4, approved_at = NOW()
		WHERE merchant_id = $1 AND id = $2 AND status = 'pending' AND expires_at > NOW()
		  AND requested_by <> $3`, merchantID, approvalID, approverID, reference)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count == 0 {
		return errors.New("approval tidak pending, expired, atau approver sama dengan requester")
	}
	return nil
}

func (r *postgresMerchantAccessRepository) ValidateApprovedSecurityApproval(ctx context.Context, merchantID, requestedBy, approvalID, changeType string) error {
	var status string
	var expiresAt time.Time
	err := r.readDB.QueryRowContext(ctx, `
		SELECT status, expires_at FROM merchant_security_approvals
		WHERE id = $1 AND merchant_id = $2 AND requested_by = $3 AND change_type = $4`,
		approvalID, merchantID, requestedBy, changeType).Scan(&status, &expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return errors.New("approval high-risk tidak ditemukan")
	}
	if err != nil {
		return err
	}
	if status != "approved" || !expiresAt.After(time.Now()) {
		return errors.New("approval high-risk belum approved atau sudah expired")
	}
	return nil
}

func nullableText(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}
