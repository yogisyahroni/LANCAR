package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// ============================================================
// FOOD-BIKE-025/027 — Driver Penalty & Points (tutup poin)
// Anti-ghosting: kategorisasi pelanggaran + potongan bertingkat.
// Skema "tutup poin" harian/mingguan yang self-funding dari revenue.
// ============================================================

// ViolationType — kategorisasi ghosting (FOOD-BIKE-025).
type ViolationType string

const (
	ViolationSilentCancel   ViolationType = "silent_cancel"    // accept lalu batal diam-diam tanpa alasan
	ViolationSoftGhosting   ViolationType = "soft_ghosting"    // accept tapi tidak bergerak menuju pickup
	ViolationCoercedCancel  ViolationType = "coerced_cancel"   // batal karena paksaan customer/keadaan
	ViolationNoShowPickup   ViolationType = "no_show_pickup"   // tidak hadir di titik pickup
	ViolationNone           ViolationType = ""
)

// AppealStatus — status banding driver atas penalty.
type AppealStatus string

const (
	AppealNone      AppealStatus = "none"
	AppealSubmitted AppealStatus = "submitted"
	AppealApproved  AppealStatus = "approved"
	AppealRejected  AppealStatus = "rejected"
)

// DriverPenaltyLog — satu baris di driver_penalty_log (FOOD-BIKE-009).
type DriverPenaltyLog struct {
	ID            uuid.UUID    `json:"id" db:"id"`
	DriverID      uuid.UUID    `json:"driver_id" db:"driver_id"` // courier_profiles.id
	OrderID       uuid.UUID    `json:"order_id" db:"order_id"`
	ViolationType ViolationType `json:"violation_type" db:"violation_type"`
	AmountDeducted int64       `json:"amount_deducted" db:"amount_deducted"`
	EvidenceRef   string       `json:"evidence_ref" db:"evidence_ref"`
	AppealStatus  AppealStatus `json:"appeal_status" db:"appeal_status"`
	CreatedAt     time.Time    `json:"created_at" db:"created_at"`
}

// DriverDailyPoints — akumulasi poin harian (FOOD-BIKE-010).
type DriverDailyPoints struct {
	ID              uuid.UUID `json:"id" db:"id"`
	DriverID        uuid.UUID `json:"driver_id" db:"driver_id"`
	PointsDate      time.Time `json:"points_date" db:"points_date"`
	PointsEarned    int       `json:"points_earned" db:"points_earned"`
	OrdersCompleted int       `json:"orders_completed" db:"orders_completed"`
	GhostPenalties  int       `json:"ghost_penalties" db:"ghost_penalties"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time `json:"updated_at" db:"updated_at"`
}

// DriverBonusPayout — payout bonus mingguan hasil tutup poin (FOOD-BIKE-010).
type DriverBonusPayout struct {
	ID          uuid.UUID `json:"id" db:"id"`
	DriverID    uuid.UUID `json:"driver_id" db:"driver_id"`
	PeriodStart time.Time `json:"period_start" db:"period_start"`
	PeriodEnd   time.Time `json:"period_end" db:"period_end"`
	PointsTotal int       `json:"points_total" db:"points_total"`
	BonusAmount int64     `json:"bonus_amount" db:"bonus_amount"`
	Status      string    `json:"status" db:"status"` // pending/approved/paid/void
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

// DriverWeeklyPoints — agregat poin per driver dalam satu periode (group-by).
type DriverWeeklyPoints struct {
	DriverID uuid.UUID `json:"driver_id" db:"driver_id"`
	Points   int       `json:"points" db:"points"`
}

// DriverIncentiveRepository — akses data untuk penalty & points.
type DriverIncentiveRepository interface {
	// ResolveCourierProfileID menerjemahkan users.id (orders.courier_id) ke courier_profiles.id.
	// Tanpa ini, FK driver_penalty_log.driver_id tidak akan cocok.
	ResolveCourierProfileID(ctx context.Context, userID uuid.UUID) (uuid.UUID, error)

	InsertPenaltyLog(ctx context.Context, log *DriverPenaltyLog) error
	ListPenaltiesByDriver(ctx context.Context, driverID uuid.UUID, limit, offset int) ([]*DriverPenaltyLog, error)
	UpdateAppealStatus(ctx context.Context, penaltyID uuid.UUID, status AppealStatus) error

	UpsertDailyPoints(ctx context.Context, driverID uuid.UUID, date time.Time, points, orders, penalties int) error
	GetDailyPoints(ctx context.Context, driverID uuid.UUID, date time.Time) (*DriverDailyPoints, error)
	SumPointsInRange(ctx context.Context, driverID uuid.UUID, start, end time.Time) (int, error)
	// SumPointsAllDriversInRange — total poin per driver dalam periode (group-by),
	// dipakai CloseWeekly untuk distribusi bonus proporsional.
	SumPointsAllDriversInRange(ctx context.Context, start, end time.Time) ([]DriverWeeklyPoints, error)
	InsertBonusPayout(ctx context.Context, payout *DriverBonusPayout) error
	ListBonusPayouts(ctx context.Context, driverID uuid.UUID, limit, offset int) ([]*DriverBonusPayout, error)
}

// DriverPenaltyService — kategorisasi ghosting & potongan bertingkat (FOOD-BIKE-025).
type DriverPenaltyService interface {
	// RecordGhosting mencatat pelanggaran, menghitung potongan sesuai tier,
	// mem-freeze saldo driver via payment-service (hold), dan mengurangi poin.
	RecordGhosting(ctx context.Context, driverUserID uuid.UUID, orderID uuid.UUID, violation ViolationType, evidenceRef string) (*DriverPenaltyLog, error)
	// CalculateDeduction mengembalikan nominal potongan (IDR) untuk jenis pelanggaran.
	CalculateDeduction(ctx context.Context, violation ViolationType) int64
	Appeal(ctx context.Context, penaltyID uuid.UUID, status AppealStatus) error
	ListByDriver(ctx context.Context, driverID uuid.UUID, limit, offset int) ([]*DriverPenaltyLog, error)
}

// DriverPointsService — skema tutup poin harian/mingguan self-funding (FOOD-BIKE-027).
type DriverPointsService interface {
	// AddPoints menambah poin harian saat order selesai (dipanggil di transisi delivered).
	AddPoints(ctx context.Context, driverUserID uuid.UUID, orderID uuid.UUID) error
	// CloseDaily menjalankan tutup poin harian (rollup) — dipanggil worker.
	CloseDaily(ctx context.Context, date time.Time) error
	// CloseWeekly menutup periode mingguan: hitung bonus payout self-funding.
	CloseWeekly(ctx context.Context, periodStart, periodEnd time.Time) error
}
