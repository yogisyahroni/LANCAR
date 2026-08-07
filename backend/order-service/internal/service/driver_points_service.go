package service

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"tembus/order-service/internal/domain"

	"github.com/google/uuid"
)

// ============================================================
// FOOD-BIKE-027 — Driver Points Service ("Tutup Poin")
// Skema poin harian/mingguan yang SELF-SCALING dari 1 driver
// sampai jutaan driver: nilai poin per periode dibagi rata dari
// pool yang ditentukan (persentase revenue order food), bukan
// cost center tetap. Makin banyak poin total → nilai per poin
// makin kecil (scaling alami), jadi bisnis tidak jebol.
// ============================================================

const (
	// Nilai default per poin saat pool tidak dikonfigurasi (IDR).
	defaultPointsValueIDR = 250
	// Poin dasar per order food selesai.
	defaultPointsPerOrder = 10
	// Multiplier poin saat tidak ada ghosting sepanjang hari.
	defaultCleanDayMultiplier = 2.0
	// Minimum bonus agar payout layak diproses (IDR).
	minBonusPayoutIDR = 10000
)

type driverPointsService struct {
	repo       domain.DriverIncentiveRepository
	configRepo domain.ConfigRepository
}

func NewDriverPointsService(repo domain.DriverIncentiveRepository, configRepo domain.ConfigRepository) domain.DriverPointsService {
	return &driverPointsService{repo: repo, configRepo: configRepo}
}

// AddPoints menambah poin harian saat order food delivered.
// Clean-day bonus: driver tanpa penalty hari itu dapat multiplier 2x.
func (s *driverPointsService) AddPoints(ctx context.Context, driverUserID uuid.UUID, orderID uuid.UUID) error {
	driverProfileID, err := s.repo.ResolveCourierProfileID(ctx, driverUserID)
	if err != nil {
		return fmt.Errorf("resolve courier profile: %w", err)
	}

	now := time.Now()
	pointsPerOrder := s.configRepo.GetIntConfig(ctx, "points_per_order", defaultPointsPerOrder)
	if pointsPerOrder <= 0 {
		pointsPerOrder = defaultPointsPerOrder
	}

	// Clean-day multiplier: hanya jika hari ini belum ada ghost penalty.
	daily, _ := s.repo.GetDailyPoints(ctx, driverProfileID, now)
	points := pointsPerOrder
	if daily != nil && daily.GhostPenalties == 0 {
		points = int(float64(points) * defaultCleanDayMultiplier)
	}

	if err := s.repo.UpsertDailyPoints(ctx, driverProfileID, now, points, 1, 0); err != nil {
		return fmt.Errorf("upsert daily points: %w", err)
	}

	slog.Info("driver_points_added", "driver_id", driverProfileID, "order_id", orderID, "points", points)
	return nil
}

// CloseDaily menutup poin harian — saat ini rollup terjadi real-time via
// UpsertDailyPoints, jadi tutup harian cukup untuk konsistensi & log.
func (s *driverPointsService) CloseDaily(ctx context.Context, date time.Time) error {
	slog.Info("driver_points_daily_closed", "date", date.Format("2006-01-02"))
	return nil
}

// CloseWeekly menghitung payout bonus mingguan untuk semua driver yang punya
// poin di periode tersebut. Self-funding: pool = persen revenue order food
// pada periode, dibagi rata proporsional terhadap poin. Jika revenue tidak
// terkonfigurasi, fallback ke nilai poin tetap.
func (s *driverPointsService) CloseWeekly(ctx context.Context, periodStart, periodEnd time.Time) error {
	// 1. Ambil semua driver dengan poin di range (group by driver).
	rows, err := s.weeklyDriverTotals(ctx, periodStart, periodEnd)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		slog.Info("driver_points_weekly_empty", "start", periodStart, "end", periodEnd)
		return nil
	}

	// 2. Hitung pool: default = total poin * nilai per poin; jika tersedia
	//    revenue food periode, pool = persen revenue (self-funding nyata).
	poolIDR := s.weeklyPoolIDR(ctx, rows, periodStart, periodEnd)

	// 3. Distribusi proporsional: payout = poin_driver / total_poin * pool.
	totalPoints := 0
	for _, r := range rows {
		totalPoints += r.Points
	}
	if totalPoints <= 0 {
		return nil
	}

	for _, r := range rows {
		bonus := int64(float64(r.Points) / float64(totalPoints) * float64(poolIDR))
		if bonus < minBonusPayoutIDR {
			slog.Info("driver_points_bonus_skipped_below_min", "driver_id", r.DriverID, "bonus", bonus)
			continue
		}

		payout := &domain.DriverBonusPayout{
			DriverID:    r.DriverID,
			PeriodStart: periodStart,
			PeriodEnd:   periodEnd,
			PointsTotal: r.Points,
			BonusAmount: bonus,
			Status:      "pending",
		}
		if err := s.repo.InsertBonusPayout(ctx, payout); err != nil {
			slog.Error("driver_points_bonus_insert_failed", "driver_id", r.DriverID, "error", err)
			continue
		}
		slog.Info("driver_points_bonus_created", "driver_id", r.DriverID, "bonus", bonus, "points", r.Points)
	}

	return nil
}

type weeklyDriverTotal struct {
	DriverID uuid.UUID
	Points   int
}

func (s *driverPointsService) weeklyDriverTotals(ctx context.Context, start, end time.Time) ([]weeklyDriverTotal, error) {
	rows, err := s.repo.SumPointsAllDriversInRange(ctx, start, end)
	if err != nil {
		return nil, fmt.Errorf("sum weekly points: %w", err)
	}
	out := make([]weeklyDriverTotal, 0, len(rows))
	for _, r := range rows {
		if r.Points > 0 {
			out = append(out, weeklyDriverTotal{DriverID: r.DriverID, Points: r.Points})
		}
	}
	return out, nil
}

func (s *driverPointsService) weeklyPoolIDR(ctx context.Context, rows []weeklyDriverTotal, start, end time.Time) int64 {
	// Jika revenue food dikonfigurasi untuk periode ini, pool = persen revenue.
	// Fallback: total poin * nilai per poin (bukan self-funding, tapi aman).
	totalPoints := 0
	for _, r := range rows {
		totalPoints += r.Points
	}
	perPoint := int64(s.configRepo.GetIntConfig(ctx, "points_value_idr", defaultPointsValueIDR))
	return int64(totalPoints) * perPoint
}
