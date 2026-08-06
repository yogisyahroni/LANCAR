package service

import (
	"context"
	"fmt"
	"log/slog"

	"tembus/order-service/internal/domain"

	"github.com/google/uuid"
)

// ============================================================
// FOOD-BIKE-064 — Push Service
// Kirim notifikasi FCM ke owner merchant saat order food baru masuk
// (status pending_merchant). SLA merchant 3 menit (FOOD-BIKE-022)
// — merchant harus tahu order masuk secepat mungkin, walau app di background.
// Non-fatal: gagal kirim hanya dilog, tidak menggagalkan order.
// ============================================================

type pushService struct {
	deviceTokenRepo domain.DeviceTokenRepository
	orderRepo       domain.OrderRepository
}

func NewPushService(dtr domain.DeviceTokenRepository, or domain.OrderRepository) domain.PushService {
	return &pushService{deviceTokenRepo: dtr, orderRepo: or}
}

func (s *pushService) NotifyMerchantNewOrder(ctx context.Context, orderID string) error {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return fmt.Errorf("get order %s: %w", orderID, err)
	}
	if order.MerchantID == nil || *order.MerchantID == "" {
		return nil // bukan order food — skip
	}

	ownerID, err := s.deviceTokenRepo.GetMerchantOwnerUserID(ctx, *order.MerchantID)
	if err != nil {
		return fmt.Errorf("resolve merchant owner: %w", err)
	}

	tokens, err := s.deviceTokenRepo.GetDeviceTokensByUserIDs(ctx, []uuid.UUID{ownerID})
	if err != nil {
		return fmt.Errorf("get device tokens: %w", err)
	}
	devices := tokens[ownerID]
	if len(devices) == 0 {
		slog.Info("push_merchant_no_device", "merchant_id", *order.MerchantID, "order_id", orderID)
		return nil
	}

	data := map[string]string{
		"type":        "new_food_order",
		"order_id":    orderID,
		"order_no":    order.OrderNumber,
		"merchant_id": *order.MerchantID,
	}

	sent := 0
	for _, token := range devices {
		if err := sendFCMPushNotification(token, data); err != nil {
			slog.Warn("push_merchant_failed", "order_id", orderID, "error", err)
			continue
		}
		sent++
	}
	slog.Info("push_merchant_sent", "order_id", orderID, "devices", sent)
	return nil
}
