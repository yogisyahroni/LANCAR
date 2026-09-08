package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"tembus/merchant-service/internal/domain"
)

type postgresMerchantAdsRepository struct {
	writeDB *sql.DB
	readDB  *sql.DB
}

func NewPostgresMerchantAdsRepository(writeDB, readDB *sql.DB) domain.MerchantAdsRepository {
	return &postgresMerchantAdsRepository{writeDB: writeDB, readDB: readDB}
}

const merchantAdSelect = `
	p.id::text, p.merchant_id::text, p.product_type, p.name,
	COALESCE(p.description, ''), p.status,
	COALESCE(p.creative_headline, ''), COALESCE(p.creative_body, ''),
	COALESCE(p.creative_image_url, ''), p.total_budget_idr, p.daily_budget_idr,
	p.starts_at, p.ends_at,
	COALESCE(COUNT(e.id) FILTER (WHERE e.event_type = 'impression'), 0),
	COALESCE(COUNT(e.id) FILTER (WHERE e.event_type = 'click'), 0),
	COALESCE(COUNT(e.id) FILTER (WHERE e.event_type = 'order'), 0),
	COALESCE(SUM(o.total_price_idr) FILTER (WHERE e.event_type = 'order' AND o.status = 'delivered'), 0),
	COALESCE((
		SELECT SUM(ap.amount_idr)
		FROM merchant_ad_purchases ap
		WHERE ap.campaign_id = p.id AND ap.status = 'charged'
	), 0),
	p.created_at`

