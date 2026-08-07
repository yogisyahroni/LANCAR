package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"tembus/merchant-service/internal/domain"

	"github.com/google/uuid"
)

// merchantServiceImpl — implementasi domain.MerchantService.
type merchantServiceImpl struct {
	merchantRepo domain.MerchantRepository
	menuRepo     domain.MenuItemRepository
	orderRepo    domain.MerchantOrderRepository
}

func NewMerchantService(mr domain.MerchantRepository, mi domain.MenuItemRepository, or domain.MerchantOrderRepository) domain.MerchantService {
	return &merchantServiceImpl{merchantRepo: mr, menuRepo: mi, orderRepo: or}
}

// ─────────────────────────────────────────────
// Registrasi & Profil
// ─────────────────────────────────────────────

func (s *merchantServiceImpl) Register(ctx context.Context, userID string, req domain.RegisterMerchantRequest) (*domain.Merchant, error) {
	req.NamaToko = strings.TrimSpace(req.NamaToko)
	req.Alamat = strings.TrimSpace(req.Alamat)
	if req.NamaToko == "" {
		return nil, errors.New("nama_toko wajib diisi")
	}
	if req.Alamat == "" {
		return nil, errors.New("alamat wajib diisi")
	}
	if req.KtpPemilikURL == "" || req.FotoTokoURL == "" || req.RekeningURL == "" {
		return nil, errors.New("dokumen wajib: ktp_pemilik_url, foto_tempat_usaha_url, rekening_bank_url")
	}

	existing, err := s.merchantRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, errors.New("merchant sudah terdaftar")
	}

	m := &domain.Merchant{
		ID:                 uuid.New().String(),
		UserID:             userID,
		NamaToko:           req.NamaToko,
		Alamat:             req.Alamat,
		VerificationStatus: "pending", // default — wajib admin approve dulu (FOOD-BIKE-046)
		JamBuka:            req.JamBuka,
		JamTutup:           req.JamTutup,
	}
	if req.LokasiLat != nil {
		m.LokasiLat = req.LokasiLat
	}
	if req.LokasiLng != nil {
		m.LokasiLng = req.LokasiLng
	}

	docs := []domain.MerchantDocument{
		{DocType: "ktp_pemilik", FileURL: req.KtpPemilikURL},
		{DocType: "foto_tempat_usaha", FileURL: req.FotoTokoURL},
		{DocType: "rekening_bank", FileURL: req.RekeningURL},
	}
	if req.NibURL != nil && *req.NibURL != "" {
		docs = append(docs, domain.MerchantDocument{DocType: "nib", FileURL: *req.NibURL})
	}

	if err := s.merchantRepo.Create(ctx, m, docs); err != nil {
		return nil, err
	}
	return m, nil
}

func (s *merchantServiceImpl) GetProfile(ctx context.Context, userID string) (*domain.Merchant, error) {
	return s.merchantRepo.GetByUserID(ctx, userID)
}

func (s *merchantServiceImpl) UpdateProfile(ctx context.Context, userID string, req domain.UpdateMerchantRequest) (*domain.Merchant, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if req.NamaToko != nil {
		m.NamaToko = *req.NamaToko
	}
	if req.Alamat != nil {
		m.Alamat = *req.Alamat
	}
	if req.LokasiLat != nil {
		m.LokasiLat = req.LokasiLat
	}
	if req.LokasiLng != nil {
		m.LokasiLng = req.LokasiLng
	}
	if req.JamBuka != nil {
		m.JamBuka = req.JamBuka
	}
	if req.JamTutup != nil {
		m.JamTutup = req.JamTutup
	}
	if err := s.merchantRepo.Update(ctx, m); err != nil {
		return nil, err
	}
	return s.merchantRepo.GetByID(ctx, m.ID)
}

func (s *merchantServiceImpl) ToggleOpen(ctx context.Context, userID string, isOpen bool) (*domain.Merchant, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if m.VerificationStatus != "approved" {
		return nil, errors.New("merchant belum disetujui — tidak bisa buka toko")
	}
	if err := s.merchantRepo.ToggleOpen(ctx, m.ID, isOpen); err != nil {
		return nil, err
	}
	return s.merchantRepo.GetByID(ctx, m.ID)
}

// requireMerchant memastikan user punya merchant & return merchant-nya.
func (s *merchantServiceImpl) requireMerchant(ctx context.Context, userID string) (*domain.Merchant, error) {
	m, err := s.merchantRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, errors.New("merchant tidak ditemukan — daftar dulu")
	}
	return m, nil
}

