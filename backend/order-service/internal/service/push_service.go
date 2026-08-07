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

// NotifyCustomerOrderCancelled — FB-084: kirim push ke customer saat order
// dibatalkan karena KESALAHAN MERCHANT (reject / timeout respon 3 menit).
// Data-only push: type "order_cancelled" + order_no + reason; app customer
// render notifikasi sendiri. Non-fatal: tidak ada device / gagal kirim
// hanya di-log.
func (s *pushService) NotifyCustomerOrderCancelled(ctx context.Context, orderID string, message string) error {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return fmt.Errorf("get order %s: %w", orderID, err)
	}
	if order == nil {
		return fmt.Errorf("order %s tidak ditemukan", orderID)
	}

	customerUUID, err := uuid.Parse(order.CustomerID)
	if err != nil {
		return fmt.Errorf("order %s customer_id invalid: %w", orderID, err)
	}

	tokens, err := s.deviceTokenRepo.GetDeviceTokensByUserIDs(ctx, []uuid.UUID{customerUUID})
	if err != nil {
		return fmt.Errorf("get device tokens: %w", err)
	}
	devices := tokens[customerUUID]
	if len(devices) == 0 {
		slog.Info("push_customer_no_device", "order_id", orderID, "customer_id", order.CustomerID)
		return nil
	}

	data := map[string]string{
		"type":     "order_cancelled",
		"order_id": orderID,
		"order_no": order.OrderNumber,
		"reason":   message,
	}

	sent := 0
	for _, token := range devices {
		if err := sendFCMPushNotification(token, data); err != nil {
			slog.Warn("push_customer_order_cancelled_failed", "order_id", orderID, "error", err)
			continue
		}
		sent++
	}
	slog.Info("push_customer_order_cancelled_sent", "order_id", orderID, "devices", sent)
	return nil
}

// NotifyCustomerOrderUpdated — FB-087: kirim push ke customer saat merchant
// mengubah item order sebelum konfirmasi (pending_merchant). Data-only push:
// type "order_updated" + order_no + reason. Non-fatal: tidak ada device /
// gagal kirim hanya di-log (pola NotifyCustomerOrderCancelled).
func (s *pushService) NotifyCustomerOrderUpdated(ctx context.Context, orderID string, message string) error {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return fmt.Errorf("get order %s: %w", orderID, err)
	}
	if order == nil {
		return fmt.Errorf("order %s tidak ditemukan", orderID)
	}

	customerUUID, err := uuid.Parse(order.CustomerID)
	if err != nil {
		return fmt.Errorf("order %s customer_id invalid: %w", orderID, err)
	}

	tokens, err := s.deviceTokenRepo.GetDeviceTokensByUserIDs(ctx, []uuid.UUID{customerUUID})
	if err != nil {
		return fmt.Errorf("get device tokens: %w", err)
	}
	devices := tokens[customerUUID]
	if len(devices) == 0 {
		slog.Info("push_customer_no_device", "order_id", orderID, "customer_id", order.CustomerID)
		return nil
	}

	data := map[string]string{
		"type":     "order_updated",
		"order_id": orderID,
		"order_no": order.OrderNumber,
		"reason":   message,
	}

	sent := 0
	for _, token := range devices {
		if err := sendFCMPushNotification(token, data); err != nil {
			slog.Warn("push_customer_order_updated_failed", "order_id", orderID, "error", err)
			continue
		}
		sent++
	}
	slog.Info("push_customer_order_updated_sent", "order_id", orderID, "devices", sent)
	return nil
}
