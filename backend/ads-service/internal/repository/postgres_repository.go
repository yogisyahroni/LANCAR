package repository

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"tembus/ads-service/internal/domain"
	"tembus/ads-service/internal/service"
)

type PostgresRepository struct{ db *sql.DB }

func NewPostgresRepository(db *sql.DB) *PostgresRepository { return &PostgresRepository{db: db} }

const campaignColumns = `
 id::text, COALESCE(owner_account_id::text, created_by::text, ''), COALESCE(merchant_id::text, ''),
 COALESCE(owner_account_id::text, ''), COALESCE(audience_rules->>'market_code', audience_rules->'market_codes'->>0, ''),
 COALESCE(city_code, ''), name, COALESCE(description, ''), COALESCE(objective, 'visibility'),
 placement_rules, audience_rules, bid_strategy, total_budget_minor, daily_budget_minor,
 spent_minor, currency_code, billing_model, starts_at, ends_at, schedule_timezone,
 daypart_rules, creative_headline, COALESCE(creative_body, ''), COALESCE(creative_image_url, ''),
 COALESCE(creative_alt_text, ''), status, moderation_status, campaign_version,
 attribution_model, attribution_window_minutes, attribution_version,
 COALESCE(rejection_reason, ''), COALESCE(suspension_reason, ''), created_at, updated_at`

func scanCampaign(row interface{ Scan(...any) error }) (*domain.Campaign, error) {
	var c domain.Campaign
	var placementJSON, audienceJSON, bidJSON, daypartJSON []byte
	if err := row.Scan(
		&c.ID, &c.OwnerID, &c.MerchantID, &c.BrandAccountID, &c.MarketCode, &c.CityCode, &c.Name, &c.Description,
		&c.Objective, &placementJSON, &audienceJSON, &bidJSON, &c.Budget.TotalMinor, &c.Budget.DailyMinor,
		&c.Budget.SpentMinor, &c.Budget.Currency, &c.Budget.BillingModel, &c.StartsAt, &c.EndsAt,
		&c.Timezone, &daypartJSON, &c.Creative.Headline, &c.Creative.Body, &c.Creative.ImageURL,
		&c.Creative.AltText, &c.Status, &c.PolicyStatus, &c.Version, &c.Attribution.Model,
		&c.Attribution.WindowMinutes, &c.Attribution.Version, &c.RejectionReason, &c.SuspensionReason,
		&c.CreatedAt, &c.UpdatedAt,
	); err != nil {
		return nil, err
	}
	_ = json.Unmarshal(placementJSON, &c.Placements)
	_ = json.Unmarshal(audienceJSON, &c.Audience)
	_ = json.Unmarshal(bidJSON, &c.Bid)
	_ = json.Unmarshal(daypartJSON, &c.Daypart)
	return &c, nil
}

