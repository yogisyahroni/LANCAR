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

// ============================================================
// FB-124 — Perluasan cakupan push notification
// Sebelumnya hanya 3 event (order baru ke merchant, cancel & update ke
// customer). Tambah 6 event transisi status: customer tahu progress
// (merchant accept, driver assigned, pickup, delivered) dan merchant tahu
// serah terima (pickup, delivered). Data-only push; app render sendiri.
// Semua non-fatal: tanpa device / gagal kirim hanya di-log.
// ============================================================

// resolveOrder — helper: fetch order by ID (nil-safe).
func (s *pushService) resolveOrder(ctx context.Context, orderID string) (*domain.Order, error) {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return nil, fmt.Errorf("get order %s: %w", orderID, err)
	}
	if order == nil {
		return nil, fmt.Errorf("order %s tidak ditemukan", orderID)
	}
	return order, nil
}

// sendToCustomer — helper: kirim push data-only ke semua device customer.
func (s *pushService) sendToCustomer(ctx context.Context, order *domain.Order, data map[string]string) error {
	customerUUID, err := uuid.Parse(order.CustomerID)
	if err != nil {
		return fmt.Errorf("order %s customer_id invalid: %w", order.ID, err)
	}

	tokens, err := s.deviceTokenRepo.GetDeviceTokensByUserIDs(ctx, []uuid.UUID{customerUUID})
	if err != nil {
		return fmt.Errorf("get device tokens: %w", err)
	}
	devices := tokens[customerUUID]
	if len(devices) == 0 {
		slog.Info("push_customer_no_device", "order_id", order.ID, "customer_id", order.CustomerID)
		return nil
	}

	sent := 0
	for _, token := range devices {
		if err := sendFCMPushNotification(token, data); err != nil {
			slog.Warn("push_customer_failed", "order_id", order.ID, "error", err)
			continue
		}
		sent++
	}
	slog.Info("push_customer_sent", "order_id", order.ID, "type", data["type"], "devices", sent)
	return nil
}

// sendToMerchant — helper: kirim push data-only ke semua device owner merchant.
// Order tanpa merchant_id (parcel biasa) di-skip diam-diam.
func (s *pushService) sendToMerchant(ctx context.Context, order *domain.Order, data map[string]string) error {
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
		slog.Info("push_merchant_no_device", "merchant_id", *order.MerchantID, "order_id", order.ID)
		return nil
	}

	sent := 0
	for _, token := range devices {
		if err := sendFCMPushNotification(token, data); err != nil {
			slog.Warn("push_merchant_failed", "order_id", order.ID, "error", err)
			continue
		}
		sent++
	}
	slog.Info("push_merchant_sent", "order_id", order.ID, "type", data["type"], "devices", sent)
	return nil
}

// NotifyCustomerMerchantAccepted — FB-124: merchant menerima pesanan food
// (pending_merchant → preparing). Type "merchant_accepted".
func (s *pushService) NotifyCustomerMerchantAccepted(ctx context.Context, orderID string, message string) error {
	order, err := s.resolveOrder(ctx, orderID)
	if err != nil {
		return err
	}
	return s.sendToCustomer(ctx, order, map[string]string{
		"type":     "merchant_accepted",
		"order_id": orderID,
		"order_no": order.OrderNumber,
		"reason":   message,
	})
}

// NotifyCustomerDriverAssigned — FB-124: driver sudah di-assign
// (searching → accepted). Type "driver_assigned".
func (s *pushService) NotifyCustomerDriverAssigned(ctx context.Context, orderID string, message string) error {
	order, err := s.resolveOrder(ctx, orderID)
	if err != nil {
		return err
	}
	return s.sendToCustomer(ctx, order, map[string]string{
		"type":     "driver_assigned",
		"order_id": orderID,
		"order_no": order.OrderNumber,
		"reason":   message,
	})
}

// NotifyCustomerPickedUp — FB-124: pesanan diambil driver dari merchant
// (accepted → picked_up). Type "picked_up".
func (s *pushService) NotifyCustomerPickedUp(ctx context.Context, orderID string, message string) error {
	order, err := s.resolveOrder(ctx, orderID)
	if err != nil {
		return err
	}
	return s.sendToCustomer(ctx, order, map[string]string{
		"type":     "picked_up",
		"order_id": orderID,
		"order_no": order.OrderNumber,
		"reason":   message,
	})
}

// NotifyCustomerDelivered — FB-124: pesanan sudah diantar
// (delivering → delivered). Type "delivered".
func (s *pushService) NotifyCustomerDelivered(ctx context.Context, orderID string, message string) error {
	order, err := s.resolveOrder(ctx, orderID)
	if err != nil {
		return err
	}
	return s.sendToCustomer(ctx, order, map[string]string{
		"type":     "delivered",
		"order_id": orderID,
		"order_no": order.OrderNumber,
		"reason":   message,
	})
}

// NotifyMerchantPickedUp — FB-124: konfirmasi serah terima ke merchant
// bahwa driver sudah mengambil pesanan. Type "merchant_picked_up".
func (s *pushService) NotifyMerchantPickedUp(ctx context.Context, orderID string, message string) error {
	order, err := s.resolveOrder(ctx, orderID)
	if err != nil {
		return err
	}
	return s.sendToMerchant(ctx, order, map[string]string{
		"type":     "merchant_picked_up",
		"order_id": orderID,
		"order_no": order.OrderNumber,
		"reason":   message,
	})
}

// NotifyMerchantDelivered — FB-124: pesanan sudah diantar ke customer.
// Type "merchant_delivered".
func (s *pushService) NotifyMerchantDelivered(ctx context.Context, orderID string, message string) error {
	order, err := s.resolveOrder(ctx, orderID)
	if err != nil {
		return err
	}
	return s.sendToMerchant(ctx, order, map[string]string{
		"type":     "merchant_delivered",
		"order_id": orderID,
		"order_no": order.OrderNumber,
		"reason":   message,
	})
}
