package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"tembus/merchant-service/internal/domain"
)

type postgresMerchantEnforcementRepository struct {
	db     *sql.DB
	readDB *sql.DB
}

func NewPostgresMerchantEnforcementRepository(db, readDB *sql.DB) domain.MerchantEnforcementRepository {
	return &postgresMerchantEnforcementRepository{db: db, readDB: readDB}
}

const merchantEnforcementActionColumns = `
	a.id::text, a.merchant_id::text, a.scope,
	a.target_branch_id::text, COALESCE(branch.name, ''),
	a.target_menu_item_id::text, COALESCE(item.nama, ''),
	COALESCE(a.capability, ''), a.reason_category,
	CASE WHEN a.disclosure_level = 'security_restricted'
	     THEN COALESCE(NULLIF(a.merchant_message, ''), 'Hubungi dukungan merchant untuk detail penanganan.')
	     ELSE a.reason_detail END,
	COALESCE(a.merchant_message, ''),
	COALESCE(a.remediation_message, 'Lengkapi perbaikan yang diminta lalu ajukan appeal bila keputusan perlu ditinjau.'),
	a.disclosure_level, a.effective_from, a.effective_until, a.safe_order_policy,
	a.status,
	COALESCE((SELECT COUNT(*)::int FROM orders active_order
	          WHERE merchant_enforcement_order_matches(a, active_order.id)), 0),
	(a.status IN ('scheduled', 'pending_safe_completion', 'active')),
	a.created_by::text, a.revoked_by::text, a.revoked_at, a.created_at, a.updated_at`

func scanMerchantEnforcementAction(row interface{ Scan(...any) error }) (*domain.MerchantEnforcementAction, error) {
	var action domain.MerchantEnforcementAction
	var targetBranchID, targetBranchName, targetItemID, targetItemName, capability sql.NullString
	var merchantMessage, remediationMessage sql.NullString
	var revokedBy sql.NullString
	if err := row.Scan(
		&action.ID, &action.MerchantID, &action.Scope,
		&targetBranchID, &targetBranchName, &targetItemID, &targetItemName,
		&capability, &action.ReasonCategory, &action.ReasonDetail,
		&merchantMessage, &remediationMessage, &action.DisclosureLevel,
		&action.EffectiveFrom, &action.EffectiveUntil, &action.SafeOrderPolicy,
		&action.Status, &action.ActiveOrderCount, &action.AppealEligible,
		&action.CreatedBy, &revokedBy, &action.RevokedAt, &action.CreatedAt, &action.UpdatedAt,
	); err != nil {
		return nil, err
	}
	if targetBranchID.Valid {
		action.TargetBranchID = &targetBranchID.String
	}
	if targetBranchName.Valid {
		action.TargetBranchName = targetBranchName.String
	}
	if targetItemID.Valid {
		action.TargetMenuItemID = &targetItemID.String
	}
	if targetItemName.Valid {
		action.TargetMenuItemName = targetItemName.String
	}
	if capability.Valid {
		action.Capability = capability.String
	}
	if merchantMessage.Valid {
		action.MerchantMessage = merchantMessage.String
	}
	if remediationMessage.Valid {
		action.RemediationMessage = remediationMessage.String
	}
	if revokedBy.Valid {
		action.RevokedBy = &revokedBy.String
	}
	return &action, nil
}

func scanMerchantEnforcementAppeal(row interface{ Scan(...any) error }) (*domain.MerchantEnforcementAppeal, error) {
	var appeal domain.MerchantEnforcementAppeal
	var reviewedBy sql.NullString
	if err := row.Scan(
		&appeal.ID, &appeal.EnforcementActionID, &appeal.MerchantID,
		&appeal.Reason, &appeal.Status, &appeal.ReviewNote,
		&appeal.SubmittedAt, &appeal.ReviewedAt, &reviewedBy,
	); err != nil {
		return nil, err
	}
	if reviewedBy.Valid {
		appeal.ReviewedBy = &reviewedBy.String
	}
	return &appeal, nil
}

func (r *postgresMerchantEnforcementRepository) Refresh(ctx context.Context) error {
	if _, err := r.db.ExecContext(ctx, `SELECT refresh_merchant_enforcement_actions()`); err != nil {
		return fmt.Errorf("refresh merchant enforcement: %w", err)
	}
	return nil
}

