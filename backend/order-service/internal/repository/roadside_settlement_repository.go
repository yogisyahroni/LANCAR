package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"tembus/order-service/internal/domain"
)

type roadsideSettlementSourceRepo struct {
	db *sql.DB
}

func NewRoadsideSettlementSourceRepository(db *sql.DB) domain.RoadsideSettlementSourceRepository {
	return &roadsideSettlementSourceRepo{db: db}
}

func (r *roadsideSettlementSourceRepo) GetRoadsideSettlementSource(ctx context.Context, orderID string) (*domain.RoadsideSettlementSource, error) {
	var source domain.RoadsideSettlementSource
	var pricingSnapshot string

	err := r.db.QueryRowContext(ctx, `
		SELECT o.id::text,
		       COALESCE(NULLIF(o.service_code, ''), o.service_sub_type),
		       COALESCE(o.service_sub_type, ''),
		       o.status,
		       COALESCE(ol.courier_id::text, ''),
		       o.total_price_idr,
		       o.base_price_idr,
		       o.distance_fee_idr,
		       COALESCE(o.pricing_snapshot::text, '{}'),
		       EXISTS (
		           SELECT 1
		           FROM tambal_ban_reports tbr
		           WHERE tbr.order_id = o.id
		             AND tbr.completed_at IS NOT NULL
		             AND NULLIF(BTRIM(tbr.tire_photo_before_url), '') IS NOT NULL
		             AND NULLIF(BTRIM(tbr.tire_photo_after_url), '') IS NOT NULL
		       )
		FROM orders o
		LEFT JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
		WHERE o.id = $1
		  AND (
		      o.service_category = 'tambal_ban'
		      OR o.service_sub_type LIKE 'tambal_ban_%'
		  )`, orderID).Scan(
		&source.OrderID,
		&source.ServiceCode,
		&source.ServiceSubType,
		&source.Status,
		&source.AssignedCourierID,
		&source.GrossTotalIDR,
		&source.BaseFareIDR,
		&source.DistanceFeeIDR,
		&pricingSnapshot,
		&source.FinalReportReady,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrRoadsideSettlementNotFound
		}
		return nil, fmt.Errorf("load roadside settlement source: %w", err)
	}

	// Insurance is read from the frozen quote snapshot. Tolerate older snapshot
	// envelopes by checking both the top-level field and price_components.
	if strings.TrimSpace(pricingSnapshot) != "" && json.Valid([]byte(pricingSnapshot)) {
		var snapshot struct {
			InsuranceFeeIDR int64            `json:"insurance_fee_idr"`
			PriceComponents map[string]int64 `json:"price_components"`
		}
		if json.Unmarshal([]byte(pricingSnapshot), &snapshot) == nil {
			source.InsuranceFeeIDR = snapshot.InsuranceFeeIDR
			if source.InsuranceFeeIDR == 0 && snapshot.PriceComponents != nil {
				source.InsuranceFeeIDR = snapshot.PriceComponents["insurance_fee_idr"]
			}
		}
	}

	return &source, nil
}
