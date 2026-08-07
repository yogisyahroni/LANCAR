package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"strings"
	"time"

	"tembus/merchant-service/internal/domain"
)

// ─────────────────────────────────────────────
// Edit Order (FB-087) — merchant mengubah item order sebelum konfirmasi.
// Grab pattern: nilai baru TIDAK boleh melebihi nilai order awal
// (auto-approve bila turun; naik = tolak). Notif push ke customer.
// ─────────────────────────────────────────────

// EditOrderItems — ganti/tambah/hapus item order food saat status
// pending_merchant. Harga dihitung ulang server-side dari menu SEKARANG
// (zero-trust, jangan percaya harga dari client).
func (s *merchantServiceImpl) EditOrderItems(ctx context.Context, userID, orderID string, req domain.EditOrderItemsRequest) (*domain.EditOrderResult, error) {
	m, err := s.merchantRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, errors.New("merchant belum terdaftar")
	}
	if m.VerificationStatus != "approved" {
		return nil, errors.New("merchant belum disetujui")
	}

	if len(req.Items) == 0 {
		return nil, errors.New("items wajib diisi")
	}

	// 1. Ambil order (wajib pending_merchant, milik merchant ini)
	edit, err := s.orderRepo.GetOrderForEdit(ctx, m.ID, orderID)
	if err != nil {
		return nil, err
	}

	// 2. Validasi + hitung subtotal baru dari menu SEKARANG (server-side)
	var newSubtotal int64
	snapshots := make([]domain.FoodOrderItemSnapshot, 0, len(req.Items))
	for _, it := range req.Items {
		if it.Quantity < 1 {
			return nil, fmt.Errorf("quantity untuk item %s harus minimal 1", it.MenuID)
		}
		menu, err := s.menuRepo.GetByID(ctx, it.MenuID)
		if err != nil {
			return nil, fmt.Errorf("menu item tidak ditemukan: %s", it.MenuID)
		}
		if menu == nil || menu.MerchantID != m.ID {
			return nil, fmt.Errorf("menu item bukan milik merchant ini: %s", it.MenuID)
		}
		if !menu.IsAvailable {
			return nil, fmt.Errorf("menu item tidak tersedia: %s", menu.Nama)
		}
		sub := menu.Harga * int64(it.Quantity)
		newSubtotal += sub
		snapshots = append(snapshots, domain.FoodOrderItemSnapshot{
			MenuItemID: menu.ID,
			ItemName:   menu.Nama,
			ItemPrice:  menu.Harga,
			Quantity:   it.Quantity,
			Notes:      it.Notes,
			Subtotal:   sub,
		})
	}

	// 3. Nilai baru TIDAK boleh melebihi nilai order awal (Grab pattern)
	if newSubtotal > edit.SubtotalOldIDR {
		return nil, fmt.Errorf("nilai pesanan tidak boleh melebihi nilai awal (%d), edit dibatalkan", edit.SubtotalOldIDR)
	}

	// 4. Hitung ulang platform fee + total (rumus CreateFoodOrder)
	platformFeePct := edit.PlatformFeePct
	if platformFeePct <= 0 {
		platformFeePct = 10
	}
	newPlatformFee := int64(math.Round(float64(newSubtotal) * platformFeePct / 100))
	newTotal := newSubtotal + edit.DeliveryFeeIDR + newPlatformFee - edit.DiscountIDR
	if newTotal < 0 {
		newTotal = 0
	}

	// 5. Replace items + harga dalam satu transaksi
	if err := s.orderRepo.ReplaceOrderItems(ctx, orderID, snapshots, newSubtotal, newPlatformFee, newTotal); err != nil {
		return nil, err
	}

	// 6. Jejak tracking + notif customer (fire-and-forget, log-only)
	_ = s.orderRepo.RecordOrderEvent(ctx, orderID, "order_updated", "Item pesanan diubah oleh merchant")
	go s.notifyCustomerOrderUpdated(orderID, fmt.Sprintf("Pesanan Anda diubah oleh merchant — total baru Rp %d", newTotal))

	return &domain.EditOrderResult{
		OrderID:        orderID,
		SubtotalIDR:    newSubtotal,
		PlatformFeeIDR: newPlatformFee,
		TotalIDR:       newTotal,
	}, nil
}

// notifyCustomerOrderUpdated — FB-087: kirim push ke customer bahwa item
// pesanannya diubah merchant. Panggil order-service
// /api/v1/internal/push/order-updated (fire-and-forget; kegagalan log-only,
// tidak menggagalkan edit order).
func (s *merchantServiceImpl) notifyCustomerOrderUpdated(orderID, message string) {
	orderServiceURL := strings.TrimSpace(os.Getenv("ORDER_SERVICE_URL"))
	if orderServiceURL == "" {
		orderServiceURL = "http://order-service:8080"
	}
	payload, _ := json.Marshal(map[string]string{
		"order_id": orderID,
		"message":  message,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		orderServiceURL+"/api/v1/internal/push/order-updated", bytes.NewReader(payload))
	if err != nil {
		log.Printf("[MerchantService] EditOrderItems: gagal buat request push %s: %v", orderID, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Api-Key", os.Getenv("INTERNAL_API_KEY"))

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[MerchantService] EditOrderItems: gagal reach order-service utk push %s: %v", orderID, err)
		return
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		log.Printf("[MerchantService] EditOrderItems: push order-updated status %d utk %s", resp.StatusCode, orderID)
	}
}
