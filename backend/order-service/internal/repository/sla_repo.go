package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"tembus/order-service/internal/domain"
)

type PostgresSLARepo struct {
	primaryDB *sqlx.DB
	replicaDB *sqlx.DB
}

func NewPostgresSLARepo(primaryDB *sqlx.DB, replicaDB *sqlx.DB) *PostgresSLARepo {
	return &PostgresSLARepo{
		primaryDB: primaryDB,
		replicaDB: replicaDB,
	}
}

func (r *PostgresSLARepo) GetConfig(ctx context.Context, model string, legNumber int) (*domain.SLAConfig, error) {
	query := `
		SELECT id, model, leg_number, max_minutes, warning_minutes, is_active
		FROM sla_configs
		WHERE model = $1 AND leg_number = $2 AND is_active = true
	`
	var config domain.SLAConfig
	err := r.replicaDB.GetContext(ctx, &config, query, model, legNumber)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil // No config found means no SLA enforcement
		}
		return nil, err
	}
	return &config, nil
}

func (r *PostgresSLARepo) ListActiveLegs(ctx context.Context) ([]*domain.OrderLegSLA, error) {
	// Active legs for SLA monitoring (status not in delivered, failed, cancelled)
	// And sla_deadline is not null
	query := `
		SELECT ol.id as leg_id, ol.order_id, ol.courier_id, o.model, ol.leg_number, ol.status, ol.sla_deadline
		FROM order_legs ol
		JOIN orders o ON ol.order_id = o.id
		WHERE ol.status NOT IN ('delivered', 'failed', 'cancelled')
		AND ol.sla_deadline IS NOT NULL
	`
	var legs []*domain.OrderLegSLA
	err := r.replicaDB.SelectContext(ctx, &legs, query)
	return legs, err
}

func (r *PostgresSLARepo) SaveSLALog(ctx context.Context, log *domain.SLALog) error {
	query := `
		INSERT INTO sla_logs (
			id, order_id, leg_id, courier_id, sla_deadline, 
			breach_detected_at, breach_minutes, penalty_amount, status, created_at
		) VALUES (
			:id, :order_id, :leg_id, :courier_id, :sla_deadline,
			:breach_detected_at, :breach_minutes, :penalty_amount, :status, :created_at
		)
	`
	_, err := r.primaryDB.NamedExecContext(ctx, query, log)
	return err
}

func (r *PostgresSLARepo) GetComplianceRate(ctx context.Context, zoneID string, date string) (float64, error) {
	// Hitung compliance rate: 1.0 - (total breach legs / total completed legs)
	// Filter per zone_id (dari tabel orders) dan tanggal (dari created_at order_leg).
	// Jika zoneID kosong, hitung global (semua zona).
	var (
		query string
		rate  float64
		err   error
	)

	if zoneID != "" {
		query = `
			SELECT 
				COALESCE(
					1.0 - (
						CAST(COUNT(DISTINCT s.leg_id) AS FLOAT) / 
						NULLIF(COUNT(DISTINCT ol.id), 0)
					), 
					1.0
				) as compliance_rate
			FROM order_legs ol
			JOIN orders o ON ol.order_id = o.id
			LEFT JOIN sla_logs s ON ol.id = s.leg_id AND s.status = 'breached'
			WHERE DATE(ol.created_at) = $1
			  AND o.zone_id = $2
		`
		err = r.replicaDB.GetContext(ctx, &rate, query, date, zoneID)
	} else {
		query = `
			SELECT 
				COALESCE(
					1.0 - (
						CAST(COUNT(DISTINCT s.leg_id) AS FLOAT) / 
						NULLIF(COUNT(DISTINCT ol.id), 0)
					), 
					1.0
				) as compliance_rate
			FROM order_legs ol
			LEFT JOIN sla_logs s ON ol.id = s.leg_id AND s.status = 'breached'
			WHERE DATE(ol.created_at) = $1
		`
		err = r.replicaDB.GetContext(ctx, &rate, query, date)
	}

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 1.0, nil
		}
		return 0, err
	}
	return rate, nil
}

func (r *PostgresSLARepo) GetIdleCouriers(ctx context.Context, threshold time.Time) ([]*domain.IdleCourier, error) {
	// Simplified logic for idle couriers waiting at a meeting point
	query := `
		SELECT id as leg_id, order_id, courier_id, meeting_point_id, updated_at as arrived_at
		FROM order_legs
		WHERE status = 'waiting_handover' AND updated_at < $1
	`
	var couriers []*domain.IdleCourier
	err := r.replicaDB.SelectContext(ctx, &couriers, query, threshold)
	return couriers, err
}

func (r *PostgresSLARepo) SetLegSLADeadline(ctx context.Context, legID uuid.UUID, deadline time.Time) error {
	query := `UPDATE order_legs SET sla_deadline = $1 WHERE id = $2`
	_, err := r.primaryDB.ExecContext(ctx, query, deadline, legID)
	return err
}