func (r *PostgresRepository) CreateCampaign(ctx context.Context, c domain.Campaign, idem, fingerprint, actorID string) (*domain.Campaign, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	var existingID string
	var existingFingerprint string
	err = tx.QueryRowContext(ctx, `SELECT campaign_id::text, request_fingerprint FROM ads_campaign_revisions WHERE idempotency_key=$1 FOR UPDATE`, idem).Scan(&existingID, &existingFingerprint)
	if err == nil {
		if existingFingerprint != fingerprint {
			return nil, errors.New("idempotency key already used for a different campaign payload")
		}
		return scanCampaign(tx.QueryRowContext(ctx, `SELECT `+campaignColumns+` FROM promo_campaigns WHERE id=$1::uuid AND product_type='ads'`, existingID))
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("check campaign idempotency: %w", err)
	}
	if len(c.Audience.MarketCodes) == 0 && strings.TrimSpace(c.MarketCode) != "" {
		c.Audience.MarketCodes = []string{c.MarketCode}
	}
	branchIDs := c.BranchIDs
	if branchIDs == nil {
		branchIDs = []string{}
	}
	audience, _ := json.Marshal(c.Audience)
	placements, _ := json.Marshal(c.Placements)
	bid, _ := json.Marshal(c.Bid)
	daypart, _ := json.Marshal(c.Daypart)
	code := "ADS-" + strings.ToUpper(uuid.NewString()[:8])
	_, err = tx.ExecContext(ctx, `
		INSERT INTO promo_campaigns (
			id, code, name, description, status, product_type, merchant_id, owner_account_id, city_code, branch_ids,
			discount_type, discount_value_idr, discount_percent, max_discount_idr, min_order_idr,
			service_codes, component_scope, stacking_key, total_budget_idr, daily_budget_idr,
			total_budget_minor, daily_budget_minor, spent_minor, currency_code, billing_model,
			starts_at, ends_at, audience_rules, eligibility_rules, placement_rules, bid_strategy,
			schedule_timezone, daypart_rules, objective, creative_headline, creative_body,
			creative_image_url, creative_alt_text, moderation_status, campaign_version,
			attribution_model, attribution_window_minutes, attribution_version, created_by, updated_by
		) VALUES (
			$1, $2, $3, $4, 'draft', 'ads', COALESCE(NULLIF($5, '')::uuid, (SELECT m.id FROM merchants m WHERE m.user_id=$6::uuid ORDER BY m.created_at LIMIT 1)), $6::uuid, NULLIF($7, ''), $8,
			'shipping_discount', 0, 0, 0, 0, $9, 'shipping', 'ads', CAST($10 AS integer), CAST($11 AS integer),
			CAST($10 AS bigint), CAST($11 AS bigint), 0, $12, $13, $14, $15, $16::jsonb, '{}'::jsonb, $17::jsonb, $18::jsonb,
			$19, $20::jsonb, $21, $22, $23, $24, $25, 'pending', 1,
			$26, $27, $28, $6::uuid, $6::uuid
		)`, c.ID, code, c.Name, c.Description, c.MerchantID, actorID, c.CityCode, pq.Array(branchIDs), pq.Array([]string{"food_delivery"}), c.Budget.TotalMinor, c.Budget.DailyMinor,
		c.Budget.Currency, c.Budget.BillingModel, c.StartsAt, c.EndsAt, audience, placements, bid, c.Timezone, daypart,
		c.Objective, c.Creative.Headline, c.Creative.Body, c.Creative.ImageURL, c.Creative.AltText,
		c.Attribution.Model, c.Attribution.WindowMinutes, c.Attribution.Version)
	if err != nil {
		return nil, fmt.Errorf("create canonical Ads campaign: %w", err)
	}
	snapshot, _ := json.Marshal(c)
	if _, err := tx.ExecContext(ctx, `INSERT INTO ads_campaign_revisions(campaign_id,campaign_version,actor_id,action,request_fingerprint,idempotency_key,snapshot) VALUES($1,$2,$3,'created',$4,$5,$6::jsonb)`, c.ID, c.Version, actorID, fingerprint, idem, snapshot); err != nil {
		return nil, fmt.Errorf("record campaign revision: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO ads_policy_audit_events(actor_id,action,scope,reason,after_value) VALUES($1,'campaign_created','campaign',$2,$3::jsonb)`, actorID, "merchant campaign created", snapshot); err != nil {
		return nil, fmt.Errorf("record Ads audit: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return scanCampaign(r.db.QueryRowContext(ctx, `SELECT `+campaignColumns+` FROM promo_campaigns WHERE id=$1::uuid AND product_type='ads'`, c.ID))
}

func (r *PostgresRepository) ListCampaigns(ctx context.Context, ownerID string, limit, offset int) ([]domain.Campaign, int, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+campaignColumns+` FROM promo_campaigns WHERE product_type='ads' AND (owner_account_id=$1::uuid OR created_by=$1::uuid) ORDER BY created_at DESC LIMIT $2 OFFSET $3`, ownerID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	result := []domain.Campaign{}
	for rows.Next() {
		c, err := scanCampaign(rows)
		if err != nil {
			return nil, 0, err
		}
		result = append(result, *c)
	}
	var total int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM promo_campaigns WHERE product_type='ads' AND (owner_account_id=$1::uuid OR created_by=$1::uuid)`, ownerID).Scan(&total); err != nil {
		return nil, 0, err
	}
	return result, total, rows.Err()
}

func (r *PostgresRepository) GetCampaign(ctx context.Context, ownerID, id string) (*domain.Campaign, error) {
	return scanCampaign(r.db.QueryRowContext(ctx, `SELECT `+campaignColumns+` FROM promo_campaigns WHERE id=$2::uuid AND product_type='ads' AND (owner_account_id=$1::uuid OR created_by=$1::uuid)`, ownerID, id))
}

func (r *PostgresRepository) ListAllCampaigns(ctx context.Context, limit, offset int) ([]domain.Campaign, int, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+campaignColumns+` FROM promo_campaigns WHERE product_type='ads' ORDER BY created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	result := []domain.Campaign{}
	for rows.Next() {
		c, err := scanCampaign(rows)
		if err != nil {
			return nil, 0, err
		}
		result = append(result, *c)
	}
	var total int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM promo_campaigns WHERE product_type='ads'`).Scan(&total); err != nil {
		return nil, 0, err
	}
	return result, total, rows.Err()
}

func (r *PostgresRepository) TransitionCampaign(ctx context.Context, ownerID, id string, from, to domain.CampaignStatus, reason, actorID string) (*domain.Campaign, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	var current int
	var nextJSON []byte
	err = tx.QueryRowContext(ctx, `UPDATE promo_campaigns SET status=CAST($1 AS varchar), campaign_version=campaign_version+1, updated_by=$2::uuid, updated_at=NOW(), paused_at=CASE WHEN CAST($1 AS varchar)='paused' THEN NOW() ELSE paused_at END WHERE id=$3::uuid AND product_type='ads' AND (owner_account_id=$2::uuid OR created_by=$2::uuid) AND status=CAST($4 AS varchar) RETURNING campaign_version`, string(to), actorID, id, string(from)).Scan(&current)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("campaign owner or lifecycle state mismatch")
	}
	if err != nil {
		return nil, err
	}
	_ = tx.QueryRowContext(ctx, `SELECT to_jsonb(p) FROM promo_campaigns p WHERE p.id=$1::uuid`, id).Scan(&nextJSON)
	if _, err := tx.ExecContext(ctx, `INSERT INTO ads_campaign_revisions(campaign_id,campaign_version,actor_id,action,reason,idempotency_key,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`, id, current, actorID, "transition_"+string(to), reason, "transition:"+id+":"+fmt.Sprint(current), nextJSON); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO ads_policy_audit_events(actor_id,action,scope,reason,after_value) VALUES($1,$2,'campaign',$3,$4::jsonb)`, actorID, "campaign_status_changed", reason, nextJSON); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetCampaign(ctx, ownerID, id)
}

func (r *PostgresRepository) CloneCampaign(ctx context.Context, ownerID, id, idem, actorID string) (*domain.Campaign, error) {
	original, err := r.GetCampaign(ctx, ownerID, id)
	if err != nil {
		return nil, err
	}
	if original == nil {
		return nil, errors.New("campaign not found")
	}
	request := domain.CreateCampaignRequest{OwnerID: ownerID, MerchantID: original.MerchantID, BrandAccountID: original.BrandAccountID, MarketCode: original.MarketCode, CityCode: original.CityCode, BranchIDs: original.BranchIDs, Name: original.Name + " (copy)", Objective: original.Objective, Placements: original.Placements, Audience: original.Audience, Budget: original.Budget, Bid: original.Bid, StartsAt: original.StartsAt, EndsAt: original.EndsAt, Timezone: original.Timezone, Daypart: original.Daypart, Creative: original.Creative, Attribution: original.Attribution, IdempotencyKey: idem}
	request.Budget.SpentMinor = 0
	return service.NewCampaignService(r).Create(ctx, actorID, request)
}

func (r *PostgresRepository) AdminSuspend(ctx context.Context, id, actorID, reason, scope string, expiresAt *time.Time) error {
	if strings.TrimSpace(reason) == "" {
		return errors.New("suspension reason is required")
	}
	result, err := r.db.ExecContext(ctx, `UPDATE promo_campaigns SET status='suspended', suspension_reason=$1, updated_by=$2::uuid, updated_at=NOW() WHERE id=$3::uuid AND product_type='ads'`, reason, actorID, id)
	if err != nil {
		return err
	}
	affected, _ := result.RowsAffected()
	if affected != 1 {
		return errors.New("campaign not found")
	}
	payload := map[string]any{"campaign_id": id, "scope": scope}
	if expiresAt != nil {
		payload["expires_at"] = expiresAt.UTC().Format(time.RFC3339)
	}
	data, _ := json.Marshal(payload)
	_, err = r.db.ExecContext(ctx, `INSERT INTO ads_policy_audit_events(actor_id,action,scope,reason,after_value,expires_at) VALUES($1,'campaign_suspended',$2,$3,$4::jsonb,$5)`, actorID, scope, reason, data, expiresAt)
	return err
}

func (r *PostgresRepository) AdminModerate(ctx context.Context, id, actorID, status, reason string) error {
	if status != "approved" && status != "rejected" && status != "pending" {
		return errors.New("invalid moderation status")
	}
	result, err := r.db.ExecContext(ctx, `UPDATE promo_campaigns SET moderation_status=CAST($1 AS varchar), rejection_reason=CASE WHEN CAST($1 AS varchar)='rejected' THEN $2 ELSE rejection_reason END, approved_by=CASE WHEN CAST($1 AS varchar)='approved' THEN $3::uuid ELSE approved_by END, approved_at=CASE WHEN CAST($1 AS varchar)='approved' THEN NOW() ELSE approved_at END, updated_by=$3::uuid, updated_at=NOW() WHERE id=$4::uuid AND product_type='ads'`, status, reason, actorID, id)
	if err != nil {
		return err
	}
	affected, _ := result.RowsAffected()
	if affected != 1 {
		return errors.New("campaign not found")
	}
	return r.AdminAudit(ctx, actorID, "creative_moderation_"+status, reason, map[string]any{"campaign_id": id})
}

func (r *PostgresRepository) AdminAudit(ctx context.Context, actorID, action, reason string, payload map[string]any) error {
	data, _ := json.Marshal(payload)
	_, err := r.db.ExecContext(ctx, `INSERT INTO ads_policy_audit_events(actor_id,action,scope,reason,after_value) VALUES($1,$2,'admin',$3,$4::jsonb)`, actorID, action, reason, data)
	return err
}

func (r *PostgresRepository) ListAudit(ctx context.Context, limit int) ([]map[string]any, error) {
	if limit < 1 || limit > 200 {
		limit = 100
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT id::text, COALESCE(actor_id::text, ''), action, scope, reason,
		       before_value, after_value, expires_at, created_at
		FROM ads_policy_audit_events
		ORDER BY created_at DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var id, actor, action, scope, reason string
		var before, after []byte
		var expiresAt, createdAt sql.NullTime
		if err := rows.Scan(&id, &actor, &action, &scope, &reason, &before, &after, &expiresAt, &createdAt); err != nil {
			return nil, err
		}
		item := map[string]any{"id": id, "actor_id": actor, "action": action, "scope": scope, "reason": reason}
		var beforeValue, afterValue map[string]any
		_ = json.Unmarshal(before, &beforeValue)
		_ = json.Unmarshal(after, &afterValue)
		item["before_value"] = beforeValue
		item["after_value"] = afterValue
		if expiresAt.Valid {
			item["expires_at"] = expiresAt.Time.UTC().Format(time.RFC3339)
		}
		if createdAt.Valid {
			item["created_at"] = createdAt.Time.UTC().Format(time.RFC3339)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) AdminBillingAdjustment(ctx context.Context, campaignID, actorID, direction string, amount int64, reason, idempotencyKey string) error {
	direction = strings.ToLower(strings.TrimSpace(direction))
	if direction != "credit" && direction != "debit" {
		return errors.New("billing adjustment direction must be credit or debit")
	}
	if amount <= 0 {
		return errors.New("billing adjustment amount must be positive")
	}
	if strings.TrimSpace(reason) == "" {
		return errors.New("billing adjustment reason is required")
	}
	if strings.TrimSpace(idempotencyKey) == "" {
		return errors.New("billing adjustment idempotency key is required")
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	var existing string
	if err := tx.QueryRowContext(ctx, `SELECT id::text FROM ads_billing_events WHERE idempotency_key=$1 FOR UPDATE`, idempotencyKey).Scan(&existing); err == nil {
		return nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	var total, spent int64
	var currency, billing string
	var version int
	if err := tx.QueryRowContext(ctx, `SELECT total_budget_minor, spent_minor, currency_code, billing_model, campaign_version FROM promo_campaigns WHERE id=$1::uuid AND product_type='ads' FOR UPDATE`, campaignID).Scan(&total, &spent, &currency, &billing, &version); err != nil {
		return err
	}
	if direction == "credit" && amount > spent {
		return errors.New("credit exceeds charged campaign spend")
	}
	if direction == "debit" && spent+amount > total {
		return errors.New("debit exceeds campaign hard cap")
	}
	eventType := "reversal"
	status := "credited"
	if direction == "debit" {
		eventType = "credit"
		status = "charged"
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO ads_billing_events(campaign_id,account_id,placement,event_type,delivery_token_hash,cost_minor,currency_code,billing_model,campaign_version,status,reason,idempotency_key)
		SELECT id, owner_account_id, 'admin_adjustment', $2, $3, $4, currency_code, billing_model, campaign_version, $5, $6, $7
		FROM promo_campaigns WHERE id=$1::uuid AND product_type='ads'`, campaignID, eventType, billingHash(idempotencyKey), amount, status, reason, idempotencyKey)
	if err != nil {
		return err
	}
	delta := -amount
	if direction == "debit" {
		delta = amount
	}
	_, err = tx.ExecContext(ctx, `UPDATE promo_campaigns SET spent_minor=spent_minor+$1, status=CASE WHEN spent_minor+$1 >= total_budget_minor THEN 'budget_exhausted' WHEN status='budget_exhausted' AND spent_minor+$1 < total_budget_minor THEN 'active' ELSE status END, updated_by=$2::uuid, updated_at=NOW() WHERE id=$3::uuid AND product_type='ads'`, delta, actorID, campaignID)
	if err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]any{"campaign_id": campaignID, "direction": direction, "amount_minor": amount, "currency": currency, "idempotency_key": idempotencyKey})
	if _, err := tx.ExecContext(ctx, `INSERT INTO ads_policy_audit_events(actor_id,action,scope,reason,after_value) VALUES($1,'billing_adjustment','campaign',$2,$3::jsonb)`, actorID, reason, payload); err != nil {
		return err
	}
	return tx.Commit()
}

func billingHash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func (r *PostgresRepository) MerchantPerformance(ctx context.Context, ownerID string) (domain.Performance, error) {
	var p domain.Performance
	p.AttributionModel = "last_touch"
	p.AttributionVersion = "ads-last-touch-v1"
	err := r.db.QueryRowContext(ctx, `
		SELECT COALESCE(MAX(p.attribution_window_minutes),10080),
		       COUNT(*) FILTER (WHERE e.event_type='impression'),
		       COUNT(*) FILTER (WHERE e.event_type='viewable_impression'),
		       COUNT(*) FILTER (WHERE e.event_type='click'),
		       COUNT(*) FILTER (WHERE e.event_type='conversion' AND COALESCE(o.status,'') NOT IN ('cancelled','canceled','refunded','failed','rejected')),
		       COALESCE(SUM(CASE WHEN e.status='charged' AND e.event_type <> 'conversion' THEN e.cost_minor ELSE 0 END),0),
		       COALESCE(SUM(CASE WHEN e.status='charged' AND e.event_type='conversion' AND COALESCE(o.status,'') NOT IN ('cancelled','canceled','refunded','failed','rejected') THEN o.total_price_idr ELSE 0 END),0)
		FROM ads_billing_events e
		JOIN promo_campaigns p ON p.id=e.campaign_id
		LEFT JOIN orders o ON o.id=e.order_id
		WHERE p.product_type='ads' AND (p.owner_account_id=$1::uuid OR p.created_by=$1::uuid)`, ownerID).Scan(&p.AttributionWindowMinutes, &p.Impressions, &p.ViewableImpressions, &p.Clicks, &p.Orders, &p.SpendMinor, &p.AttributedRevenueMinor)
	return p, err
}

func (r *PostgresRepository) EligibleCampaigns(ctx context.Context, placement, market string) ([]domain.Campaign, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+campaignColumns+` FROM promo_campaigns p WHERE p.product_type='ads' AND p.status='active' AND p.moderation_status='approved' AND p.starts_at <= NOW() AND p.ends_at > NOW() AND p.spent_minor < p.total_budget_minor AND (jsonb_array_length(p.placement_rules)=0 OR p.placement_rules ? $1) AND (COALESCE(p.audience_rules->'market_codes','[]'::jsonb) = '[]'::jsonb OR p.audience_rules->'market_codes' ? $2) AND EXISTS (SELECT 1 FROM merchants m WHERE m.id=p.merchant_id AND m.onboarding_status='ACTIVE' AND m.verification_status='approved' AND m.is_open=TRUE AND m.operating_state IN ('open','busy') AND lower(m.market_code)=lower($2)) ORDER BY p.campaign_version DESC LIMIT 100`, placement, market)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []domain.Campaign{}
	for rows.Next() {
		c, err := scanCampaign(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, *c)
	}
	return result, rows.Err()
}

func (r *PostgresRepository) SaveDeliveryContext(ctx context.Context, claims domain.DeliveryTokenClaims, tokenHash string) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO ads_delivery_contexts(campaign_id,creative_id,placement,campaign_version,request_hash,token_hash,selected_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(token_hash) DO NOTHING`, claims.CampaignID, claims.CreativeID, claims.Placement, claims.CampaignVer, claims.RequestHash, tokenHash, claims.SelectedAt, claims.ExpiresAt)
	return err
}

func (r *PostgresRepository) RecordBillableEvent(ctx context.Context, event domain.AdEvent) (bool, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()
	var existingStatus string
	err = tx.QueryRowContext(ctx, `SELECT status FROM ads_billing_events WHERE idempotency_key=$1 FOR UPDATE`, event.IdempotencyKey).Scan(&existingStatus)
	if err == nil {
		return false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}
	var total, daily, spent int64
	var timezone, currency, billing string
	var version int
	err = tx.QueryRowContext(ctx, `SELECT total_budget_minor,daily_budget_minor,spent_minor,schedule_timezone,currency_code,billing_model,campaign_version FROM promo_campaigns WHERE id=$1::uuid AND product_type='ads' AND status='active' AND starts_at <= NOW() AND ends_at > NOW() FOR UPDATE`, event.CampaignID).Scan(&total, &daily, &spent, &timezone, &currency, &billing, &version)
	if errors.Is(err, sql.ErrNoRows) {
		return false, errors.New("campaign is not currently billable")
	}
	if err != nil {
		return false, err
	}
	var dailySpent int64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(cost_minor),0) FROM ads_billing_events WHERE campaign_id=$1::uuid AND status='charged' AND occurred_at AT TIME ZONE $2 = DATE_TRUNC('day', NOW() AT TIME ZONE $2)`, event.CampaignID, timezone).Scan(&dailySpent); err != nil {
		return false, err
	}
	if currency != event.Currency {
		return false, errors.New("currency mismatch; locale is not a currency source")
	}
	if event.CostMinor > 0 && (spent+event.CostMinor > total || dailySpent+event.CostMinor > daily) {
		_, _ = tx.ExecContext(ctx, `UPDATE promo_campaigns SET status='budget_exhausted', updated_at=NOW() WHERE id=$1::uuid AND status='active'`, event.CampaignID)
		_, _ = tx.ExecContext(ctx, `INSERT INTO ads_billing_events(campaign_id,account_id,placement,event_type,delivery_token_hash,actor_hash,session_hash,cost_minor,currency_code,billing_model,campaign_version,attribution_window_minutes,status,reason,idempotency_key) SELECT $1,owner_account_id,$2,$3,$4,$5,$6,$7,$8,$9,$10,attribution_window_minutes,'rejected','budget_exhausted',$11 FROM promo_campaigns WHERE id=$1::uuid`, event.CampaignID, event.Placement, event.EventType, event.TokenHash, event.UserHash, event.SessionHash, event.CostMinor, event.Currency, billing, version, event.IdempotencyKey)
		return false, service.ErrBudgetExhausted
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO ads_billing_events(campaign_id,account_id,placement,event_type,delivery_token_hash,actor_hash,session_hash,cost_minor,currency_code,billing_model,campaign_version,attribution_model,attribution_version,attribution_window_minutes,status,idempotency_key,occurred_at) SELECT $1,owner_account_id,$2,$3,$4,$5,$6,$7,$8,$9,$10,attribution_model,attribution_version,attribution_window_minutes,'charged',$11,$12 FROM promo_campaigns WHERE id=$1::uuid`, event.CampaignID, event.Placement, event.EventType, event.TokenHash, event.UserHash, event.SessionHash, event.CostMinor, event.Currency, billing, version, event.IdempotencyKey, event.CreatedAt); err != nil {
		return false, err
	}
	if event.CostMinor > 0 {
		if _, err := tx.ExecContext(ctx, `UPDATE promo_campaigns SET spent_minor=spent_minor+$1, updated_at=NOW(), status=CASE WHEN spent_minor+$1 >= total_budget_minor THEN 'budget_exhausted' ELSE status END WHERE id=$2::uuid`, event.CostMinor, event.CampaignID); err != nil {
			return false, err
		}
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}

// RecordServerConversion joins an authoritative order to the latest charged
// click inside the immutable click-time attribution window. It never accepts
// client revenue, conversion flags or client-selected billing values.
func (r *PostgresRepository) RecordServerConversion(ctx context.Context, campaignID, orderID, idempotencyKey string) (bool, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()
	var existing string
	if err := tx.QueryRowContext(ctx, `SELECT id::text FROM ads_billing_events WHERE idempotency_key=$1 FOR UPDATE`, idempotencyKey).Scan(&existing); err == nil {
		return false, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}
	var orderStatus string
	var orderCreated time.Time
	var orderTotal int64
	if err := tx.QueryRowContext(ctx, `SELECT status, created_at, total_price_idr FROM orders WHERE id=$1::uuid FOR SHARE`, orderID).Scan(&orderStatus, &orderCreated, &orderTotal); err != nil {
		return false, errors.New("authoritative order was not found")
	}
	switch strings.ToLower(strings.TrimSpace(orderStatus)) {
	case "paid", "preparing", "ready", "ready_for_pickup", "picked_up", "in_transit", "delivered", "completed":
	default:
		return false, errors.New("order is not in an attributable state")
	}
	if orderTotal < 0 {
		return false, errors.New("authoritative order total is invalid")
	}
	var clickID, placement, tokenHash, currency, billing, attributionModel, attributionVersion string
	var campaignVersion, attributionWindow int
	var clickedAt time.Time
	if err := tx.QueryRowContext(ctx, `
		SELECT e.id::text, e.placement, e.delivery_token_hash, e.currency_code,
		       e.billing_model, e.campaign_version, e.attribution_model,
		       e.attribution_version, e.attribution_window_minutes, e.occurred_at
		FROM ads_billing_events e
		WHERE e.campaign_id=$1::uuid
		  AND e.event_type='click' AND e.status='charged'
		  AND e.occurred_at <= $2
		  AND $2 <= e.occurred_at + (e.attribution_window_minutes * INTERVAL '1 minute')
		ORDER BY e.occurred_at DESC
		LIMIT 1 FOR UPDATE`, campaignID, orderCreated).Scan(&clickID, &placement, &tokenHash, &currency, &billing, &campaignVersion, &attributionModel, &attributionVersion, &attributionWindow, &clickedAt); err != nil {
		return false, errors.New("no charged click is eligible for this order attribution")
	}
	var alreadyAttributed string
	if err := tx.QueryRowContext(ctx, `SELECT id::text FROM ads_billing_events WHERE order_id=$1::uuid AND event_type='conversion' AND status='charged' FOR UPDATE`, orderID).Scan(&alreadyAttributed); err == nil {
		return false, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}
	metadata, _ := json.Marshal(map[string]any{
		"source":                     "authoritative_order_event",
		"order_status":               orderStatus,
		"order_total_minor":          orderTotal,
		"click_event_id":             clickID,
		"clicked_at":                 clickedAt.UTC().Format(time.RFC3339),
		"attribution_window_minutes": attributionWindow,
	})
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO ads_billing_events(
			campaign_id, account_id, placement, event_type, delivery_token_hash,
			cost_minor, currency_code, billing_model, campaign_version,
			attribution_model, attribution_version, attribution_window_minutes,
			status, reason, idempotency_key, order_id, occurred_at, metadata
		)
		SELECT $1::uuid, p.owner_account_id, $2, 'conversion', $3, 0, $4,
		       $5, $6, $7, $8, $9, 'charged', 'server_order_join', $10,
		       $11::uuid, $12, $13::jsonb
		FROM promo_campaigns p
		WHERE p.id=$1::uuid AND p.product_type='ads'`, campaignID, placement, tokenHash, currency, billing, campaignVersion, attributionModel, attributionVersion, attributionWindow, idempotencyKey, orderID, orderCreated, metadata); err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}

func (r *PostgresRepository) ReleaseSpend(ctx context.Context, eventID, reason string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	var campaignID, placement, currency, model, token string
	var cost int64
	var version int
	if err := tx.QueryRowContext(ctx, `SELECT campaign_id::text,placement,currency_code,billing_model,delivery_token_hash,cost_minor,campaign_version FROM ads_billing_events WHERE idempotency_key=$1 AND status='charged' FOR UPDATE`, eventID).Scan(&campaignID, &placement, &currency, &model, &token, &cost, &version); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO ads_billing_events(campaign_id,account_id,placement,event_type,delivery_token_hash,cost_minor,currency_code,billing_model,campaign_version,status,reason,idempotency_key) SELECT $1,owner_account_id,$2,'reversal',$3,$4,$5,$6,$7,'credited',$8,$9 FROM promo_campaigns WHERE id=$1::uuid ON CONFLICT DO NOTHING`, campaignID, placement, token, cost, currency, model, version, reason, "credit:"+eventID)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE promo_campaigns SET spent_minor=GREATEST(0,spent_minor-$1), status=CASE WHEN status='budget_exhausted' THEN 'active' ELSE status END, updated_at=NOW() WHERE id=$2::uuid`, cost, campaignID)
	if err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return nil
}
