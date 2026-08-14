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
	reportRepo   domain.MerchantReportRepository
}

func NewMerchantService(mr domain.MerchantRepository, mi domain.MenuItemRepository, or domain.MerchantOrderRepository, rr domain.MerchantReportRepository) domain.MerchantService {
	return &merchantServiceImpl{merchantRepo: mr, menuRepo: mi, orderRepo: or, reportRepo: rr}
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
	// X1: business_type wajib valid kalau dikirim (default 'perorangan').
	bt, err := domain.NormalizeBusinessType(req.BusinessType)
	if err != nil {
		return nil, err
	}
	// FB-094: lokasi toko WAJIB saat daftar (pin di peta di web/Android).
	// Tanpa lokasi: ongkir food salah, "resto terdekat" tidak muncul, approve ditolak admin.
	if req.LokasiLat == nil || req.LokasiLng == nil {
		return nil, errors.New("lokasi toko wajib diisi (lokasi_lat, lokasi_lng) — tandai pin di peta")
	}
	if *req.LokasiLat < -90 || *req.LokasiLat > 90 || *req.LokasiLng < -180 || *req.LokasiLng > 180 {
		return nil, errors.New("lokasi toko tidak valid — periksa kembali pin di peta")
	}
	if *req.LokasiLat == 0 && *req.LokasiLng == 0 {
		return nil, errors.New("lokasi toko tidak valid (0,0) — tandai pin di peta")
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
		BusinessType:       bt, // X1: 'perorangan'|'perusahaan'
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

	// Dokumen pangan opsional saat daftar (FB-092 / ADR 003) — bukan gate.
	foodDocs, err := s.buildFoodDocs(&m, domain.UpdateFoodDocsRequest{
		HalalCertNumber:    req.HalalCertNumber,
		HalalExpiryDate:    req.HalalExpiryDate,
		SertifikatHalalURL: req.SertifikatHalalURL,
		SppIrtNumber:       req.SppIrtNumber,
		SppIrtExpiryDate:   req.SppIrtExpiryDate,
		SppIrtURL:          req.SppIrtURL,
		BpomNumber:         req.BpomNumber,
		BpomExpiryDate:     req.BpomExpiryDate,
		IzinEdarBPOMURL:    req.IzinEdarBPOMURL,
		HalalStatus:        req.HalalStatus,
	})
	if err != nil {
		return nil, err
	}
	docs = append(docs, foodDocs...)

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
	// FB-109: minimum subtotal order — 0 = tanpa batas minimum.
	if req.MinOrderIDR != nil {
		if *req.MinOrderIDR < 0 {
			return nil, errors.New("min_order_idr tidak boleh negatif")
		}
		m.MinOrderIDR = *req.MinOrderIDR
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
	// ADR 003: dokumen pangan (halal/SPP-IRT/BPOM) TIDAK lagi jadi gate buka
	// toko — semua status halal boleh buka. Label/filter di sisi customer.
	if err := s.merchantRepo.ToggleOpen(ctx, m.ID, isOpen); err != nil {
		return nil, err
	}
	return s.merchantRepo.GetByID(ctx, m.ID)
}

// Pause (FB-107): pause sementara — merchant tidak terima order baru sampai
// `until`. Auto un-pause oleh order-service (cek paused_until < NOW()).
// Tidak mengubah is_open maupun jam operasional.
func (s *merchantServiceImpl) Pause(ctx context.Context, userID string, until time.Time) (*domain.Merchant, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if m.VerificationStatus != "approved" {
		return nil, errors.New("merchant belum disetujui")
	}
	if until.Before(time.Now()) {
		return nil, errors.New("waktu pause harus di masa depan")
	}
	if err := s.merchantRepo.SetPaused(ctx, m.ID, &until); err != nil {
		return nil, err
	}
	return s.merchantRepo.GetByID(ctx, m.ID)
}

// Resume (FB-107): batalkan pause sementara lebih awal.
func (s *merchantServiceImpl) Resume(ctx context.Context, userID string) (*domain.Merchant, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if err := s.merchantRepo.SetPaused(ctx, m.ID, nil); err != nil {
		return nil, err
	}
	return s.merchantRepo.GetByID(ctx, m.ID)
}

// UpdateFoodDocs — FB-092 + ADR 003: update nomor + masa berlaku dokumen
// pangan. Patch semantics: hanya field yang diisi yang diperbarui; field yang
// tidak diisi dipertahankan dari data lama. SEMUA dokumen OPSIONAL (soft-gate)
// — validasi format hanya untuk nilai yang dikirim eksplisit di request ini.
func (s *merchantServiceImpl) UpdateFoodDocs(ctx context.Context, userID string, req domain.UpdateFoodDocsRequest) (*domain.Merchant, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Validasi hanya nilai yang dikirim eksplisit (nomor baru → format + expiry future).
	if req.HalalCertNumber != nil && *req.HalalCertNumber != "" {
		if err := validateHalalNumber(*req.HalalCertNumber); err != nil {
			return nil, err
		}
		if req.HalalExpiryDate == nil || *req.HalalExpiryDate == "" {
			return nil, errors.New("halal_expiry_date wajib diisi jika halal_cert_number diisi")
		}
		if err := validateFutureDate(*req.HalalExpiryDate, "halal_expiry_date"); err != nil {
			return nil, err
		}
	}
	if req.SppIrtNumber != nil && *req.SppIrtNumber != "" {
		if err := validateSppIrtNumber(*req.SppIrtNumber); err != nil {
			return nil, err
		}
		if req.SppIrtExpiryDate == nil || *req.SppIrtExpiryDate == "" {
			return nil, errors.New("spp_irt_expiry_date wajib diisi jika spp_irt_number diisi")
		}
		if err := validateFutureDate(*req.SppIrtExpiryDate, "spp_irt_expiry_date"); err != nil {
			return nil, err
		}
	}
	if req.BpomNumber != nil && *req.BpomNumber != "" {
		if err := validateBpomNumber(*req.BpomNumber); err != nil {
			return nil, err
		}
		if req.BpomExpiryDate == nil || *req.BpomExpiryDate == "" {
			return nil, errors.New("bpom_expiry_date wajib diisi jika bpom_number diisi")
		}
		if err := validateFutureDate(*req.BpomExpiryDate, "bpom_expiry_date"); err != nil {
			return nil, err
		}
	}
	if req.HalalStatus != nil {
		st := *req.HalalStatus
		if st != "non_halal" && st != "unknown" {
			return nil, errors.New("halal_status tidak valid (non_halal | unknown)")
		}
	}

	// Patch: gabungkan nilai lama + baru (request menang kalau diisi)
	merged := domain.UpdateFoodDocsRequest{
		HalalCertNumber:    m.HalalCertNumber,
		HalalExpiryDate:    m.HalalExpiryDate,
		SppIrtNumber:       m.SppIrtNumber,
		SppIrtExpiryDate:   m.SppIrtExpiryDate,
		BpomNumber:         m.BpomNumber,
		BpomExpiryDate:     m.BpomExpiryDate,
		HalalStatus:        m.HalalStatusPtr(),
	}
	if req.HalalCertNumber != nil {
		merged.HalalCertNumber = req.HalalCertNumber
	}
	if req.HalalExpiryDate != nil {
		merged.HalalExpiryDate = req.HalalExpiryDate
	}
	if req.SppIrtNumber != nil {
		merged.SppIrtNumber = req.SppIrtNumber
	}
	if req.SppIrtExpiryDate != nil {
		merged.SppIrtExpiryDate = req.SppIrtExpiryDate
	}
	if req.BpomNumber != nil {
		merged.BpomNumber = req.BpomNumber
	}
	if req.BpomExpiryDate != nil {
		merged.BpomExpiryDate = req.BpomExpiryDate
	}
	if req.HalalStatus != nil {
		merged.HalalStatus = req.HalalStatus
	}

	docs, err := s.buildFoodDocs(&m, merged)
	if err != nil {
		return nil, err
	}
	if req.SertifikatHalalURL != nil && *req.SertifikatHalalURL != "" {
		docs = append(docs, domain.MerchantDocument{DocType: "sertifikat_halal", FileURL: *req.SertifikatHalalURL})
	}
	if req.SppIrtURL != nil && *req.SppIrtURL != "" {
		docs = append(docs, domain.MerchantDocument{DocType: "spp_irt", FileURL: *req.SppIrtURL})
	}
	if req.IzinEdarBPOMURL != nil && *req.IzinEdarBPOMURL != "" {
		docs = append(docs, domain.MerchantDocument{DocType: "izin_edar_bpom", FileURL: *req.IzinEdarBPOMURL})
	}

	if err := s.merchantRepo.UpdateFoodDocs(ctx, m, docs); err != nil {
		return nil, err
	}
	return s.merchantRepo.GetByID(ctx, m.ID)
}

// UpdateBankAccount — FB-114: update rekening bank merchant untuk payout.
// Semua field wajib. Rekening baru → bank_account_verified di-reset false
// sampai admin approve (verifikasi ulang).
func (s *merchantServiceImpl) UpdateBankAccount(ctx context.Context, userID string, req domain.UpdateBankAccountRequest) (*domain.Merchant, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	bankName := strings.TrimSpace(req.BankName)
	accountNumber := strings.TrimSpace(req.BankAccountNumber)
	accountHolder := strings.TrimSpace(req.BankAccountHolder)
	if bankName == "" || accountNumber == "" || accountHolder == "" {
		return nil, errors.New("bank_name, bank_account_number, dan bank_account_holder wajib diisi")
	}
	if len(accountNumber) < 5 || len(accountNumber) > 30 {
		return nil, errors.New("nomor rekening tidak valid (5-30 digit)")
	}
	// Rekening berubah? Kalau sama persis, jangan reset verifikasi.
	changed := m.BankName == nil || m.BankAccountNumber == nil ||
		bankName != *ptrOr(m.BankName, "") || accountNumber != *ptrOr(m.BankAccountNumber, "")
	if err := s.merchantRepo.UpdateBankAccount(ctx, m.ID, domain.UpdateBankAccountRequest{
		BankName:          bankName,
		BankAccountNumber: accountNumber,
		BankAccountHolder: accountHolder,
		RekeningBankURL:   req.RekeningBankURL,
	}, changed); err != nil {
		return nil, err
	}
	return s.merchantRepo.GetByID(ctx, m.ID)
}

// ptrOr — helper kecil: return isi pointer atau fallback string.
func ptrOr(p *string, fallback string) *string {
	if p == nil {
		return &fallback
	}
	return p
}

// buildFoodDocs — validasi + pasang field dokumen pangan ke merchant,
// return list MerchantDocument bukti (hanya doc_type yang punya nomor).
// ADR 003: SEMUA dokumen opsional. halal_status dihitung otomatis:
//   - nomor + expiry valid                → halal_certified
//   - tanpa nomor valid, HalalStatus non_halal → non_halal (nomor dibersihkan)
//   - selain itu                          → unknown (nomor dibersihkan)
func (s *merchantServiceImpl) buildFoodDocs(m **domain.Merchant, req domain.UpdateFoodDocsRequest) ([]domain.MerchantDocument, error) {
	mm := *m
	docs := []domain.MerchantDocument{}

	hasHalal := req.HalalCertNumber != nil && *req.HalalCertNumber != ""
	if hasHalal {
		mm.HalalCertNumber = req.HalalCertNumber
		mm.HalalExpiryDate = req.HalalExpiryDate
		if req.SertifikatHalalURL != nil && *req.SertifikatHalalURL != "" {
			docs = append(docs, domain.MerchantDocument{DocType: "sertifikat_halal", FileURL: *req.SertifikatHalalURL})
		}
	}

	hasSpp := req.SppIrtNumber != nil && *req.SppIrtNumber != ""
	if hasSpp {
		mm.SppIrtNumber = req.SppIrtNumber
		mm.SppIrtExpiryDate = req.SppIrtExpiryDate
		if req.SppIrtURL != nil && *req.SppIrtURL != "" {
			docs = append(docs, domain.MerchantDocument{DocType: "spp_irt", FileURL: *req.SppIrtURL})
		}
	}

	hasBpom := req.BpomNumber != nil && *req.BpomNumber != ""
	if hasBpom {
		mm.BpomNumber = req.BpomNumber
		mm.BpomExpiryDate = req.BpomExpiryDate
		if req.IzinEdarBPOMURL != nil && *req.IzinEdarBPOMURL != "" {
			docs = append(docs, domain.MerchantDocument{DocType: "izin_edar_bpom", FileURL: *req.IzinEdarBPOMURL})
		}
	}

	// ADR 003: tentukan status halal (nomor valid menang atas deklarasi).
	status := "unknown"
	if hasHalal && halalExpiryFuture(req.HalalExpiryDate) {
		status = "halal_certified"
	} else if req.HalalStatus != nil && *req.HalalStatus == "non_halal" {
		status = "non_halal"
	}
	// Status selain certified tidak boleh menyimpan nomor halal (konsisten
	// dengan label): badge hilang → data sertifikat dibersihkan.
	if status != "halal_certified" {
		mm.HalalCertNumber = nil
		mm.HalalExpiryDate = nil
	}
	mm.HalalStatus = status
	*m = mm
	return docs, nil
}

// halalExpiryFuture — true kalau expiry sertifikat halal di masa depan.
func halalExpiryFuture(expiry *string) bool {
	if expiry == nil || *expiry == "" {
		return false
	}
	d, err := time.Parse("2006-01-02", strings.TrimSpace(*expiry))
	if err != nil {
		return false
	}
	return !d.Before(time.Now().UTC())
}

// validateHalalNumber — nomor sertifikat halal BPJPH (alfanumerik, ≥8 char,
// sering diawali "ID…").
func validateHalalNumber(n string) error {
	n = strings.TrimSpace(n)
	if len(n) < 8 || len(n) > 64 {
		return errors.New("format halal_cert_number tidak valid (8–64 karakter alfanumerik)")
	}
	for _, c := range n {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-') {
			return errors.New("format halal_cert_number tidak valid (hanya huruf/angka/dash)")
		}
	}
	return nil
}

// validateSppIrtNumber — SPP-IRT wajib diawali "P-IRT" (PerBPOM 4/2024).
func validateSppIrtNumber(n string) error {
	n = strings.TrimSpace(n)
	if len(n) < 6 || len(n) > 64 {
		return errors.New("format spp_irt_number tidak valid")
	}
	if !strings.HasPrefix(strings.ToUpper(n), "P-IRT") {
		return errors.New("spp_irt_number harus diawali 'P-IRT' (contoh: P-IRT 1234567890123-2024)")
	}
	return nil
}

// validateBpomNumber — izin edar BPOM wajib diawali "MD" (pangan industri
// lokal) atau "ML" (impor), PerBPOM 4/2024.
func validateBpomNumber(n string) error {
	n = strings.TrimSpace(n)
	if len(n) < 5 || len(n) > 32 {
		return errors.New("format bpom_number tidak valid")
	}
	up := strings.ToUpper(n)
	if !strings.HasPrefix(up, "MD") && !strings.HasPrefix(up, "ML") {
		return errors.New("bpom_number harus diawali 'MD' atau 'ML' (contoh: MD 123456789012)")
	}
	return nil
}

// validateFutureDate — "YYYY-MM-DD" wajib valid & di masa depan.
func validateFutureDate(s, field string) error {
	d, err := time.Parse("2006-01-02", strings.TrimSpace(s))
	if err != nil {
		return fmt.Errorf("%s format tanggal tidak valid (YYYY-MM-DD)", field)
	}
	if d.Before(time.Now().UTC()) {
		return fmt.Errorf("%s tidak boleh di masa lalu", field)
	}
	return nil
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

// GetMenuItemVariants — FB-108: grup varian + opsi menu item milik merchant.
func (s *merchantServiceImpl) GetMenuItemVariants(ctx context.Context, userID string, itemID string) ([]*domain.MenuItemVariant, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	return s.menuRepo.GetVariantsByMenuItem(ctx, itemID, m.ID)
}

// ReplaceMenuItemVariants — FB-108: replace semua varian menu item.
// Validasi: nama wajib, opsi minimal 1, max_select >= min_select.
// Array kosong = hapus semua varian (kembali single-variant).
func (s *merchantServiceImpl) ReplaceMenuItemVariants(ctx context.Context, userID string, itemID string, req domain.ReplaceMenuItemVariantsRequest) ([]*domain.MenuItemVariant, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Normalisasi + validasi sebelum transaksi.
	groups := make([]*domain.MenuItemVariant, 0, len(req.Variants))
	seenNames := map[string]bool{}
	for _, g := range req.Variants {
		name := strings.TrimSpace(g.Nama)
		if name == "" {
			return nil, errors.New("nama varian wajib diisi")
		}
		if len(name) > 80 {
			return nil, errors.New("nama varian maksimal 80 karakter")
		}
		if seenNames[name] {
			return nil, fmt.Errorf("nama varian duplikat: %s", name)
		}
		seenNames[name] = true
		if len(g.Options) == 0 {
			return nil, fmt.Errorf("varian %q minimal punya 1 opsi", name)
		}
		minSel, maxSel := g.MinSelect, g.MaxSelect
		if maxSel < 1 {
			maxSel = 1
		}
		if maxSel > 10 {
			maxSel = 10
		}
		if minSel < 0 {
			minSel = 0
		}
		if minSel > maxSel {
			return nil, fmt.Errorf("min_select tidak boleh melebihi max_select di varian %q", name)
		}
		if g.IsRequired && minSel == 0 {
			minSel = 1 // varian wajib = minimal pilih 1
		}
		if len(g.Options) > 10 {
			return nil, fmt.Errorf("varian %q maksimal 10 opsi", name)
		}

		opts := make([]domain.MenuItemVariantOption, 0, len(g.Options))
		seenOpts := map[string]bool{}
		for _, o := range g.Options {
			optName := strings.TrimSpace(o.Nama)
			if optName == "" {
				return nil, errors.New("nama opsi wajib diisi")
			}
			if len(optName) > 80 {
				return nil, errors.New("nama opsi maksimal 80 karakter")
			}
			if seenOpts[optName] {
				return nil, fmt.Errorf("nama opsi duplikat di varian %q: %s", name, optName)
			}
			seenOpts[optName] = true
			if o.PriceDelta < 0 {
				return nil, fmt.Errorf("harga tambahan opsi %q tidak boleh negatif", optName)
			}
			opts = append(opts, domain.MenuItemVariantOption{
				Nama:       optName,
				PriceDelta: o.PriceDelta,
			})
		}
		groups = append(groups, &domain.MenuItemVariant{
			Nama:       name,
			IsRequired: g.IsRequired,
			MinSelect:  minSel,
			MaxSelect:  maxSel,
			Options:    opts,
		})
	}

	if err := s.menuRepo.ReplaceVariants(ctx, itemID, m.ID, groups); err != nil {
		return nil, err
	}
	return s.menuRepo.GetVariantsByMenuItem(ctx, itemID, m.ID)
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
	if err := s.orderRepo.AcceptOrder(ctx, m.ID, orderID); err != nil {
		return err
	}
	// FB-124: customer harus dapat notifikasi inbox saat merchant menerima order.
	// Non-blocking: accept tetap sukses walau delivery notif gagal.
	go s.notifyCustomerAccepted(orderID)
	return nil
}

// RejectOrder: merchant menolak order food. Status → cancelled + reason.
// FB-081: setelah tolak sukses → catat order_event + trigger refund 100%
// otomatis (pending_merchant = free window). Refund fire-and-forget ke
// order-service — kegagalan HTTP tidak menggagalkan reject (bisa di-trigger
// ulang manual oleh admin via /internal/refunds/process).
func (s *merchantServiceImpl) RejectOrder(ctx context.Context, userID string, orderID string, reason string, rejectReason string) error {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return err
	}
	// FB-122: reject_reason enum terstruktur. Label otomatis dari enum —
	// kalau merchant tidak kirim enum, fallback ke "lainnya".
	label := reason
	if code, ok := normalizeRejectReason(rejectReason); ok {
		rejectReason = code
		label = rejectReasonLabel(code)
		if strings.TrimSpace(reason) != "" && reason != label {
			label = label + " (" + reason + ")"
		}
	}
	if strings.TrimSpace(label) == "" {
		return errors.New("reason wajib diisi saat menolak order")
	}
	if err := s.orderRepo.RejectOrder(ctx, m.ID, orderID, label, rejectReason); err != nil {
		return err
	}
	// Jejak pembatalan utk customer/tracking
	if evErr := s.orderRepo.RecordOrderEvent(ctx, orderID, "cancelled", "Pesanan ditolak merchant: "+label); evErr != nil {
		log.Printf("[MerchantService] RejectOrder: gagal catat order_events utk %s: %v", orderID, evErr)
	}

	// Refund otomatis (async, non-blocking)
	go s.triggerRefundOnMerchantReject(orderID, label)
	// FB-084: notif push customer (async, non-blocking)
	go s.notifyCustomerRejected(orderID, label)
	return nil
}

// MarkReady: merchant menandai order sudah siap (masak selesai) → status
// preparing → searching (mulai cari kurir). FB-125: explicit "Pesanan Siap"
// button (DoorDash-style Order Ready signal) sesuai best practice industri.
// Order harus milik merchant & status preparing. Setelah DB update, proxy ke
// order-service internal matching agar worker segera assign kurir.
func (s *merchantServiceImpl) MarkReady(ctx context.Context, userID string, orderID string) error {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return err
	}
	if err := s.orderRepo.MarkReady(ctx, m.ID, orderID); err != nil {
		return err
	}
	// Jejak order event untuk customer/tracking
	if evErr := s.orderRepo.RecordOrderEvent(ctx, orderID, "food_ready", "Pesanan sudah siap, mencari kurir"); evErr != nil {
		log.Printf("[MerchantService] MarkReady: gagal catat order_events utk %s: %v", orderID, evErr)
	}
	// Proxy ke order-service agar worker segera mulai matching kurir (non-blocking).
	go s.triggerOrderMatching(orderID)
	return nil
}

