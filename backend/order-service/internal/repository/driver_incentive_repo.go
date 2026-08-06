package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"tembus/order-service/internal/domain"

	"github.com/google/uuid"
)

// driverIncentiveRepo — implementasi domain.DriverIncentiveRepository
// (FOOD-BIKE-025/027). Tabel: driver_penalty_log, driver_daily_points,
// driver_bonus_payout (migration 20260806000008/0009).
type driverIncentiveRepo struct {
	db     *sql.DB
	readDB *sql.DB
}

func NewDriverIncentiveRepository(db, readDB *sql.DB) domain.DriverIncentiveRepository {
	return &driverIncentiveRepo{db: db, readDB: readDB}
}

// ResolveCourierProfileID: orders.courier_id menyimpan users.id, sedangkan
// driver_penalty_log.driver_id mengacu courier_profiles.id. Resolve wajib
// sebelum insert penalty/points.
func (r *driverIncentiveRepo) ResolveCourierProfileID(ctx context.Context, userID uuid.UUID) (uuid.UUID, error) {
	var id uuid.UUID
	err := r.readDB.QueryRowContext(ctx,
		`SELECT cp.id FROM courier_profiles cp
		 JOIN users u ON cp.user_id = u.id
		 WHERE cp.user_id = $1 AND u.deleted_at IS NULL`,
		userID,
	).Scan(&id)
	if err != nil {
		return uuid.Nil, fmt.Errorf("courier profile not found for user %s: %w", userID, err)
	}
	return id, nil
}

func (r *driverIncentiveRepo) InsertPenaltyLog(ctx context.Context, log *domain.DriverPenaltyLog) error {
	query := `
		INSERT INTO driver_penalty_log (driver_id, order_id, violation_type, amount_deducted, evidence_ref, appeal_status)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at`
	return r.db.QueryRowContext(ctx, query,
		log.DriverID, log.OrderID, log.ViolationType, log.AmountDeducted, log.EvidenceRef, log.AppealStatus,
	).Scan(&log.ID, &log.CreatedAt)
}

func (r *driverIncentiveRepo) ListPenaltiesByDriver(ctx context.Context, driverID uuid.UUID, limit, offset int) ([]*domain.DriverPenaltyLog, error) {
	rows, err := r.readDB.QueryContext(ctx,
		`SELECT id, driver_id, order_id, violation_type, amount_deducted, COALESCE(evidence_ref, ''), appeal_status, created_at
		 FROM driver_penalty_log
		 WHERE driver_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2 OFFSET $3`,
		driverID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*domain.DriverPenaltyLog
	for rows.Next() {
		var p domain.DriverPenaltyLog
		if err := rows.Scan(&p.ID, &p.DriverID, &p.OrderID, &p.ViolationType, &p.AmountDeducted, &p.EvidenceRef, &p.AppealStatus, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &p)
	}
	return out, rows.Err()
}

func (r *driverIncentiveRepo) UpdateAppealStatus(ctx context.Context, penaltyID uuid.UUID, status domain.AppealStatus) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE driver_penalty_log SET appeal_status = $1 WHERE id = $2`,
		status, penaltyID,
	)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errors.New("penalty log not found")
	}
	return nil
}

func (r *driverIncentiveRepo) UpsertDailyPoints(ctx context.Context, driverID uuid.UUID, date time.Time, points, orders, penalties int) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO driver_daily_points (driver_id, points_date, points_earned, orders_completed, ghost_penalties)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (driver_id, points_date)
		 DO UPDATE SET
		   points_earned = driver_daily_points.points_earned + EXCLUDED.points_earned,
		   orders_completed = driver_daily_points.orders_completed + EXCLUDED.orders_completed,
		   ghost_penalties = driver_daily_points.ghost_penalties + EXCLUDED.ghost_penalties,
		   updated_at = NOW()`,
		driverID, date, points, orders, penalties,
	)
	return err
}

func (r *driverIncentiveRepo) GetDailyPoints(ctx context.Context, driverID uuid.UUID, date time.Time) (*domain.DriverDailyPoints, error) {
	var p domain.DriverDailyPoints
	err := r.readDB.QueryRowContext(ctx,
		`SELECT id, driver_id, points_date, points_earned, orders_completed, ghost_penalties, created_at, updated_at
		 FROM driver_daily_points
		 WHERE driver_id = $1 AND points_date = $2`,
		driverID, date,
	).Scan(&p.ID, &p.DriverID, &p.PointsDate, &p.PointsEarned, &p.OrdersCompleted, &p.GhostPenalties, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *driverIncentiveRepo) SumPointsInRange(ctx context.Context, driverID uuid.UUID, start, end time.Time) (int, error) {
	var total int
	err := r.readDB.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(points_earned), 0) FROM driver_daily_points
		 WHERE driver_id = $1 AND points_date >= $2 AND points_date < $3`,
		driverID, start, end,
	).Scan(&total)
	return total, err
}

func (r *driverIncentiveRepo) SumPointsAllDriversInRange(ctx context.Context, start, end time.Time) ([]domain.DriverWeeklyPoints, error) {
	rows, err := r.readDB.QueryContext(ctx,
		`SELECT driver_id, SUM(points_earned)::int as points
		 FROM driver_daily_points
		 WHERE points_date >= $1 AND points_date < $2
		 GROUP BY driver_id`,
		start, end,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.DriverWeeklyPoints
	for rows.Next() {
		var p domain.DriverWeeklyPoints
		if err := rows.Scan(&p.DriverID, &p.Points); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *driverIncentiveRepo) InsertBonusPayout(ctx context.Context, payout *domain.DriverBonusPayout) error {
	query := `
		INSERT INTO driver_bonus_payout (driver_id, period_start, period_end, points_total, bonus_amount, status)
		VALUES ($1, $2, $3, $4, $5, 'pending')
		RETURNING id, created_at, updated_at`
	return r.db.QueryRowContext(ctx, query,
		payout.DriverID, payout.PeriodStart, payout.PeriodEnd, payout.PointsTotal, payout.BonusAmount,
	).Scan(&payout.ID, &payout.CreatedAt, &payout.UpdatedAt)
}

func (r *driverIncentiveRepo) ListBonusPayouts(ctx context.Context, driverID uuid.UUID, limit, offset int) ([]*domain.DriverBonusPayout, error) {
	rows, err := r.readDB.QueryContext(ctx,
		`SELECT id, driver_id, period_start, period_end, points_total, bonus_amount, status, created_at, updated_at
		 FROM driver_bonus_payout
		 WHERE driver_id = $1
		 ORDER BY period_start DESC
		 LIMIT $2 OFFSET $3`,
		driverID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*domain.DriverBonusPayout
	for rows.Next() {
		var p domain.DriverBonusPayout
		if err := rows.Scan(&p.ID, &p.DriverID, &p.PeriodStart, &p.PeriodEnd, &p.PointsTotal, &p.BonusAmount, &p.Status, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, &p)
	}
	return out, rows.Err()
}