func scanMerchantAd(row interface{ Scan(...any) error }) (*domain.MerchantAd, error) {
	var ad domain.MerchantAd
	if err := row.Scan(
		&ad.ID, &ad.MerchantID, &ad.ProductType, &ad.Name, &ad.Description,
		&ad.Status, &ad.CreativeHeadline, &ad.CreativeBody, &ad.CreativeImageURL,
		&ad.TotalBudgetIDR, &ad.DailyBudgetIDR, &ad.StartsAt, &ad.EndsAt,
		&ad.Impressions, &ad.Clicks, &ad.AttributedOrders, &ad.AttributedRevenue,
		&ad.ChargedAmountIDR, &ad.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &ad, nil
}

func (r *postgresMerchantAdsRepository) Create(ctx context.Context, ad *domain.MerchantAd, idempotencyKey, requestFingerprint, actorID string) (*domain.MerchantAd, error) {
	tx, err := r.writeDB.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin Ads purchase: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var existingCampaignID, existingFingerprint string
	err = tx.QueryRowContext(ctx, `
		SELECT campaign_id::text, request_fingerprint
		FROM merchant_ad_purchases
		WHERE merchant_id = $1 AND idempotency_key = $2
		FOR UPDATE`, ad.MerchantID, idempotencyKey).Scan(&existingCampaignID, &existingFingerprint)
	if err == nil {
		if strings.TrimSpace(existingFingerprint) != requestFingerprint {
			return nil, errors.New("idempotency key sudah dipakai untuk payload Ads berbeda")
		}
		return scanMerchantAd(tx.QueryRowContext(ctx, `
			SELECT `+merchantAdSelect+`
			FROM promo_campaigns p
			LEFT JOIN food_discovery_ad_events e ON e.campaign_id = p.id
			LEFT JOIN orders o ON o.id = e.order_id
			WHERE p.id = $1::uuid AND p.merchant_id = $2::uuid
			GROUP BY p.id`, existingCampaignID, ad.MerchantID))
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("check Ads idempotency: %w", err)
	}

	// Ads are prepaid from the merchant's existing statement balance. Lock the
	// merchant row so concurrent purchases cannot spend the same balance twice.
	var merchantRow string
	if err := tx.QueryRowContext(ctx, `SELECT id::text FROM merchants WHERE id = $1 FOR UPDATE`, ad.MerchantID).Scan(&merchantRow); err != nil {
		return nil, fmt.Errorf("lock merchant balance: %w", err)
	}
	var availableBalance int64
	if err := tx.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_minor ELSE -amount_minor END), 0)
		FROM merchant_statement_entries
		WHERE merchant_id = $1 AND affects_balance = TRUE`, ad.MerchantID).Scan(&availableBalance); err != nil {
		return nil, fmt.Errorf("read merchant Ads balance: %w", err)
	}
	if availableBalance < ad.TotalBudgetIDR {
		return nil, fmt.Errorf("saldo merchant tidak cukup untuk membeli Ads (tersedia %d, dibutuhkan %d)", availableBalance, ad.TotalBudgetIDR)
	}

	ad.ID = uuid.NewString()
	code := "ADS-" + strings.ToUpper(uuid.NewString()[:8])
	if ad.StartsAt.After(time.Now()) {
		ad.Status = "scheduled"
	} else if ad.Status == "" {
		ad.Status = "active"
	}
	if ad.CreatedAt.IsZero() {
		ad.CreatedAt = time.Now().UTC()
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO promo_campaigns (
			id, code, name, description, status, product_type, merchant_id,
			discount_type, discount_value_idr, discount_percent, max_discount_idr,
			min_order_idr, service_codes, component_scope, stacking_key,
			total_budget_idr, daily_budget_idr, starts_at, ends_at,
			audience_rules, eligibility_rules, creative_headline, creative_body,
			creative_image_url, published_by, published_at, created_by, updated_by
		) VALUES (
			$1, $2, $3, NULLIF($4, ''), $5, 'ads', $6,
			'shipping_discount', 0, 0, 0, 0, $7, 'shipping', 'food_ads',
			$8, $9, $10, $11,
			jsonb_build_object('placement', 'food_discovery', 'merchant_id', $6::uuid::text),
			jsonb_build_object('product', 'merchant_food_ads'), $12, NULLIF($13, ''),
			NULLIF($14, ''), $15, NOW(), $15, $15
		)`, ad.ID, code, ad.Name, ad.Description, ad.Status, ad.MerchantID,
		pq.Array([]string{"food_delivery"}), ad.TotalBudgetIDR, ad.DailyBudgetIDR,
		ad.StartsAt, ad.EndsAt, ad.CreativeHeadline, ad.CreativeBody,
		ad.CreativeImageURL, actorID)
	if err != nil {
		return nil, fmt.Errorf("create Ads campaign: %w", err)
	}

	purchaseID := uuid.NewString()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO merchant_ad_purchases
			(id, merchant_id, campaign_id, idempotency_key, request_fingerprint,
			 amount_idr, status, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, 'charged', $7)`,
		purchaseID, ad.MerchantID, ad.ID, idempotencyKey, requestFingerprint,
		ad.TotalBudgetIDR, actorID); err != nil {
		return nil, fmt.Errorf("create Ads purchase: %w", err)
	}

	var statementID string
	if err := tx.QueryRowContext(ctx, `
		WITH financial_context AS (
			SELECT market_code, currency_code, currency_minor_unit
			FROM merchant_financial_context($1)
		)
		SELECT append_merchant_statement_entry(
			$1, financial_context.market_code, financial_context.currency_code,
			financial_context.currency_minor_unit, 'ads_spend', 'debit', $2, TRUE,
			'merchant_ad_purchase', $3, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid,
			NOW(), 'Merchant Ads budget purchase',
			jsonb_build_object('campaign_id', $4::text, 'product_type', 'ads'),
			$5
		)
		FROM financial_context`, ad.MerchantID, ad.TotalBudgetIDR, purchaseID,
		ad.ID, "merchant-ads:"+purchaseID).Scan(&statementID); err != nil {
		return nil, fmt.Errorf("record Ads spend: %w", err)
	}
	if statementID == "" {
		return nil, errors.New("Ads spend statement tidak terbentuk")
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO promo_audit_events (campaign_id, actor_id, actor_role, action, reason, payload)
		VALUES ($1, $2, 'merchant', 'merchant_ads_purchased', 'Merchant purchased eligible food visibility',
			jsonb_build_object('purchase_id', $3::text, 'amount_idr', $4::bigint))`,
		ad.ID, actorID, purchaseID, ad.TotalBudgetIDR); err != nil {
		return nil, fmt.Errorf("record Ads audit: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit Ads purchase: %w", err)
	}
	ad.ChargedAmountIDR = ad.TotalBudgetIDR
	return ad, nil
}

func (r *postgresMerchantAdsRepository) ListByMerchant(ctx context.Context, merchantID string, limit, offset int) ([]*domain.MerchantAd, int, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT `+merchantAdSelect+`
		FROM promo_campaigns p
		LEFT JOIN food_discovery_ad_events e ON e.campaign_id = p.id
		LEFT JOIN orders o ON o.id = e.order_id
		WHERE p.product_type = 'ads' AND p.merchant_id = $1
		GROUP BY p.id
		ORDER BY p.created_at DESC
		LIMIT $2 OFFSET $3`, merchantID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list merchant Ads: %w", err)
	}
	defer rows.Close()
	ads := []*domain.MerchantAd{}
	for rows.Next() {
		ad, err := scanMerchantAd(rows)
		if err != nil {
			return nil, 0, err
		}
		ads = append(ads, ad)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	var total int
	if err := r.readDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM promo_campaigns WHERE product_type = 'ads' AND merchant_id = $1`, merchantID).Scan(&total); err != nil {
		return nil, 0, err
	}
	return ads, total, nil
}