// ─────────────────────────────────────────────
// Menu
// ─────────────────────────────────────────────

func (s *merchantServiceImpl) CreateMenuItem(ctx context.Context, userID string, req domain.CreateMenuItemRequest) (*domain.MenuItem, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if m.VerificationStatus != "approved" {
		return nil, errors.New("merchant belum disetujui")
	}
	req.Nama = strings.TrimSpace(req.Nama)
	if req.Nama == "" {
		return nil, errors.New("nama menu wajib diisi")
	}
	if req.Harga <= 0 {
		return nil, errors.New("harga harus lebih dari 0")
	}
	if req.PrepTimeMinutes <= 0 {
		req.PrepTimeMinutes = 15 // default prep time
	}
	available := true
	if req.IsAvailable != nil {
		available = *req.IsAvailable
	}

	item := &domain.MenuItem{
		ID:              uuid.New().String(),
		MerchantID:      m.ID,
		Nama:            req.Nama,
		Harga:           req.Harga,
		Foto:            req.Foto,
		Kategori:        strings.TrimSpace(req.Kategori),
		PrepTimeMinutes: req.PrepTimeMinutes,
		IsAvailable:     available,
	}
	if err := s.menuRepo.Create(ctx, item); err != nil {
		return nil, err
	}
	return item, nil
}

func (s *merchantServiceImpl) UpdateMenuItem(ctx context.Context, userID string, itemID string, req domain.UpdateMenuItemRequest) (*domain.MenuItem, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	item, err := s.menuRepo.GetByID(ctx, itemID)
	if err != nil {
		return nil, err
	}
	if item == nil || item.MerchantID != m.ID {
		return nil, errors.New("menu item tidak ditemukan")
	}

	if req.Nama != nil {
		item.Nama = *req.Nama
	}
	if req.Harga != nil {
		if *req.Harga <= 0 {
			return nil, errors.New("harga harus lebih dari 0")
		}
		item.Harga = *req.Harga
	}
	if req.Foto != nil {
		item.Foto = req.Foto
	}
	if req.Kategori != nil {
		item.Kategori = *req.Kategori
	}
	if req.PrepTimeMinutes != nil {
		item.PrepTimeMinutes = *req.PrepTimeMinutes
	}
	if req.IsAvailable != nil {
		item.IsAvailable = *req.IsAvailable
	}

	if err := s.menuRepo.Update(ctx, item); err != nil {
		return nil, err
	}
	return s.menuRepo.GetByID(ctx, itemID)
}

func (s *merchantServiceImpl) DeleteMenuItem(ctx context.Context, userID string, itemID string) error {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return err
	}
	return s.menuRepo.Delete(ctx, itemID, m.ID)
}

func (s *merchantServiceImpl) SetMenuItemAvailability(ctx context.Context, userID string, itemID string, available bool) (*domain.MenuItem, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if err := s.menuRepo.SetAvailability(ctx, itemID, m.ID, available); err != nil {
		return nil, err
	}
	return s.menuRepo.GetByID(ctx, itemID)
}

func (s *merchantServiceImpl) ListMenuItems(ctx context.Context, userID string, page, pageSize int) ([]*domain.MenuItem, int, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 50
	}
	offset := (page - 1) * pageSize
	items, err := s.menuRepo.ListByMerchant(ctx, m.ID, pageSize, offset)
	if err != nil {
		return nil, 0, err
	}
	total, err := s.menuRepo.CountByMerchant(ctx, m.ID)
	if err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// ─────────────────────────────────────────────
// Order Action (FOOD-BIKE-017/021)
// ─────────────────────────────────────────────

// AcceptOrder: merchant menyetujui order food. Status → preparing,
// merchant_accepted_at = NOW(). Order harus milik merchant & status pending_merchant.
func (s *merchantServiceImpl) AcceptOrder(ctx context.Context, userID string, orderID string) error {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return err
	}
	return s.orderRepo.AcceptOrder(ctx, m.ID, orderID)
}