// triggerOrderMatching: POST ke order-service internal matching endpoint agar
// status searching segera diproses worker (cari kurir). Fire-and-forget.
func (s *merchantServiceImpl) triggerOrderMatching(orderID string) {
	orderServiceURL := strings.TrimSpace(os.Getenv("ORDER_SERVICE_URL"))
	if orderServiceURL == "" || strings.Contains(orderServiceURL, "localhost") || strings.Contains(orderServiceURL, "127.0.0.1") {
		orderServiceURL = "http://order-service:8083"
	}
	url := orderServiceURL + "/api/v1/internal/orders/matching?id=" + orderID
	resp, err := http.Post(url, "application/json", nil)
	if err != nil {
		log.Printf("[MerchantService] triggerOrderMatching: gagal POST %s: %v", url, err)
		return
	}
	defer resp.Body.Close()
}

// rejectReasonEnum — kode enum alasan reject merchant (FB-122).
var rejectReasonEnum = map[string]string{
	"stok_habis":    "Stok menu habis",
	"terlalu_sibuk": "Merchant terlalu sibuk",
	"tutup_mendadak": "Tutup mendadak",
	"lainnya":       "Lainnya",
}

// normalizeRejectReason — validasi & normalisasi kode enum reject.
// Return (kode ternormalisasi, true) kalau valid.
func normalizeRejectReason(code string) (string, bool) {
	c := strings.TrimSpace(strings.ToLower(code))
	if _, ok := rejectReasonEnum[c]; ok {
		return c, true
	}
	return "", false
}

