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

type roadsideSettlementSourceRepo struct{ db *sql.DB }

func NewRoadsideSettlementSourceRepository(db *sql.DB) domain.RoadsideSettlementSourceRepository {
	return &roadsideSettlementSourceRepo{db: db}
}

type roadsideQueryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

// All financial reads use the primary. This query is also used inside the
// finalizer's order-row transaction, so approval/payment/settlement serialize.
func loadRoadsideSettlementSource(ctx context.Context, q roadsideQueryer, orderID string) (*domain.RoadsideSettlementSource, error) {
	var s domain.RoadsideSettlementSource
	var pricingSnapshot string
	err := q.QueryRowContext(ctx, `
  SELECT o.id::text, COALESCE(NULLIF(o.service_code,''),o.service_sub_type,''),
   COALESCE(o.service_sub_type,''),o.status,COALESCE(ol.courier_id::text,''),
   o.total_price_idr,COALESCE(o.base_price_idr,0),COALESCE(o.distance_fee_idr,0),
   COALESCE(o.pricing_snapshot::text,'{}'),COALESCE(proof.id::text,''),
   proof.id IS NOT NULL,
   COALESCE(fin.collected_idr,0),
   COALESCE(fin.initial_paid,false) AND COALESCE(fin.collected_idr,0)=o.total_price_idr
    AND NOT EXISTS(SELECT 1 FROM service_adjustments a WHERE a.order_id=o.id
      AND (a.status='pending' OR (a.status='approved' AND (
        a.financial_state<>'collected' OR NOT EXISTS (
          SELECT 1 FROM payments p WHERE p.service_adjustment_id=a.id
           AND p.purpose='service_adjustment' AND p.status IN ('paid','settled') AND p.paid_at IS NOT NULL AND p.provider_verified_at IS NOT NULL
           AND p.amount_idr=a.approved_delta_idr AND p.order_id=o.id)))))
    AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.order_id=o.id AND (p.status IN ('refunding','refunded') OR (p.status IN ('paid','settled') AND (p.paid_at IS NULL OR p.provider_verified_at IS NULL))))
    AND NOT EXISTS(SELECT 1 FROM refunds f WHERE f.order_id=o.id)
    AND NOT EXISTS(SELECT 1 FROM disputes d WHERE d.order_id=o.id
      AND d.status NOT IN ('resolved','closed','rejected'))
  FROM orders o
  LEFT JOIN order_legs ol ON ol.order_id=o.id AND ol.leg_number=1
  LEFT JOIN LATERAL (
    SELECT r.id FROM tambal_ban_reports r
    JOIN courier_profiles cp ON cp.id=r.courier_id AND cp.user_id=ol.courier_id
    WHERE r.order_id=o.id AND r.completed_at IS NOT NULL
      AND NULLIF(BTRIM(r.tire_condition_before),'') IS NOT NULL
      AND NULLIF(BTRIM(r.tire_condition_after),'') IS NOT NULL
      AND NULLIF(BTRIM(r.tire_photo_before_url),'') IS NOT NULL
      AND NULLIF(BTRIM(r.tire_photo_after_url),'') IS NOT NULL
      AND r.service_duration_minutes BETWEEN 1 AND 1440
      AND roadside_materials_valid(r.materials_used)
    ORDER BY r.created_at ASC LIMIT 1
  ) proof ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(p.amount_idr) FILTER(WHERE p.status IN ('paid','settled') AND p.paid_at IS NOT NULL AND p.provider_verified_at IS NOT NULL),0)::bigint AS collected_idr,
      COALESCE(BOOL_OR(p.purpose='order' AND p.status IN ('paid','settled') AND p.paid_at IS NOT NULL AND p.provider_verified_at IS NOT NULL),false) AS initial_paid
    FROM payments p WHERE p.order_id=o.id
  ) fin ON true
  WHERE o.id=$1 AND (o.service_category='tambal_ban' OR o.service_sub_type LIKE 'tambal_ban_%')`, orderID).Scan(
		&s.OrderID, &s.ServiceCode, &s.ServiceSubType, &s.Status, &s.AssignedCourierID,
		&s.GrossTotalIDR, &s.BaseFareIDR, &s.DistanceFeeIDR, &pricingSnapshot, &s.ReportID,
		&s.FinalReportReady, &s.CollectedTotalIDR, &s.FinancialReady)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, domain.ErrRoadsideSettlementNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("load roadside settlement source: %w", err)
	}
	if strings.TrimSpace(pricingSnapshot) != "" {
		var snapshot struct {
			InsuranceFeeIDR int64            `json:"insurance_fee_idr"`
			PriceComponents map[string]int64 `json:"price_components"`
		}
		if err = json.Unmarshal([]byte(pricingSnapshot), &snapshot); err != nil {
			return nil, fmt.Errorf("invalid authoritative pricing snapshot: %w", err)
		}
		s.InsuranceFeeIDR = snapshot.InsuranceFeeIDR
		if s.InsuranceFeeIDR == 0 {
			s.InsuranceFeeIDR = snapshot.PriceComponents["insurance_fee_idr"]
		}
	}
	return &s, nil
}

func (r *roadsideSettlementSourceRepo) GetRoadsideSettlementSource(ctx context.Context, orderID string) (*domain.RoadsideSettlementSource, error) {
	return loadRoadsideSettlementSource(ctx, r.db, orderID)
}
