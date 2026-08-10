package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"tembus/order-service/internal/domain"
)

const (
	minTipAmountIDR    = 1000  // Rp1.000
	maxTipAmountIDR    = 200000 // Rp200.000 per order
	tipListDefaultPage = 20
)

// TipService — FB-077: tip customer → kurir, berlaku untuk SEMUA service
// (parcel, tambal ban, towing, food). 1 tip per order.
type tipService struct {
	tipRepo    domain.TipRepository
	orderRepo  domain.OrderRepository
	tipGateway domain.TipGateway
}

func NewTipService(
	tipRepo domain.TipRepository,
	orderRepo domain.OrderRepository,
	tipGateway domain.TipGateway,
) domain.TipService {
	return &tipService{tipRepo: tipRepo, orderRepo: orderRepo, tipGateway: tipGateway}
}

// tipEligibleStatuses — status order yang masih bisa di-tip: sejak kurir
// ditugaskan sampai delivered. Tidak bisa untuk cancelled/failed/refunded.
var tipEligibleStatuses = map[domain.OrderStatus]bool{
	domain.StatusAccepted:          true,
	domain.StatusPickingUp:         true,
	domain.StatusPickedUp:          true,
	domain.StatusInboundOrigin:     true,
	domain.StatusOutboundOrigin:    true,
	domain.StatusInboundDestination: true,
	domain.StatusOutboundDestination: true,
	domain.StatusDelivering:        true,
	domain.StatusDelivered:         true,
	domain.StatusPendingMerchant:   false, // belum ada kurir
	domain.StatusPreparing:         false,
	domain.StatusSearching:         false, // belum ada kurir
}

func (s *tipService) CreateTip(ctx context.Context, orderID uuid.UUID, customerID uuid.UUID, amount int64) (*domain.DriverTip, error) {
	if amount < minTipAmountIDR {
		return nil, fmt.Errorf("tip minimal Rp%d", minTipAmountIDR)
	}
	if amount > maxTipAmountIDR {
		return nil, fmt.Errorf("tip maksimal Rp%d per order", maxTipAmountIDR)
	}

	order, err := s.orderRepo.GetByID(ctx, orderID.String())
	if err != nil {
		return nil, fmt.Errorf("order tidak ditemukan: %w", err)
	}
	if order == nil {
		return nil, errors.New("order tidak ditemukan")
	}

	// Hanya pemilik order yang bisa kasih tip
	if order.CustomerID != customerID.String() {
		return nil, errors.New("hanya customer pemilik order yang bisa kasih tip")
	}

	// Kurir harus sudah ditugaskan
	if order.CourierID == nil || *order.CourierID == "" {
		return nil, errors.New("kurir belum ditugaskan ke order ini")
	}

	eligible, known := tipEligibleStatuses[order.Status]
	if !known || !eligible {
		return nil, fmt.Errorf("tip tidak bisa diberikan pada status %s", order.Status)
	}

	// 1 tip per order (idempotency lapis DB via unique index)
	existing, err := s.tipRepo.GetTipByOrderID(ctx, orderID)
	if err != nil {
		return nil, fmt.Errorf("gagal cek tip existing: %w", err)
	}
	if existing != nil {
		return nil, errors.New("tip sudah diberikan untuk order ini")
	}

	courierUUID, err := uuid.Parse(*order.CourierID)
	if err != nil {
		return nil, fmt.Errorf("courier_id invalid: %w", err)
	}

	// Transfer dana di payment-service (idempotent by order_id) — 100% ke kurir
	if err := s.tipGateway.ProcessTip(ctx, customerID, courierUUID, amount, orderID.String()); err != nil {
		return nil, fmt.Errorf("transfer tip gagal: %w", err)
	}

	tip := &domain.DriverTip{
		OrderID:        orderID,
		CustomerID:     customerID,
		CourierID:      courierUUID,
		AmountIDR:      amount,
		ServiceSubType: order.ServiceSubType,
		Status:         "paid",
		PaymentRef:     stringPtr(fmt.Sprintf("wallet-tip-%s", orderID.String())),
	}
	if err := s.tipRepo.CreateTip(ctx, tip); err != nil {
		return nil, fmt.Errorf("gagal menyimpan tip: %w", err)
	}

	return tip, nil
}

func (s *tipService) GetTipByOrder(ctx context.Context, orderID uuid.UUID) (*domain.DriverTip, error) {
	return s.tipRepo.GetTipByOrderID(ctx, orderID)
}

// RefundTipByOrder — FB-083: refund tip saat order dibatalkan.
// - Tidak ada tip → no-op (bukan error).
// - Tip sudah refunded → no-op (idempotent).
// - Tip paid → balik transfer (courier → customer) via payment-service,
//   lalu status → refunded. Kalau transfer gagal (mis. saldo courier tidak
//   cukup karena sudah ditarik), error di-return — status tetap paid,
//   bisa diretry.
func (s *tipService) RefundTipByOrder(ctx context.Context, orderID uuid.UUID) error {
	tip, err := s.tipRepo.GetTipByOrderID(ctx, orderID)
	if err != nil {
		return fmt.Errorf("gagal cek tip utk refund: %w", err)
	}
	if tip == nil {
		return nil // tidak ada tip — nothing to refund
	}
	if tip.Status == "refunded" {
		return nil // sudah di-refund — idempotent
	}
	if tip.Status != "paid" {
		return fmt.Errorf("tip order %s berstatus %s (bukan paid/refunded)", orderID, tip.Status)
	}

	// reference BEDA dari reference tip original (wallet-tip-{order_id})
	refundRef := fmt.Sprintf("wallet-tip-refund-%s", orderID.String())
	if err := s.tipGateway.RefundTip(ctx, tip.CustomerID, tip.CourierID, tip.AmountIDR, refundRef); err != nil {
		return fmt.Errorf("refund tip order %s gagal: %w", orderID, err)
	}

	if err := s.tipRepo.UpdateTipStatus(ctx, tip.ID, "refunded"); err != nil {
		return fmt.Errorf("tip refunded tapi gagal update status: %w", err)
	}
	return nil
}

func (s *tipService) ListTipsByCourier(ctx context.Context, courierID uuid.UUID) ([]domain.DriverTip, error) {
	return s.tipRepo.ListTipsByCourier(ctx, courierID, tipListDefaultPage, 0)
}

func (s *tipService) GetTipSummary(ctx context.Context, courierID uuid.UUID) (*domain.TipSummary, error) {
	total, count, err := s.tipRepo.SumTipsByCourier(ctx, courierID)
	if err != nil {
		return nil, err
	}
	todayStart := time.Now().Truncate(24 * time.Hour)
	todayAmount, todayCount, err := s.tipRepo.SumTipsByCourierSince(ctx, courierID, todayStart)
	if err != nil {
		return nil, err
	}
	return &domain.TipSummary{
		TotalTips:   count,
		TotalAmount: total,
		TodayAmount: todayAmount,
		TodayTips:   todayCount,
	}, nil
}