// RejectOrder: merchant menolak order food. Status → cancelled + reason.
// FB-081: setelah tolak sukses → catat order_event + trigger refund 100%
// otomatis (pending_merchant = free window). Refund fire-and-forget ke
// order-service — kegagalan HTTP tidak menggagalkan reject (bisa di-trigger
// ulang manual oleh admin via /internal/refunds/process).
func (s *merchantServiceImpl) RejectOrder(ctx context.Context, userID string, orderID string, reason string) error {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return err
	}
	if strings.TrimSpace(reason) == "" {
		return errors.New("reason wajib diisi saat menolak order")
	}
	if err := s.orderRepo.RejectOrder(ctx, m.ID, orderID, reason); err != nil {
		return err
	}

	// Jejak pembatalan utk customer/tracking
	if evErr := s.orderRepo.RecordOrderEvent(ctx, orderID, "cancelled", "Pesanan ditolak merchant: "+reason); evErr != nil {
		log.Printf("[MerchantService] RejectOrder: gagal catat order_events utk %s: %v", orderID, evErr)
	}

	// Refund otomatis (async, non-blocking)
	go s.triggerRefundOnMerchantReject(orderID, reason)
	// FB-084: notif push customer (async, non-blocking)
	go s.notifyCustomerRejected(orderID, reason)
	return nil
}

// triggerRefundOnMerchantReject — FB-081: panggil order-service
// /api/v1/internal/refunds/process dengan original_status=pending_merchant
// (free window → refund 100%). Pola sama dgn cancel customer di admin-service.
func (s *merchantServiceImpl) triggerRefundOnMerchantReject(orderID, reason string) {
	orderServiceURL := strings.TrimSpace(os.Getenv("ORDER_SERVICE_URL"))
	if orderServiceURL == "" {
		orderServiceURL = "http://order-service:8080"
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"order_id":                  orderID,
		"reason":                    "Pesanan ditolak merchant: " + reason,
		"original_status":           "pending_merchant",
		"charge_cancellation_fee_to": "merchant", // FB-082: fee jadi piutang merchant
	})

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		orderServiceURL+"/api/v1/internal/refunds/process", bytes.NewReader(payload))
	if err != nil {
		log.Printf("[MerchantService] RejectOrder: gagal buat request refund %s: %v", orderID, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Api-Key", os.Getenv("INTERNAL_API_KEY"))

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[MerchantService] RejectOrder: gagal reach order-service utk refund %s: %v", orderID, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		log.Printf("[MerchantService] RejectOrder: refund %s gagal (status %d): %s", orderID, resp.StatusCode, string(body))
	}
}

// notifyCustomerRejected — FB-084: kirim push notification ke customer bahwa
// pesanannya ditolak merchant. Panggil order-service
// /api/v1/internal/push/order-cancelled (fire-and-forget, non-blocking —
// dipanggil dari goroutine; kegagalan hanya di-log, tidak menggagalkan flow).
func (s *merchantServiceImpl) notifyCustomerRejected(orderID, reason string) {
	orderServiceURL := strings.TrimSpace(os.Getenv("ORDER_SERVICE_URL"))
	if orderServiceURL == "" {
		orderServiceURL = "http://order-service:8080"
	}
	message := "Pesanan dibatalkan oleh merchant"
	if reason != "" {
		message = "Pesanan dibatalkan merchant: " + reason
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"order_id": orderID,
		"message":  message,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		orderServiceURL+"/api/v1/internal/push/order-cancelled", bytes.NewReader(payload))
	if err != nil {
		log.Printf("[MerchantService] RejectOrder: gagal buat request push %s: %v", orderID, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Api-Key", os.Getenv("INTERNAL_API_KEY"))

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[MerchantService] RejectOrder: gagal reach order-service utk push %s: %v", orderID, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		log.Printf("[MerchantService] RejectOrder: push %s gagal (status %d): %s", orderID, resp.StatusCode, string(body))
	}
}

func (s *merchantServiceImpl) ListOrders(ctx context.Context, userID string, status string, page, pageSize int) ([]*domain.MerchantOrderView, int, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 50
	}
	offset := (page - 1) * pageSize

	// Validasi status filter — hanya status yang sah
	allowed := map[string]bool{
		"": true, "pending_merchant": true, "preparing": true, "searching": true,
		"accepted": true, "picking_up": true, "picked_up": true, "delivering": true,
		"delivered": true, "cancelled_by_merchant": true, "cancelled": true,
	}
	if !allowed[status] {
		return nil, 0, fmt.Errorf("status filter tidak dikenal: %s", status)
	}

	rows, err := s.orderRepo.ListByMerchant(ctx, m.ID, status, pageSize, offset)
	if err != nil {
		return nil, 0, err
	}
	total, err := s.orderRepo.CountByMerchant(ctx, m.ID, status)
	if err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}
