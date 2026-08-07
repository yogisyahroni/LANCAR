package worker

import (
	"context"
	"log"
	"time"

	"tembus/order-service/internal/domain"

	"github.com/google/uuid"
)

// GhostDetectionWorker — FOOD-BIKE-066: deteksi "driver ghosting" —
// driver menerima order (status accepted) tapi tidak bergerak menuju pickup.
//
// Alur per siklus (tiap 1 menit):
//  1. Ambil order accepted yang updated_at-nya lebih lama dari timeout
//     (default 5 menit, via system_configs ghost_detect_timeout_minutes).
//  2. Catat pelanggaran soft_ghosting via DriverPenaltyService (FOOD-BIKE-025):
//     potongan di-freeze ke hold wallet (self-funding anti-ghosting).
//  3. Release order: courier_id → NULL, status → searching, biar driver lain
//     bisa ambil. Order tidak mati — hanya pindah tangan.
//
// Non-fatal: setiap kegagalan per order hanya dilog, siklus tetap lanjut.
type GhostDetectionWorker struct {
	orderRepo domain.OrderRepository
	penaltySvc domain.DriverPenaltyService
	timeout    time.Duration
}

func NewGhostDetectionWorker(orderRepo domain.OrderRepository, penaltySvc domain.DriverPenaltyService) *GhostDetectionWorker {
	return &GhostDetectionWorker{
		orderRepo:  orderRepo,
		penaltySvc: penaltySvc,
		timeout:    5 * time.Minute,
	}
}

func (w *GhostDetectionWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	log.Printf("GhostDetectionWorker started (timeout: %v)", w.timeout)

	for {
		select {
		case <-ctx.Done():
			log.Println("GhostDetectionWorker stopped")
			return
		case <-ticker.C:
			w.process(ctx)
		}
	}
}

func (w *GhostDetectionWorker) process(_ context.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	ghosted, err := w.orderRepo.GetGhostedAcceptedOrders(ctx, w.timeout)
	if err != nil {
		log.Printf("[GhostDetection] error ambil order accepted stale: %v", err)
		return
	}
	if len(ghosted) == 0 {
		return
	}

	for _, o := range ghosted {
		if o.CourierID == nil || *o.CourierID == "" {
			continue
		}
		log.Printf("[GhostDetection] order %s (driver %s) accepted > %v tanpa progress — soft_ghosting", o.ID, *o.CourierID, w.timeout)

		// 1. Catat penalty (freeze saldo driver via hold).
		driverUserID, errUser := uuid.Parse(*o.CourierID)
		orderUUID, errOrder := uuid.Parse(o.ID)
		if errUser == nil && errOrder == nil && w.penaltySvc != nil {
			if _, err := w.penaltySvc.RecordGhosting(ctx, driverUserID, orderUUID, domain.ViolationSoftGhosting, "ghost_detect_worker"); err != nil {
				log.Printf("[GhostDetection] gagal catat penalty order %s: %v", o.ID, err)
			}
		}

		// 2. Release order ke pool (status searching) — non-fatal.
		if err := w.orderRepo.ReleaseGhostedOrder(ctx, o.ID); err != nil {
			log.Printf("[GhostDetection] gagal release order %s: %v", o.ID, err)
			continue
		}
		log.Printf("[GhostDetection] order %s dirilis ulang ke searching (ghosting)", o.ID)
	}
}