// rejectReasonLabel — label bahasa Indonesia untuk kode enum reject.
func rejectReasonLabel(code string) string {
	if l, ok := rejectReasonEnum[code]; ok {
		return l
	}
	return "Lainnya"
}

// triggerRefundOnMerchantReject — FB-081: panggil order-service
// /api/v1/internal/refunds/process dengan original_status=pending_merchant
// (free window → refund 100%). Pola sama dgn cancel customer di admin-service.
func (s *merchantServiceImpl) triggerRefundOnMerchantReject(orderID, reason string) {
	orderServiceURL := strings.TrimSpace(os.Getenv("ORDER_SERVICE_URL"))
	if orderServiceURL == "" || strings.Contains(orderServiceURL, "localhost") || strings.Contains(orderServiceURL, "127.0.0.1") {
		orderServiceURL = "http://order-service:8083"
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

// notifyCustomerAccepted — FB-124: kirim notifikasi customer saat merchant
// menerima order. Panggil order-service internal notifications endpoint.
// Fire-and-forget, non-blocking; kegagalan hanya di-log, tidak menggagalkan flow.
func (s *merchantServiceImpl) notifyCustomerAccepted(orderID string) {
	orderServiceURL := strings.TrimSpace(os.Getenv("ORDER_SERVICE_URL"))
	if orderServiceURL == "" || strings.Contains(orderServiceURL, "localhost") || strings.Contains(orderServiceURL, "127.0.0.1") {
		orderServiceURL = "http://order-service:8083"
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"order_id": orderID,
		"title":    "Merchant menerima pesananmu",
		"message":  "Merchant menerima pesananmu — makanan sedang disiapkan",
	})

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		orderServiceURL+"/api/v1/internal/notifications/merchant-accepted", bytes.NewReader(payload))
	if err != nil {
		log.Printf("[MerchantService] AcceptOrder: gagal buat request notif %s: %v", orderID, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Api-Key", os.Getenv("INTERNAL_API_KEY"))

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[MerchantService] AcceptOrder: gagal reach order-service utk notif %s: %v", orderID, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		log.Printf("[MerchantService] AcceptOrder: notif %s gagal (status %d): %s", orderID, resp.StatusCode, string(body))
	}
}

// notifyCustomerRejected — FB-084: kirim push notification ke customer bahwa
// pesanannya ditolak merchant. Panggil order-service
// /api/v1/internal/push/order-cancelled (fire-and-forget, non-blocking —
// dipanggil dari goroutine; kegagalan hanya di-log, tidak menggagalkan flow).
func (s *merchantServiceImpl) notifyCustomerRejected(orderID, reason string) {
	orderServiceURL := strings.TrimSpace(os.Getenv("ORDER_SERVICE_URL"))
	if orderServiceURL == "" || strings.Contains(orderServiceURL, "localhost") || strings.Contains(orderServiceURL, "127.0.0.1") {
		orderServiceURL = "http://order-service:8083"
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
