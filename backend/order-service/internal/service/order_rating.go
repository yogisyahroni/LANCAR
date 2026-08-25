package service

import (
	"context"
	"fmt"
	"tembus/order-service/internal/domain"

	"github.com/google/uuid"
)

// Auto-generated split of orderServiceImpl methods (god-file refactor).
func (s *orderServiceImpl) SubmitRating(ctx context.Context, customerID string, orderID string, req domain.SubmitRatingRequest) error {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return domain.ErrNotFound
	}

	// Security: pastikan order milik customer yang sedang login
	if order.CustomerID != customerID {
		return domain.ErrForbidden
	}

	// Validasi status: hanya order yang sudah delivered yang bisa di-rating
	if order.Status != domain.StatusDelivered {
		return fmt.Errorf("rating hanya bisa diberikan untuk order yang sudah terkirim (status: %s)", order.Status)
	}

	// Idempotency: cegah double rating
	if order.CourierRating != nil {
		return domain.ErrConflict
	}

	// Validasi range rating
	if req.Rating < 1.0 || req.Rating > 5.0 {
		return fmt.Errorf("rating harus antara 1 sampai 5 bintang")
	}

	courierID := ""
	if order.CourierID != nil {
		courierID = *order.CourierID
	}
	if courierID == "" {
		return fmt.Errorf("order tidak memiliki data kurir")
	}

	// Simpan rating ke DB, update avg_rating kurir secara atomik
	return s.orderRepo.SaveOrderRating(ctx, orderID, courierID, req.Rating, req.Comment)
}

func (s *orderServiceImpl) SubmitMerchantRating(ctx context.Context, customerID string, orderID string, req domain.SubmitRatingRequest) error {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return domain.ErrNotFound
	}

	// Security: pastikan order milik customer yang sedang login
	if order.CustomerID != customerID {
		return domain.ErrForbidden
	}

	// Validasi status: hanya order delivered yang bisa di-rating
	if order.Status != domain.StatusDelivered {
		return fmt.Errorf("rating hanya bisa diberikan untuk order yang sudah terkirim (status: %s)", order.Status)
	}

	// Validasi range rating
	if req.Rating < 1.0 || req.Rating > 5.0 {
		return fmt.Errorf("rating harus antara 1 sampai 5 bintang")
	}

	// Order food harus punya merchant
	if order.MerchantID == nil || *order.MerchantID == "" {
		return fmt.Errorf("order tidak memiliki data merchant")
	}

	return s.orderRepo.SaveMerchantRating(ctx, orderID, *order.MerchantID, customerID, req.Rating, req.Comment)
}

func (s *orderServiceImpl) GetOrdersNeedingRatingReminder(ctx context.Context, customerID string) ([]*domain.Order, error) {
	const maxReminder = 4
	const reminderIntervalHours = 12
	return s.orderRepo.GetDeliveredUnratedOrders(ctx, customerID, maxReminder, reminderIntervalHours)
}

func (s *orderServiceImpl) GetCourierPerformanceStats(ctx context.Context, courierID string) (*domain.CourierPerformanceStats, error) {
	uuidID, err := uuid.Parse(courierID)
	if err != nil {
		return nil, err
	}
	return s.relayRepo.GetCourierPerformanceStats(ctx, uuidID)
}
