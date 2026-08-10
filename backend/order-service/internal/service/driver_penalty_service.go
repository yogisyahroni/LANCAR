package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"tembus/order-service/internal/domain"

	"github.com/google/uuid"
)

// ============================================================
// FOOD-BIKE-025 — Driver Penalty Service (Anti-Ghosting)
// Kategorisasi ghosting (silent/soft/coerced) + potongan bertingkat.
// Potongan di-freeze dari saldo driver via payment-service hold-deduct.
// ============================================================

// Deduction tiers (IDR) — self-funding: potongan masuk ke hold reserve,
// bukan "bakar modal". Nilai bisa dikonfigurasi via system_configs.
const (
	defaultSilentCancelDeduction  = 50000 // accept lalu batal diam-diam
	defaultSoftGhostingDeduction  = 30000 // accept tapi tidak bergerak
	defaultCoercedCancelDeduction = 0     // bukan salah driver — tidak dipotong
	defaultNoShowPickupDeduction  = 25000
)

type driverPenaltyService struct {
	repo       domain.DriverIncentiveRepository
	configRepo domain.ConfigRepository
}

func NewDriverPenaltyService(repo domain.DriverIncentiveRepository, configRepo domain.ConfigRepository) domain.DriverPenaltyService {
	return &driverPenaltyService{repo: repo, configRepo: configRepo}
}

func (s *driverPenaltyService) CalculateDeduction(ctx context.Context, violation domain.ViolationType) int64 {
	switch violation {
	case domain.ViolationSilentCancel:
		return int64(s.configRepo.GetIntConfig(ctx, "penalty_silent_cancel_idr", defaultSilentCancelDeduction))
	case domain.ViolationSoftGhosting:
		return int64(s.configRepo.GetIntConfig(ctx, "penalty_soft_ghosting_idr", defaultSoftGhostingDeduction))
	case domain.ViolationCoercedCancel:
		return int64(s.configRepo.GetIntConfig(ctx, "penalty_coerced_cancel_idr", defaultCoercedCancelDeduction))
	case domain.ViolationNoShowPickup:
		return int64(s.configRepo.GetIntConfig(ctx, "penalty_no_show_pickup_idr", defaultNoShowPickupDeduction))
	default:
		return 0
	}
}

func (s *driverPenaltyService) RecordGhosting(ctx context.Context, driverUserID uuid.UUID, orderID uuid.UUID, violation domain.ViolationType, evidenceRef string) (*domain.DriverPenaltyLog, error) {
	if violation == domain.ViolationNone {
		return nil, fmt.Errorf("violation type required")
	}

	// orders.courier_id = users.id → resolve ke courier_profiles.id (FK tabel penalty).
	driverProfileID, err := s.repo.ResolveCourierProfileID(ctx, driverUserID)
	if err != nil {
		return nil, fmt.Errorf("resolve courier profile: %w", err)
	}

	deduction := s.CalculateDeduction(ctx, violation)

	logEntry := &domain.DriverPenaltyLog{
		DriverID:       driverProfileID,
		OrderID:        orderID,
		ViolationType:  violation,
		AmountDeducted: deduction,
		EvidenceRef:    evidenceRef,
		AppealStatus:   domain.AppealNone,
	}
	if err := s.repo.InsertPenaltyLog(ctx, logEntry); err != nil {
		return nil, fmt.Errorf("insert penalty log: %w", err)
	}

	// Penalty > 0 → freeze saldo via payment-service (hold). Idempotent per order.
	if deduction > 0 {
		referenceID := fmt.Sprintf("PENALTY-%s", orderID.String())
		callHoldDeduct(driverUserID, deduction, referenceID)
		// Update daily points: ghost_penalties bertambah, poin tidak (penalti).
		_ = s.repo.UpsertDailyPoints(ctx, driverProfileID, time.Now(), 0, 0, 1)
	}

	slog.Info("ghosting_recorded",
		"driver_user_id", driverUserID, "order_id", orderID,
		"violation", violation, "deduction_idr", deduction)

	return logEntry, nil
}

func (s *driverPenaltyService) Appeal(ctx context.Context, penaltyID uuid.UUID, status domain.AppealStatus) error {
	if status != domain.AppealSubmitted && status != domain.AppealApproved && status != domain.AppealRejected {
		return fmt.Errorf("invalid appeal status %q", status)
	}
	return s.repo.UpdateAppealStatus(ctx, penaltyID, status)
}

func (s *driverPenaltyService) ListByDriver(ctx context.Context, driverID uuid.UUID, limit, offset int) ([]*domain.DriverPenaltyLog, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	return s.repo.ListPenaltiesByDriver(ctx, driverID, limit, offset)
}

// callHoldDeduct memanggil payment-service /api/internal/wallet/hold-deduct
// (FOOD-BIKE-024). Non-blocking: kegagalan dicatat, tidak menggagalkan transaksi.
func callHoldDeduct(driverUserID uuid.UUID, amount int64, referenceID string) {
	paymentServiceURL := os.Getenv("PAYMENT_SERVICE_URL")
	if paymentServiceURL == "" {
		paymentServiceURL = "http://payment-service:8084"
	}

	payload := map[string]interface{}{
		"driver_id":    driverUserID,
		"amount":       amount,
		"reference_id": referenceID,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		slog.Error("hold_deduct_marshal_failed", "error", err)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, paymentServiceURL+"/api/internal/wallet/hold-deduct", bytes.NewReader(body))
	if err != nil {
		slog.Error("hold_deduct_request_failed", "error", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Error("hold_deduct_call_failed", "error", err, "reference_id", referenceID)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		slog.Warn("hold_deduct_rejected", "status", resp.StatusCode, "reference_id", referenceID)
		return
	}
	slog.Info("hold_deduct_completed", "reference_id", referenceID, "amount", amount)
}