func (r *postgresMerchantAdsRepository) SetActive(ctx context.Context, adID, merchantID string, active bool) error {
	status := "paused"
	if active {
		status = "active"
	}
	result, err := r.writeDB.ExecContext(ctx, `
		UPDATE promo_campaigns
		SET status = CASE WHEN $3 = TRUE AND starts_at > NOW() THEN 'scheduled' ELSE $4 END,
			paused_at = CASE WHEN $3 = TRUE THEN NULL ELSE NOW() END,
			updated_at = NOW()
		WHERE id = $1 AND merchant_id = $2 AND product_type = 'ads'
		  AND status NOT IN ('expired', 'archived')`, adID, merchantID, active, status)
	if err != nil {
		return fmt.Errorf("update Ads status: %w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return errors.New("Ads tidak ditemukan atau sudah berakhir")
	}
	return nil
}

func (r *postgresMerchantAdsRepository) Performance(ctx context.Context, merchantID, period string) (*domain.MerchantMarketingPerformance, error) {
	filter := "e.created_at >= date_trunc('day', NOW())"
	orderFilter := "o.created_at >= date_trunc('day', NOW())"
	statementFilter := "mse.occurred_at >= date_trunc('day', NOW())"
	if period == "weekly" {
		filter = "e.created_at >= NOW() - INTERVAL '7 days'"
		orderFilter = "o.created_at >= NOW() - INTERVAL '7 days'"
		statementFilter = "mse.occurred_at >= NOW() - INTERVAL '7 days'"
	}
	result := &domain.MerchantMarketingPerformance{Period: period}
	if err := r.readDB.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT
			COUNT(*) FILTER (WHERE e.event_type = 'impression'),
			COUNT(*) FILTER (WHERE e.event_type = 'click'),
			COUNT(DISTINCT e.order_id) FILTER (WHERE e.event_type = 'order' AND o.status = 'delivered'),
			COALESCE(SUM(o.total_price_idr) FILTER (WHERE e.event_type = 'order' AND o.status = 'delivered'), 0)
		FROM food_discovery_ad_events e
		JOIN promo_campaigns p ON p.id = e.campaign_id AND p.product_type = 'ads' AND p.merchant_id = $1
		LEFT JOIN orders o ON o.id = e.order_id
		WHERE %s`, filter), merchantID).Scan(
		&result.Paid.Impressions, &result.Paid.Clicks,
		&result.Paid.AttributedOrders, &result.Paid.RevenueIDR); err != nil {
		return nil, fmt.Errorf("paid Ads performance: %w", err)
	}
	if err := r.readDB.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT COALESCE(SUM(mse.amount_minor), 0)
		FROM merchant_statement_entries mse
		JOIN merchant_ad_purchases ap ON ap.id::text = mse.source_id AND ap.merchant_id = mse.merchant_id
		WHERE mse.merchant_id = $1 AND mse.entry_type = 'ads_spend'
		  AND mse.direction = 'debit' AND ap.status = 'charged' AND %s`, statementFilter), merchantID).Scan(&result.Paid.SpendIDR); err != nil {
		return nil, fmt.Errorf("Ads spend performance: %w", err)
	}
	if err := r.readDB.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT COUNT(*), COALESCE(SUM(o.total_price_idr), 0)
		FROM orders o
		WHERE o.merchant_id = $1 AND o.service_sub_type = 'food_delivery' AND o.status = 'delivered'
		  AND %s
		  AND NOT EXISTS (
			SELECT 1 FROM food_discovery_ad_events e
			JOIN promo_campaigns p ON p.id = e.campaign_id
			WHERE e.order_id = o.id AND e.event_type = 'order'
			  AND e.merchant_id = o.merchant_id AND p.product_type = 'ads'
		  AND p.merchant_id = $1
		  )`, orderFilter), merchantID).Scan(
		&result.Organic.AttributedOrders, &result.Organic.RevenueIDR); err != nil {
		return nil, fmt.Errorf("organic food performance: %w", err)
	}
	return result, nil
}
