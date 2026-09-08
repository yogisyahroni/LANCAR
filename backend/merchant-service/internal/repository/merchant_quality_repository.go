package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"tembus/merchant-service/internal/domain"
)

func formatQualityTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}

func scanQualityAppeal(row interface{ Scan(...any) error }) (*domain.MerchantQualityAppeal, error) {
	var appeal domain.MerchantQualityAppeal
	var reviewedBy, reviewNote, reviewedRole sql.NullString
	var reviewedAt sql.NullTime
	var submittedAt time.Time
	if err := row.Scan(
		&appeal.ID, &appeal.MerchantID, &appeal.ScorecardID, &appeal.MetricCode,
		&appeal.Reason, &appeal.Status, &reviewNote, &reviewedBy, &reviewedRole,
		&submittedAt, &reviewedAt,
	); err != nil {
		return nil, err
	}
	appeal.SubmittedAt = formatQualityTime(submittedAt)
	if reviewNote.Valid {
		appeal.ReviewNote = reviewNote.String
	}
	if reviewedBy.Valid {
		appeal.ReviewedBy = reviewedBy.String
	}
	if reviewedRole.Valid {
		appeal.ReviewedRole = reviewedRole.String
	}
	if reviewedAt.Valid {
		value := formatQualityTime(reviewedAt.Time)
		appeal.ReviewedAt = &value
	}
	return &appeal, nil
}

func scanQualityScore(row interface{ Scan(...any) error }) (*domain.MerchantQualityScore, error) {
	var score domain.MerchantQualityScore
	var windowStart, windowEnd, computedAt time.Time
	var scoreValue float64
	var componentsJSON, evidenceJSON []byte
	if err := row.Scan(
		&score.ID, &score.MerchantID, &score.MarketCode, &score.PolicyVersion,
		&score.WindowDays, &windowStart, &windowEnd, &scoreValue, &componentsJSON,
		&evidenceJSON, &computedAt,
	); err != nil {
		return nil, err
	}
	score.WindowStart = formatQualityTime(windowStart)
	score.WindowEnd = formatQualityTime(windowEnd)
	score.ComputedAt = formatQualityTime(computedAt)
	score.Score = scoreValue
	if err := json.Unmarshal(componentsJSON, &score.Components); err != nil {
		return nil, fmt.Errorf("decode merchant quality components: %w", err)
	}
	if err := json.Unmarshal(evidenceJSON, &score.Evidence); err != nil {
		return nil, fmt.Errorf("decode merchant quality evidence: %w", err)
	}
	return &score, nil
}

func (r *postgresReportRepository) QualityScore(ctx context.Context, merchantID string) (*domain.MerchantQualityScore, error) {
	var score *domain.MerchantQualityScore
	row := r.db.QueryRowContext(ctx, `
		WITH selected_policy AS (
			SELECT p.*
			FROM merchant_quality_policies p
			JOIN merchants m ON m.id = $1
			WHERE p.is_active
			  AND p.effective_from <= NOW()
			  AND (p.effective_until IS NULL OR p.effective_until > NOW())
			  AND (p.market_code = m.market_code OR p.market_code = '*')
			ORDER BY CASE WHEN p.market_code = m.market_code THEN 0 ELSE 1 END,
			         p.effective_from DESC, p.created_at DESC
			LIMIT 1
		), computed AS (
			SELECT p.id AS policy_id, p.policy_version, p.window_days,
			       c.market_code, c.score, c.window_start, c.window_end,
			       c.component_scores, c.evidence_counts
			FROM selected_policy p
			CROSS JOIN LATERAL merchant_quality_calculate($1, p.id) c
		)
		INSERT INTO merchant_quality_scorecards (
			merchant_id, market_code, policy_id, scorecard_version,
			window_start, window_end, score, component_scores, evidence_counts
		)
		SELECT $1, c.market_code, c.policy_id, c.policy_version,
		       c.window_start, c.window_end, c.score,
		       c.component_scores, c.evidence_counts
		FROM computed c
		RETURNING id::text, merchant_id::text, market_code, scorecard_version,
		          (evidence_counts->>'window_days')::int, window_start, window_end,
		          score, component_scores, evidence_counts, computed_at`, merchantID)
	var err error
	score, err = scanQualityScore(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("merchant quality policy belum dikonfigurasi")
	}
	if err != nil {
		return nil, fmt.Errorf("create merchant quality scorecard: %w", err)
	}
	if err := r.db.QueryRowContext(ctx, `
		SELECT merchant_quality_is_eligible($1, 'search'),
		       merchant_quality_is_eligible($1, 'ads')`, merchantID).
		Scan(&score.SearchEligible, &score.AdsEligible); err != nil {
		return nil, fmt.Errorf("merchant quality eligibility: %w", err)
	}
	appeal, err := scanQualityAppeal(r.db.QueryRowContext(ctx, `
		SELECT id::text, merchant_id::text, scorecard_id::text, metric_code,
		       reason, status, review_note, reviewed_by::text, reviewed_role,
		       created_at, reviewed_at
		FROM merchant_quality_appeals
		WHERE scorecard_id = $1 AND status IN ('submitted', 'in_review')
		ORDER BY created_at DESC LIMIT 1`, score.ID))
	if err == nil {
		score.OpenAppeal = appeal
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("merchant quality appeal: %w", err)
	}
	return score, nil
}

func (r *postgresReportRepository) SubmitQualityAppeal(ctx context.Context, merchantID, scorecardID, metricCode, reason string) (*domain.MerchantQualityAppeal, error) {
	appeal, err := scanQualityAppeal(r.db.QueryRowContext(ctx, `
		INSERT INTO merchant_quality_appeals (
			merchant_id, scorecard_id, metric_code, reason
		)
		SELECT $1, s.id, $3, $4
		FROM merchant_quality_scorecards s
		WHERE s.id = $2 AND s.merchant_id = $1
		RETURNING id::text, merchant_id::text, scorecard_id::text, metric_code,
		          reason, status, review_note, reviewed_by::text, reviewed_role,
		          created_at, reviewed_at`, merchantID, scorecardID, metricCode, reason))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("scorecard tidak ditemukan atau bukan milik merchant")
	}
	if err != nil {
		return nil, fmt.Errorf("submit merchant quality appeal: %w", err)
	}
	return appeal, nil
}

func (r *postgresReportRepository) ReviewQualityAppeal(ctx context.Context, actorID, actorRole, appealID, status, reviewNote string) (*domain.MerchantQualityAppeal, error) {
	appeal, err := scanQualityAppeal(r.db.QueryRowContext(ctx, `
		UPDATE merchant_quality_appeals
		SET status = $2, review_note = NULLIF($3, ''), reviewed_by = $4,
		    reviewed_role = $5, reviewed_at = NOW(), updated_at = NOW()
		WHERE id = $1 AND status IN ('submitted', 'in_review')
		RETURNING id::text, merchant_id::text, scorecard_id::text, metric_code,
		          reason, status, review_note, reviewed_by::text, reviewed_role,
		          created_at, reviewed_at`, appealID, status, reviewNote, actorID, actorRole))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("appeal tidak ditemukan atau sudah ditutup")
	}
	if err != nil {
		return nil, fmt.Errorf("review merchant quality appeal: %w", err)
	}
	return appeal, nil
}
