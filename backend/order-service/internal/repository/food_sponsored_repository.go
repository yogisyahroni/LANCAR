package repository

import (
	"context"
	"database/sql"
	"tembus/order-service/internal/domain"
)

type foodSponsoredRepository struct{ db *sql.DB }

func NewFoodSponsoredRepository(db *sql.DB) domain.FoodSponsoredRepository {
	return &foodSponsoredRepository{db: db}
}

func (r *foodSponsoredRepository) RecordFoodSponsoredEvent(ctx context.Context, event domain.FoodSponsoredEvent) (bool, error) {
	// Only an active, published admin campaign explicitly targeting the food
	// discovery placement can create attribution. Unknown/stale campaigns are
	// rejected by the INSERT source query, so clients cannot self-sponsor.
	result, err := r.db.ExecContext(ctx, `
		INSERT INTO food_discovery_ad_events (campaign_id, merchant_id, user_id, event_type, session_id, order_id)
		SELECT p.id, $2::uuid, $3::uuid, $4, $5, NULLIF($6, '')::uuid
		FROM promo_campaigns p
		WHERE p.id = $1::uuid
		  AND p.product_type = 'ads'
		  AND p.status = 'active'
		  AND p.starts_at <= NOW() AND p.ends_at > NOW()
		  AND 'food_delivery' = ANY(p.service_codes)
		  AND p.audience_rules->>'placement' = 'food_discovery'
		  AND (p.audience_rules->>'merchant_id' IS NULL OR p.audience_rules->>'merchant_id' = $2::uuid::text)
		ON CONFLICT DO NOTHING`, event.CampaignID, event.MerchantID, event.UserID, event.EventType, event.SessionID, event.OrderID)
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	return count == 1, err
}