func (r *postgresMerchantEnforcementRepository) GetForMerchant(ctx context.Context, merchantID string) (*domain.MerchantEnforcementStatus, error) {
	status := &domain.MerchantEnforcementStatus{
		MerchantID: merchantID,
		Actions:    make([]domain.MerchantEnforcementAction, 0),
		Appeals:    make([]domain.MerchantEnforcementAppeal, 0),
		Policy: map[string]string{
			"new_orders":    "blocked_for_the_enforced_scope",
			"active_orders": "complete_safely_before_full_activation_when_possible",
			"appeal":        "submit_a_reasoned_appeal_for_admin_review",
		},
		ServerTruth: true,
	}
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT `+merchantEnforcementActionColumns+`
		FROM merchant_enforcement_actions a
		LEFT JOIN merchant_branches branch ON branch.id = a.target_branch_id
		LEFT JOIN merchant_menu_items item ON item.id = a.target_menu_item_id
		WHERE a.merchant_id = $1
		  AND a.status IN ('scheduled', 'pending_safe_completion', 'active')
		  AND (a.effective_until IS NULL OR a.effective_until > NOW())
		ORDER BY a.effective_from DESC, a.created_at DESC`, merchantID)
	if err != nil {
		return nil, fmt.Errorf("list merchant enforcement actions: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		action, err := scanMerchantEnforcementAction(rows)
		if err != nil {
			return nil, err
		}
		status.Actions = append(status.Actions, *action)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	appealRows, err := r.readDB.QueryContext(ctx, `
		SELECT id::text, enforcement_action_id::text, merchant_id::text,
		       reason, status, COALESCE(review_note, ''), submitted_at,
		       reviewed_at, reviewed_by::text
		FROM merchant_enforcement_appeals
		WHERE merchant_id = $1
		ORDER BY submitted_at DESC
		LIMIT 50`, merchantID)
	if err != nil {
		return nil, fmt.Errorf("list merchant enforcement appeals: %w", err)
	}
	defer appealRows.Close()
	for appealRows.Next() {
		appeal, err := scanMerchantEnforcementAppeal(appealRows)
		if err != nil {
			return nil, err
		}
		status.Appeals = append(status.Appeals, *appeal)
	}
	return status, appealRows.Err()
}

func (r *postgresMerchantEnforcementRepository) SubmitAppeal(ctx context.Context, merchantID, actionID, reason string) (*domain.MerchantEnforcementAppeal, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin merchant enforcement appeal: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var actionStatus string
	if err := tx.QueryRowContext(ctx, `
		SELECT status
		FROM merchant_enforcement_actions
		WHERE id = $1 AND merchant_id = $2
		  AND status IN ('scheduled', 'pending_safe_completion', 'active')
		  AND (effective_until IS NULL OR effective_until > NOW())
		FOR SHARE`, actionID, merchantID).Scan(&actionStatus); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("enforcement tidak ditemukan atau sudah ditutup")
		}
		return nil, fmt.Errorf("check merchant enforcement appeal target: %w", err)
	}

	appeal, err := scanMerchantEnforcementAppeal(tx.QueryRowContext(ctx, `
		INSERT INTO merchant_enforcement_appeals (enforcement_action_id, merchant_id, reason)
		VALUES ($1, $2, $3)
		RETURNING id::text, enforcement_action_id::text, merchant_id::text,
		          reason, status, COALESCE(review_note, ''), submitted_at,
		          reviewed_at, reviewed_by::text`, actionID, merchantID, reason))
	if err != nil {
		return nil, fmt.Errorf("submit merchant enforcement appeal: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO merchant_enforcement_action_events (enforcement_action_id, event_type, actor_id, metadata)
		VALUES ($1, 'appeal_submitted', (SELECT user_id FROM merchants WHERE id = $2),
		        jsonb_build_object('appeal_id', $3::text, 'source', 'merchant_app'))`, actionID, merchantID, appeal.ID); err != nil {
		return nil, fmt.Errorf("record merchant enforcement appeal event: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit merchant enforcement appeal: %w", err)
	}
	return appeal, nil
}

var _ domain.MerchantEnforcementRepository = (*postgresMerchantEnforcementRepository)(nil)

// Keep the existing merchant repository wiring stable while exposing the
// optional policy overlay through the same concrete PostgreSQL repository.
func (r *postgresMerchantRepository) merchantEnforcementRepository() *postgresMerchantEnforcementRepository {
	return &postgresMerchantEnforcementRepository{db: r.db, readDB: r.readDB}
}

func (r *postgresMerchantRepository) Refresh(ctx context.Context) error {
	return r.merchantEnforcementRepository().Refresh(ctx)
}

func (r *postgresMerchantRepository) GetForMerchant(ctx context.Context, merchantID string) (*domain.MerchantEnforcementStatus, error) {
	return r.merchantEnforcementRepository().GetForMerchant(ctx, merchantID)
}

func (r *postgresMerchantRepository) SubmitAppeal(ctx context.Context, merchantID, actionID, reason string) (*domain.MerchantEnforcementAppeal, error) {
	return r.merchantEnforcementRepository().SubmitAppeal(ctx, merchantID, actionID, reason)
}

var _ domain.MerchantEnforcementRepository = (*postgresMerchantRepository)(nil)
