package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"tembus/merchant-service/internal/domain"

	"github.com/google/uuid"
)

// merchantServiceImpl — implementasi domain.MerchantService.
type merchantServiceImpl struct {
	merchantRepo   domain.MerchantRepository
	menuRepo       domain.MenuItemRepository
	orderRepo      domain.MerchantOrderRepository
	reportRepo     domain.MerchantReportRepository
	accessRepo     domain.MerchantAccessRepository
	governanceRepo domain.MenuGovernanceRepository
}

func NewMerchantService(mr domain.MerchantRepository, mi domain.MenuItemRepository, or domain.MerchantOrderRepository, rr domain.MerchantReportRepository, accessRepos ...domain.MerchantAccessRepository) domain.MerchantService {
	var ar domain.MerchantAccessRepository
	if len(accessRepos) > 0 {
		ar = accessRepos[0]
	}
	return &merchantServiceImpl{merchantRepo: mr, menuRepo: mi, orderRepo: or, reportRepo: rr, accessRepo: ar}
}

func NewMerchantServiceWithGovernance(mr domain.MerchantRepository, mi domain.MenuItemRepository, or domain.MerchantOrderRepository, rr domain.MerchantReportRepository, accessRepo domain.MerchantAccessRepository, governanceRepo domain.MenuGovernanceRepository) domain.MerchantService {
	return &merchantServiceImpl{merchantRepo: mr, menuRepo: mi, orderRepo: or, reportRepo: rr, accessRepo: accessRepo, governanceRepo: governanceRepo}
}

// ─────────────────────────────────────────────
// Registrasi & Profil
// ─────────────────────────────────────────────

func (s *merchantServiceImpl) Register(ctx context.Context, userID string, req domain.RegisterMerchantRequest) (*domain.Merchant, error) {
	req.NamaToko = strings.TrimSpace(req.NamaToko)
	req.Alamat = strings.TrimSpace(req.Alamat)
	req.MarketCode = strings.ToUpper(strings.TrimSpace(req.MarketCode))
	if req.MarketCode == "" {
		req.MarketCode = "ID-JK"
	}
	if req.NamaToko == "" {
		return nil, errors.New("nama_toko wajib diisi")
	}
	if req.Alamat == "" {
		return nil, errors.New("alamat wajib diisi")
	}
	if len(req.MarketCode) > 32 {
		return nil, errors.New("market_code maksimal 32 karakter")
	}
	if timezone := strings.TrimSpace(req.OperatingTimezone); timezone != "" {
		if _, err := time.LoadLocation(timezone); err != nil {
			return nil, errors.New("operating_timezone tidak valid")
		}
	}
	for _, character := range req.MarketCode {
		if !(character >= 'A' && character <= 'Z') && !(character >= '0' && character <= '9') && character != '-' && character != '_' {
			return nil, errors.New("market_code hanya boleh huruf, angka, tanda hubung, atau underscore")
		}
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

	m := &domain.Merchant{
		ID:                 uuid.New().String(),
		UserID:             userID,
		NamaToko:           req.NamaToko,
		Alamat:             req.Alamat,
		VerificationStatus: "pending", // default — wajib admin approve dulu (FOOD-BIKE-046)
		OnboardingStatus:   "SUBMITTED",
		MarketCode:         req.MarketCode,
		JamBuka:            req.JamBuka,
		JamTutup:           req.JamTutup,
		OperatingTimezone:  strings.TrimSpace(req.OperatingTimezone),
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

	if existing != nil {
		// Registration requests do not carry the sensitive tax identifier; keep
		// the existing legal-profile value during a rejected-application retry.
		m.NPWP = existing.NPWP
		currentStatus := existing.OnboardingStatus
		if currentStatus == "" && existing.VerificationStatus == "rejected" {
			currentStatus = "REJECTED"
		}
		if currentStatus != "DRAFT" && currentStatus != "REJECTED" {
			return nil, errors.New("merchant sudah terdaftar dan tidak dapat diajukan ulang pada status saat ini")
		}
		m.ID = existing.ID
		if err := s.merchantRepo.Resubmit(ctx, m, docs); err != nil {
			return nil, err
		}
		return s.merchantRepo.GetByID(ctx, m.ID)
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
	m, err := s.requireOwnerMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if req.PayoutSchedule != nil || req.NPWP != nil {
		if len(strings.TrimSpace(req.IdempotencyKey)) < 12 {
			return nil, errors.New("idempotency_key minimal 12 karakter untuk konfigurasi payout")
		}
		if err := s.requireApprovedHighRisk(ctx, userID, m.ID, req.ApprovalID, "merchant_config"); err != nil {
			return nil, err
		}
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
	if req.OperatingTimezone != nil {
		tz := strings.TrimSpace(*req.OperatingTimezone)
		if tz == "" {
			return nil, errors.New("operating_timezone tidak boleh kosong")
		}
		if _, err := time.LoadLocation(tz); err != nil {
			return nil, errors.New("operating_timezone tidak valid")
		}
		m.OperatingTimezone = tz
	}
	// FB-109: minimum subtotal order — 0 = tanpa batas minimum.
	if req.MinOrderIDR != nil {
		if *req.MinOrderIDR < 0 {
			return nil, errors.New("min_order_idr tidak boleh negatif")
		}
		m.MinOrderIDR = *req.MinOrderIDR
	}
	if req.PayoutSchedule != nil {
		if *req.PayoutSchedule != "daily" && *req.PayoutSchedule != "weekly" && *req.PayoutSchedule != "monthly" {
			return nil, errors.New("payout_schedule harus daily, weekly, atau monthly")
		}
		m.PayoutSchedule = *req.PayoutSchedule
	}
	if req.NPWP != nil {
		value := strings.TrimSpace(*req.NPWP)
		if len(value) > 32 {
			return nil, errors.New("npwp maksimal 32 karakter")
		}
		if value == "" {
			m.NPWP = nil
		} else {
			m.NPWP = &value
		}
	}
	if err := s.merchantRepo.Update(ctx, m); err != nil {
		return nil, err
	}
	return s.merchantRepo.GetByID(ctx, m.ID)
}

// GetOperatingHours menyediakan konfigurasi jadwal ZIP. Merchant lama yang
// belum pernah menyimpan jadwal per-hari tetap menampilkan konfigurasi nyata
// jam_buka/jam_tutup mereka sebagai fallback, bukan data contoh.
func (s *merchantServiceImpl) GetOperatingHours(ctx context.Context, userID string) (*domain.MerchantOperatingHoursResponse, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	hours, err := s.merchantRepo.GetOperatingHours(ctx, m.ID)
	if err != nil {
		return nil, err
	}
	if len(hours) == 0 {
		hours = defaultOperatingHours(m.JamBuka, m.JamTutup)
	}
	closures, err := s.merchantRepo.ListSpecialClosures(ctx, m.ID)
	if err != nil {
		return nil, err
	}
	return &domain.MerchantOperatingHoursResponse{Hours: hours, Closures: closures}, nil
}

func (s *merchantServiceImpl) ReplaceOperatingHours(ctx context.Context, userID string, hours []domain.MerchantOperatingHour) (*domain.MerchantOperatingHoursResponse, error) {
	m, err := s.requireOwnerMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if len(hours) != 7 {
		return nil, errors.New("jadwal harus memuat tepat tujuh hari")
	}
	seen := make(map[int]bool, 7)
	var firstOpen *domain.MerchantOperatingHour
	for i := range hours {
		hour := &hours[i]
		if hour.Weekday < 0 || hour.Weekday > 6 || seen[hour.Weekday] {
			return nil, errors.New("weekday jadwal tidak valid atau duplikat")
		}
		seen[hour.Weekday] = true
		hour.MerchantID = m.ID
		if !hour.IsOpen {
			hour.OpensAt, hour.ClosesAt = nil, nil
			hour.LastOrderMinutesBeforeClose = 0
			continue
		}
		if hour.LastOrderMinutesBeforeClose < 0 || hour.LastOrderMinutesBeforeClose > 180 {
			return nil, errors.New("batas last order harus antara 0 dan 180 menit")
		}
		if hour.OpensAt == nil || hour.ClosesAt == nil || !validClock(*hour.OpensAt) || !validClock(*hour.ClosesAt) || *hour.OpensAt == *hour.ClosesAt {
			return nil, errors.New("jam buka dan tutup harus valid serta tidak boleh sama")
		}
		if firstOpen == nil {
			copy := *hour
			firstOpen = &copy
		}
	}
	if err := s.merchantRepo.ReplaceOperatingHours(ctx, m.ID, hours); err != nil {
		return nil, err
	}
	// Kompatibilitas dengan consumer lama dan worker: simpan satu rentang nyata
	// dari hari aktif pertama, sementara worker memakai tabel baru bila tersedia.
	if firstOpen != nil {
		m.JamBuka, m.JamTutup = firstOpen.OpensAt, firstOpen.ClosesAt
		if err := s.merchantRepo.Update(ctx, m); err != nil {
			return nil, err
		}
	}
	return s.GetOperatingHours(ctx, userID)
}

func (s *merchantServiceImpl) CreateSpecialClosure(ctx context.Context, userID string, input domain.CreateMerchantSpecialClosureInput) (*domain.MerchantSpecialClosure, error) {
	m, err := s.requireOwnerMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	label := strings.TrimSpace(input.Label)
	if len(label) == 0 || len(label) > 120 {
		return nil, errors.New("label penutupan harus 1-120 karakter")
	}
	if _, err := time.Parse("2006-01-02", input.ClosureDate); err != nil {
		return nil, errors.New("closure_date harus berformat YYYY-MM-DD")
	}
	return s.merchantRepo.CreateSpecialClosure(ctx, m.ID, input.ClosureDate, label)
}

func (s *merchantServiceImpl) DeleteSpecialClosure(ctx context.Context, userID, closureID string) error {
	m, err := s.requireOwnerMerchant(ctx, userID)
	if err != nil {
		return err
	}
	if _, err := uuid.Parse(closureID); err != nil {
		return errors.New("id penutupan tidak valid")
	}
	return s.merchantRepo.DeleteSpecialClosure(ctx, m.ID, closureID)
}

func defaultOperatingHours(opensAt, closesAt *string) []domain.MerchantOperatingHour {
	hours := make([]domain.MerchantOperatingHour, 7)
	open := opensAt != nil && closesAt != nil && validClock(*opensAt) && validClock(*closesAt) && *opensAt != *closesAt
	for weekday := 0; weekday < 7; weekday++ {
		hours[weekday] = domain.MerchantOperatingHour{Weekday: weekday, IsOpen: open}
		if open {
			hours[weekday].OpensAt = opensAt
			hours[weekday].ClosesAt = closesAt
		}
	}
	return hours
}

func validClock(value string) bool {
	_, err := time.Parse("15:04", value)
	return err == nil
}

// merchantOnboardingActive prefers the canonical lifecycle. The legacy
// verification projection remains only for fixtures and databases that have
// not yet applied the MERCH-2026-001 migration.
func merchantOnboardingActive(m *domain.Merchant) bool {
	if m.OnboardingStatus != "" {
		return m.OnboardingStatus == "ACTIVE"
	}
	return m.VerificationStatus == "approved"
}

func (s *merchantServiceImpl) ToggleOpen(ctx context.Context, userID string, isOpen bool) (*domain.Merchant, error) {
	m, err := s.requireOwnerMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !merchantOnboardingActive(m) {
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
	m, err := s.requireOwnerMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !merchantOnboardingActive(m) {
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
	m, err := s.requireOwnerMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if err := s.merchantRepo.SetPaused(ctx, m.ID, nil); err != nil {
		return nil, err
	}
	return s.merchantRepo.GetByID(ctx, m.ID)
}

// Busy (FOOD-2026-011): merchant tetap menerima order, tetapi quote Food
// memasukkan tambahan prep yang tersimpan sampai `until`.
func (s *merchantServiceImpl) Busy(ctx context.Context, userID string, until time.Time, extraPrepMinutes int) (*domain.Merchant, error) {
	m, err := s.requireOwnerMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !merchantOnboardingActive(m) {
		return nil, errors.New("merchant belum disetujui")
	}
	if until.Before(time.Now()) {
		return nil, errors.New("waktu busy harus di masa depan")
	}
	if extraPrepMinutes < 0 || extraPrepMinutes > 180 {
		return nil, errors.New("extra_prep_minutes harus 0-180")
	}
	repo, ok := s.merchantRepo.(interface {
		SetBusy(context.Context, string, *time.Time, int) error
	})
	if !ok {
		return nil, errors.New("konfigurasi busy belum tersedia")
	}
	if err := repo.SetBusy(ctx, m.ID, &until, extraPrepMinutes); err != nil {
		return nil, err
	}
	return s.merchantRepo.GetByID(ctx, m.ID)
}

// OverrideOperatingState applies an audited admin/support state override.
// Merchant self-service pause/busy remain separate so their operational
// semantics cannot be accidentally replaced by an administrative closure.
func (s *merchantServiceImpl) OverrideOperatingState(ctx context.Context, actorID, actorRole, merchantID string, req domain.MerchantOperatingStateOverrideRequest) (*domain.Merchant, error) {
	if _, err := uuid.Parse(actorID); err != nil {
		return nil, errors.New("actor id tidak valid")
	}
	if _, err := uuid.Parse(merchantID); err != nil {
		return nil, errors.New("merchant id tidak valid")
	}
	actorRole = strings.ToLower(strings.TrimSpace(actorRole))
	if !validOperatingStateOverrideRole(actorRole) {
		return nil, errors.New("role tidak berwenang mengubah operating state")
	}
	req.State = strings.ToLower(strings.TrimSpace(req.State))
	req.Reason = strings.TrimSpace(req.Reason)
	if !validOperatingStateOverrideState(req.State) {
		return nil, errors.New("state override tidak valid (open|closed|temp_closed|holiday)")
	}
	if len(req.Reason) < 1 || len(req.Reason) > 500 {
		return nil, errors.New("reason wajib 1-500 karakter")
	}
	if req.State == domain.OperatingStateTempClosed {
		if req.Until == nil || !req.Until.After(time.Now()) {
			return nil, errors.New("until wajib di masa depan untuk temp_closed")
		}
	} else if req.State != domain.OperatingStateHoliday && req.Until != nil {
		return nil, errors.New("until hanya boleh diisi untuk temp_closed atau holiday")
	}
	if req.State == domain.OperatingStateHoliday && req.Until != nil && !req.Until.After(time.Now()) {
		return nil, errors.New("until holiday harus di masa depan")
	}
	repo, ok := s.merchantRepo.(domain.MerchantOperatingStateRepository)
	if !ok {
		return nil, errors.New("konfigurasi operating state belum tersedia")
	}
	if err := repo.SetOperatingStateOverride(ctx, merchantID, actorID, actorRole, req); err != nil {
		return nil, err
	}
	return s.merchantRepo.GetByID(ctx, merchantID)
}

func validOperatingStateOverrideRole(role string) bool {
	switch role {
	case "super_admin", "admin", "ops_admin", "ops_security", "cs_agent", "customer_support", "manager":
		return true
	default:
		return false
	}
}

func validOperatingStateOverrideState(state string) bool {
	switch state {
	case domain.OperatingStateOpen, domain.OperatingStateClosed, domain.OperatingStateTempClosed, domain.OperatingStateHoliday:
		return true
	default:
		return false
	}
}

// UpdateFoodDocs — FB-092 + ADR 003: update nomor + masa berlaku dokumen
// pangan. Patch semantics: hanya field yang diisi yang diperbarui; field yang
// tidak diisi dipertahankan dari data lama. SEMUA dokumen OPSIONAL (soft-gate)
// — validasi format hanya untuk nilai yang dikirim eksplisit di request ini.
func (s *merchantServiceImpl) UpdateFoodDocs(ctx context.Context, userID string, req domain.UpdateFoodDocsRequest) (*domain.Merchant, error) {
	m, err := s.requireOwnerMerchant(ctx, userID)
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
		HalalCertNumber:  m.HalalCertNumber,
		HalalExpiryDate:  m.HalalExpiryDate,
		SppIrtNumber:     m.SppIrtNumber,
		SppIrtExpiryDate: m.SppIrtExpiryDate,
		BpomNumber:       m.BpomNumber,
		BpomExpiryDate:   m.BpomExpiryDate,
		HalalStatus:      m.HalalStatusPtr(),
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
	m, err := s.requireOwnerMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if len(strings.TrimSpace(req.IdempotencyKey)) < 12 {
		return nil, errors.New("idempotency_key minimal 12 karakter untuk rekening payout")
	}
	if err := s.requireApprovedHighRisk(ctx, userID, m.ID, req.ApprovalID, "bank_account"); err != nil {
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
		bankName != *ptrOr(m.BankName, "") || accountNumber != *ptrOr(m.BankAccountNumber, "") ||
		accountHolder != *ptrOr(m.BankAccountHolder, "")
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
	if m != nil {
		return m, nil
	}
	if s.accessRepo == nil {
		return nil, errors.New("merchant belum terdaftar")
	}
	access := domain.MerchantAccessFromContext(ctx)
	if access.SessionToken == "" || access.BranchID == "" || access.DeviceID == "" {
		return nil, errors.New("merchant session, branch, dan device wajib diisi untuk staff")
	}
	session, err := s.accessRepo.AuthorizeDeviceSession(ctx, domain.MerchantSessionAuthorization{
		UserID: userID, MerchantID: "", BranchID: access.BranchID, DeviceID: access.DeviceID,
		SessionToken: access.SessionToken, RequiredPermission: access.RequiredPermission,
	})
	if err != nil {
		return nil, err
	}
	return s.merchantRepo.GetByID(ctx, session.MerchantID)
}

func (s *merchantServiceImpl) requireOwnerMerchant(ctx context.Context, userID string) (*domain.Merchant, error) {
	m, err := s.merchantRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, errors.New("merchant tidak ditemukan — daftar dulu")
	}
	return m, nil
}

func (s *merchantServiceImpl) requireApprovedHighRisk(ctx context.Context, userID, merchantID, approvalID, changeType string) error {
	if s.accessRepo == nil {
		return errors.New("high-risk approval repository not wired")
	}
	if strings.TrimSpace(approvalID) == "" {
		return errors.New("approval_id wajib untuk perubahan high-risk")
	}
	return s.accessRepo.ValidateApprovedSecurityApproval(ctx, merchantID, userID, approvalID, changeType)
}

// ─────────────────────────────────────────────
// Menu
// ─────────────────────────────────────────────

func (s *merchantServiceImpl) requireMenuGovernance() (domain.MenuGovernanceRepository, error) {
	if s.governanceRepo == nil {
		return nil, errors.New("menu governance repository not wired")
	}
	return s.governanceRepo, nil
}

func slugifyMenuCategory(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	lastDash := false
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
		} else if !lastDash && b.Len() > 0 {
			b.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func (s *merchantServiceImpl) resolveMenuCategory(ctx context.Context, merchantID, categoryID, name string) (*domain.MenuCategory, error) {
	governance, err := s.requireMenuGovernance()
	if err != nil {
		// Unit callers using the pre-governance constructor retain the legacy
		// kategori projection; the production wiring always has this repo.
		return nil, nil
	}
	name = strings.TrimSpace(name)
	if name == "" && categoryID == "" {
		name = "Umum"
	}
	categories, err := governance.ListCategories(ctx, merchantID)
	if err != nil {
		return nil, err
	}
	for _, category := range categories {
		if categoryID != "" && category.ID == categoryID {
			if category.Status != "active" {
				return nil, errors.New("kategori sedang diarsipkan")
			}
			return category, nil
		}
		if categoryID == "" && strings.EqualFold(category.Name, name) {
			if category.Status != "active" {
				return nil, errors.New("kategori sedang diarsipkan")
			}
			return category, nil
		}
	}
	if categoryID != "" {
		return nil, errors.New("kategori tidak ditemukan atau bukan milik merchant")
	}
	slug := slugifyMenuCategory(name)
	if slug == "" {
		return nil, errors.New("kategori tidak valid")
	}
	category := &domain.MenuCategory{ID: uuid.New().String(), MerchantID: merchantID, Name: name, Slug: slug}
	if err := governance.CreateCategory(ctx, category); err != nil {
		return nil, err
	}
	return category, nil
}

func validateMenuImageInput(input domain.MenuItemImageInput) error {
	value := strings.TrimSpace(input.URL)
	if value == "" || len(value) > 2048 {
		return errors.New("url gambar wajib diisi dan maksimal 2048 karakter")
	}
	if strings.HasPrefix(value, "/") {
		return nil
	}
	parsed, err := url.Parse(value)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return errors.New("url gambar harus berupa http(s) atau path publik")
	}
	return nil
}

func buildMenuImages(inputs []domain.MenuItemImageInput, fallback *string) ([]domain.MenuItemImage, error) {
	if len(inputs) == 0 && fallback != nil && strings.TrimSpace(*fallback) != "" {
		inputs = []domain.MenuItemImageInput{{URL: strings.TrimSpace(*fallback), IsPrimary: true}}
	}
	images := make([]domain.MenuItemImage, 0, len(inputs))
	primary := -1
	for index, input := range inputs {
		if err := validateMenuImageInput(input); err != nil {
			return nil, err
		}
		if input.IsPrimary {
			if primary >= 0 {
				return nil, errors.New("hanya satu gambar menu yang boleh menjadi primary")
			}
			primary = index
		}
		images = append(images, domain.MenuItemImage{URL: strings.TrimSpace(input.URL), AltText: strings.TrimSpace(input.AltText), SortOrder: index, IsPrimary: input.IsPrimary})
	}
	if len(images) > 0 && primary < 0 {
		images[0].IsPrimary = true
	}
	return images, nil
}

func buildMenuSchedules(inputs []domain.MenuItemScheduleInput) ([]domain.MenuItemSchedule, error) {
	schedules := make([]domain.MenuItemSchedule, 0, len(inputs))
	seen := map[string]bool{}
	for _, input := range inputs {
		if input.Weekday < 0 || input.Weekday > 6 {
			return nil, errors.New("weekday jadwal menu harus 0 sampai 6")
		}
		start := strings.TrimSpace(input.StartsAt)
		end := strings.TrimSpace(input.EndsAt)
		if _, err := time.Parse("15:04", start); err != nil {
			return nil, errors.New("starts_at jadwal menu harus HH:MM")
		}
		if _, err := time.Parse("15:04", end); err != nil || start == end {
			return nil, errors.New("ends_at jadwal menu harus HH:MM dan berbeda dari starts_at")
		}
		active := true
		if input.IsActive != nil {
			active = *input.IsActive
		}
		key := fmt.Sprintf("%d/%s/%s", input.Weekday, start, end)
		if seen[key] {
			return nil, fmt.Errorf("jadwal menu duplikat: %s", key)
		}
		seen[key] = true
		schedules = append(schedules, domain.MenuItemSchedule{Weekday: input.Weekday, StartsAt: start, EndsAt: end, IsActive: active})
	}
	return schedules, nil
}

func validMenuLifecycleStatus(status string) bool {
	switch status {
	case domain.MenuItemStatusDraft, domain.MenuItemStatusActive, domain.MenuItemStatusSoldOut,
		domain.MenuItemStatusScheduled, domain.MenuItemStatusArchived:
		return true
	default:
		return false
	}
}

func valueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func categoryIDPtr(category *domain.MenuCategory) *string {
	if category == nil {
		return nil
	}
	return &category.ID
}

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
	if req.StockQuantity != nil && *req.StockQuantity < 0 {
		return nil, errors.New("stok tidak boleh negatif")
	}
	if req.DailySalesLimit != nil && *req.DailySalesLimit < 0 {
		return nil, errors.New("batas penjualan harian tidak boleh negatif")
	}
	category, err := s.resolveMenuCategory(ctx, m.ID, valueOrEmpty(req.CategoryID), req.Kategori)
	if err != nil {
		return nil, err
	}
	if category != nil {
		req.Kategori = category.Name
	}
	images, err := buildMenuImages(req.Images, req.Foto)
	if err != nil {
		return nil, err
	}
	schedules, err := buildMenuSchedules(req.Schedules)
	if err != nil {
		return nil, err
	}

	item := &domain.MenuItem{
		ID:               uuid.New().String(),
		MerchantID:       m.ID,
		Nama:             req.Nama,
		Harga:            req.Harga,
		Foto:             req.Foto,
		Deskripsi:        req.Deskripsi,
		Kategori:         strings.TrimSpace(req.Kategori),
		CategoryID:       categoryIDPtr(category),
		PrepTimeMinutes:  req.PrepTimeMinutes,
		IsAvailable:      false,
		Status:           domain.MenuItemStatusModerationPending,
		ModerationStatus: domain.MenuModerationPending,
		StockQuantity:    req.StockQuantity,
		DailySalesLimit:  req.DailySalesLimit,
		Images:           images,
		Schedules:        schedules,
	}
	if req.DailySalesLimit != nil {
		resetAt := nextInventoryReset(time.Now())
		item.SalesResetAt = &resetAt
	}
	if err := s.menuRepo.Create(ctx, item); err != nil {
		return nil, err
	}
	if s.governanceRepo != nil {
		if err := s.governanceRepo.ReplaceImages(ctx, item.ID, m.ID, images); err != nil {
			_ = s.menuRepo.Delete(ctx, item.ID, m.ID)
			return nil, err
		}
		if err := s.governanceRepo.ReplaceSchedules(ctx, item.ID, m.ID, schedules); err != nil {
			_ = s.menuRepo.Delete(ctx, item.ID, m.ID)
			return nil, err
		}
		return s.menuRepo.GetByID(ctx, item.ID)
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
	if req.Deskripsi != nil {
		item.Deskripsi = req.Deskripsi
	}
	if req.Kategori != nil {
		category, categoryErr := s.resolveMenuCategory(ctx, m.ID, "", *req.Kategori)
		if categoryErr != nil {
			return nil, categoryErr
		}
		item.Kategori = *req.Kategori
		item.CategoryID = categoryIDPtr(category)
	}
	if req.CategoryID != nil {
		category, categoryErr := s.resolveMenuCategory(ctx, m.ID, *req.CategoryID, "")
		if categoryErr != nil {
			return nil, categoryErr
		}
		item.CategoryID = categoryIDPtr(category)
		item.Kategori = category.Name
	}
	if req.PrepTimeMinutes != nil {
		item.PrepTimeMinutes = *req.PrepTimeMinutes
	}
	if req.IsAvailable != nil {
		if *req.IsAvailable && item.ModerationStatus != domain.MenuModerationApproved {
			return nil, errors.New("menu belum lolos moderasi")
		}
		item.IsAvailable = *req.IsAvailable
	}
	if req.Status != nil {
		status := strings.TrimSpace(*req.Status)
		if !validMenuLifecycleStatus(status) {
			return nil, errors.New("status menu tidak valid")
		}
		if (status == domain.MenuItemStatusActive || status == domain.MenuItemStatusScheduled) && item.ModerationStatus != domain.MenuModerationApproved {
			return nil, errors.New("menu belum lolos moderasi")
		}
		item.Status = status
	}
	if req.StockQuantity != nil {
		if *req.StockQuantity < 0 {
			return nil, errors.New("stok tidak boleh negatif")
		}
		item.StockQuantity = req.StockQuantity
	}
	if req.DailySalesLimit != nil {
		if *req.DailySalesLimit < 0 {
			return nil, errors.New("batas penjualan harian tidak boleh negatif")
		}
		item.DailySalesLimit = req.DailySalesLimit
		resetAt := nextInventoryReset(time.Now())
		item.SalesResetAt = &resetAt
	}
	var images []domain.MenuItemImage
	var schedules []domain.MenuItemSchedule
	if s.governanceRepo != nil {
		if req.Images != nil {
			images, err = buildMenuImages(*req.Images, item.Foto)
			if err != nil {
				return nil, err
			}
		}
		if req.Schedules != nil {
			schedules, err = buildMenuSchedules(*req.Schedules)
			if err != nil {
				return nil, err
			}
		}
	}

	if err := s.menuRepo.Update(ctx, item); err != nil {
		return nil, err
	}
	if s.governanceRepo != nil {
		if req.Images != nil {
			if err := s.governanceRepo.ReplaceImages(ctx, item.ID, m.ID, images); err != nil {
				return nil, err
			}
		}
		if req.Schedules != nil {
			if err := s.governanceRepo.ReplaceSchedules(ctx, item.ID, m.ID, schedules); err != nil {
				return nil, err
			}
		}
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
	item, err := s.menuRepo.GetByID(ctx, itemID)
	if err != nil {
		return nil, err
	}
	if item == nil || item.MerchantID != m.ID {
		return nil, errors.New("menu item tidak ditemukan")
	}
	if available && item.ModerationStatus != "" && item.ModerationStatus != domain.MenuModerationApproved {
		return nil, errors.New("menu belum lolos moderasi")
	}
	if err := s.menuRepo.SetAvailability(ctx, itemID, m.ID, available); err != nil {
		return nil, err
	}
	return s.menuRepo.GetByID(ctx, itemID)
}

func (s *merchantServiceImpl) UpdateMenuInventory(ctx context.Context, userID string, itemID string, req domain.UpdateMenuInventoryRequest) (*domain.MenuItem, error) {
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
	if req.StockQuantity != nil && *req.StockQuantity < 0 {
		return nil, errors.New("stok tidak boleh negatif")
	}
	if req.DailySalesLimit != nil && *req.DailySalesLimit < 0 {
		return nil, errors.New("batas penjualan harian tidak boleh negatif")
	}
	var resetAt *time.Time
	if req.DailySalesLimit != nil {
		nextDay := nextInventoryReset(time.Now())
		resetAt = &nextDay
	}
	if err := s.menuRepo.UpdateInventory(ctx, itemID, m.ID, req.StockQuantity, req.DailySalesLimit, resetAt); err != nil {
		return nil, err
	}
	return s.menuRepo.GetByID(ctx, itemID)
}

func nextInventoryReset(now time.Time) time.Time {
	now = now.In(time.Local)
	return time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())
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
		kind := strings.TrimSpace(g.Kind)
		if kind == "" {
			kind = domain.MenuVariantKindVariant
		}
		if kind != domain.MenuVariantKindVariant && kind != domain.MenuVariantKindModifier {
			return nil, fmt.Errorf("kind varian %q tidak valid", name)
		}
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
			Kind:       kind,
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

func (s *merchantServiceImpl) CreateMenuCategory(ctx context.Context, userID string, req domain.CreateMenuCategoryRequest) (*domain.MenuCategory, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	name := strings.TrimSpace(req.Name)
	if name == "" || len(name) > 80 {
		return nil, errors.New("nama kategori wajib diisi dan maksimal 80 karakter")
	}
	if req.SortOrder < 0 {
		return nil, errors.New("sort_order kategori tidak boleh negatif")
	}
	governance, err := s.requireMenuGovernance()
	if err != nil {
		return nil, err
	}
	category := &domain.MenuCategory{ID: uuid.New().String(), MerchantID: m.ID, Name: name, Slug: slugifyMenuCategory(name), SortOrder: req.SortOrder, Status: "active"}
	if category.Slug == "" {
		return nil, errors.New("nama kategori tidak valid")
	}
	if err := governance.CreateCategory(ctx, category); err != nil {
		return nil, err
	}
	return category, nil
}

func (s *merchantServiceImpl) ListMenuCategories(ctx context.Context, userID string) ([]*domain.MenuCategory, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	governance, err := s.requireMenuGovernance()
	if err != nil {
		return nil, err
	}
	return governance.ListCategories(ctx, m.ID)
}

func (s *merchantServiceImpl) UpdateMenuCategory(ctx context.Context, userID, categoryID string, req domain.UpdateMenuCategoryRequest) (*domain.MenuCategory, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if _, err := uuid.Parse(categoryID); err != nil {
		return nil, errors.New("category_id tidak valid")
	}
	if req.Name != nil && (strings.TrimSpace(*req.Name) == "" || len(strings.TrimSpace(*req.Name)) > 80) {
		return nil, errors.New("nama kategori maksimal 80 karakter")
	}
	if req.SortOrder != nil && *req.SortOrder < 0 {
		return nil, errors.New("sort_order kategori tidak boleh negatif")
	}
	if req.Status != nil && *req.Status != "active" && *req.Status != "archived" {
		return nil, errors.New("status kategori tidak valid")
	}
	governance, err := s.requireMenuGovernance()
	if err != nil {
		return nil, err
	}
	categories, err := governance.ListCategories(ctx, m.ID)
	if err != nil {
		return nil, err
	}
	var category *domain.MenuCategory
	for _, existing := range categories {
		if existing.ID == categoryID {
			copy := *existing
			category = &copy
			break
		}
	}
	if category == nil {
		return nil, errors.New("kategori tidak ditemukan")
	}
	if req.Name != nil {
		category.Name = strings.TrimSpace(*req.Name)
		category.Slug = slugifyMenuCategory(category.Name)
		if category.Slug == "" {
			return nil, errors.New("nama kategori tidak valid")
		}
	}
	if req.SortOrder != nil {
		category.SortOrder = *req.SortOrder
	}
	if req.Status != nil {
		category.Status = *req.Status
	}
	if err := governance.UpdateCategory(ctx, category); err != nil {
		return nil, err
	}
	return category, nil
}

func (s *merchantServiceImpl) ModerateMenuItem(ctx context.Context, actorID, actorRole, itemID string, req domain.ModerateMenuItemRequest) (*domain.MenuItem, error) {
	if _, err := uuid.Parse(actorID); err != nil {
		return nil, errors.New("actor_id tidak valid")
	}
	if _, err := uuid.Parse(itemID); err != nil {
		return nil, errors.New("menu item id tidak valid")
	}
	if actorRole != "super_admin" && actorRole != "ops_admin" && actorRole != "ops_security" && actorRole != "admin" {
		return nil, errors.New("role tidak berwenang memoderasi menu")
	}
	status := strings.ToLower(strings.TrimSpace(req.Status))
	if status != domain.MenuModerationApproved && status != domain.MenuModerationRejected {
		return nil, errors.New("status moderasi harus approved atau rejected")
	}
	governance, err := s.requireMenuGovernance()
	if err != nil {
		return nil, err
	}
	if err := governance.SetModerationStatus(ctx, itemID, status, actorID, actorRole, strings.TrimSpace(req.Reason)); err != nil {
		return nil, err
	}
	return s.menuRepo.GetByID(ctx, itemID)
}

func (s *merchantServiceImpl) ImportMenuCSV(ctx context.Context, userID, idempotencyKey string, content []byte) (*domain.BulkMenuImportResult, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if m.VerificationStatus != "approved" {
		return nil, errors.New("merchant belum disetujui")
	}
	idempotencyKey = strings.TrimSpace(idempotencyKey)
	if len(idempotencyKey) < 12 || len(idempotencyKey) > 200 {
		return nil, errors.New("Idempotency-Key wajib 12-200 karakter")
	}
	if len(content) == 0 || len(content) > 5*1024*1024 {
		return nil, errors.New("file CSV wajib diisi dan maksimal 5MB")
	}
	governance, err := s.requireMenuGovernance()
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256(content)
	requestHash := fmt.Sprintf("%x", digest[:])
	record, created, err := governance.StartCatalogImport(ctx, m.ID, idempotencyKey, requestHash)
	if err != nil {
		return nil, err
	}
	if !created {
		if record.RequestHash != requestHash {
			return nil, errors.New("Idempotency-Key sudah dipakai untuk payload CSV berbeda")
		}
		if record.Status == "completed" || record.Status == "rejected" {
			return &record.Result, nil
		}
		if record.Status == "failed" {
			return nil, errors.New("import sebelumnya gagal; gunakan Idempotency-Key baru setelah memperbaiki data")
		}
		return nil, errors.New("import dengan Idempotency-Key ini masih diproses")
	}

	result := &domain.BulkMenuImportResult{ImportID: record.ID}
	reader := csv.NewReader(bytes.NewReader(content))
	reader.FieldsPerRecord = -1
	reader.TrimLeadingSpace = true
	firstLine := strings.SplitN(string(content), "\n", 2)[0]
	if strings.Count(firstLine, ";") > strings.Count(firstLine, ",") {
		reader.Comma = ';'
	}
	records, err := reader.ReadAll()
	if err != nil {
		result.Errors = []domain.CatalogImportRowError{{Row: 1, Message: "CSV tidak valid: " + err.Error()}}
		_ = governance.CompleteCatalogImport(ctx, record.ID, "rejected", *result)
		return result, nil
	}
	if len(records) < 2 {
		result.Errors = []domain.CatalogImportRowError{{Row: 1, Message: "CSV wajib memiliki header dan minimal satu baris"}}
		_ = governance.CompleteCatalogImport(ctx, record.ID, "rejected", *result)
		return result, nil
	}
	columns := map[string]int{}
	for index, value := range records[0] {
		columns[normalizeCSVColumn(value)] = index
	}
	nameIndex := firstCSVColumn(columns, "nama", "name", "menu_name")
	priceIndex := firstCSVColumn(columns, "harga", "price", "harga_idr")
	categoryIndex := firstCSVColumn(columns, "kategori", "category", "category_name")
	if nameIndex < 0 || priceIndex < 0 || categoryIndex < 0 {
		result.Errors = []domain.CatalogImportRowError{{Row: 1, Message: "Header wajib: nama, harga, kategori"}}
		_ = governance.CompleteCatalogImport(ctx, record.ID, "rejected", *result)
		return result, nil
	}
	descriptionIndex := firstCSVColumn(columns, "deskripsi", "description")
	prepIndex := firstCSVColumn(columns, "prep_time_minutes", "prep_time", "waktu_masak")
	imageIndex := firstCSVColumn(columns, "image_url", "foto", "image")
	stockIndex := firstCSVColumn(columns, "stock_quantity", "stock", "stok")
	limitIndex := firstCSVColumn(columns, "daily_sales_limit", "sales_limit", "batas_penjualan_harian")
	statusIndex := firstCSVColumn(columns, "status")

	existingCategories, err := governance.ListCategories(ctx, m.ID)
	if err != nil {
		return nil, err
	}
	categoryBySlug := make(map[string]*domain.MenuCategory, len(existingCategories))
	for _, category := range existingCategories {
		categoryBySlug[category.Slug] = category
	}
	newCategories := make([]*domain.MenuCategory, 0)
	items := make([]*domain.MenuItem, 0, len(records)-1)
	seenNames := map[string]bool{}
	for index, row := range records[1:] {
		line := index + 2
		result.Rows++
		if len(row) == 0 || strings.TrimSpace(strings.Join(row, "")) == "" {
			continue
		}
		name := strings.TrimSpace(csvValue(row, nameIndex))
		price, priceErr := strconv.ParseInt(strings.ReplaceAll(strings.ReplaceAll(strings.TrimSpace(csvValue(row, priceIndex)), ".", ""), ",", ""), 10, 64)
		categoryName := strings.TrimSpace(csvValue(row, categoryIndex))
		rowErrors := make([]string, 0)
		if name == "" || len(name) > 150 {
			rowErrors = append(rowErrors, "nama wajib diisi dan maksimal 150 karakter")
		}
		if priceErr != nil || price <= 0 {
			rowErrors = append(rowErrors, "harga harus berupa angka lebih dari 0")
		}
		if categoryName == "" || len(categoryName) > 80 {
			rowErrors = append(rowErrors, "kategori wajib diisi dan maksimal 80 karakter")
		}
		if seenNames[strings.ToLower(name)] {
			rowErrors = append(rowErrors, "nama menu duplikat dalam file")
		}
		prep := 15
		if prepIndex >= 0 && strings.TrimSpace(csvValue(row, prepIndex)) != "" {
			parsed, prepErr := strconv.Atoi(strings.TrimSpace(csvValue(row, prepIndex)))
			if prepErr != nil || parsed < 1 || parsed > 180 {
				rowErrors = append(rowErrors, "prep_time_minutes harus 1-180")
			} else {
				prep = parsed
			}
		}
		status := strings.ToLower(strings.TrimSpace(csvValue(row, statusIndex)))
		if status != "" && !validMenuLifecycleStatus(status) {
			rowErrors = append(rowErrors, "status menu tidak valid")
		}
		var image *string
		if imageIndex >= 0 && strings.TrimSpace(csvValue(row, imageIndex)) != "" {
			value := strings.TrimSpace(csvValue(row, imageIndex))
			if imageErr := validateMenuImageInput(domain.MenuItemImageInput{URL: value}); imageErr != nil {
				rowErrors = append(rowErrors, imageErr.Error())
			} else {
				image = &value
			}
		}
		var stock, dailyLimit *int
		if stockIndex >= 0 && strings.TrimSpace(csvValue(row, stockIndex)) != "" {
			parsed, stockErr := strconv.Atoi(strings.TrimSpace(csvValue(row, stockIndex)))
			if stockErr != nil || parsed < 0 {
				rowErrors = append(rowErrors, "stock_quantity harus angka >= 0")
			} else {
				stock = &parsed
			}
		}
		if limitIndex >= 0 && strings.TrimSpace(csvValue(row, limitIndex)) != "" {
			parsed, limitErr := strconv.Atoi(strings.TrimSpace(csvValue(row, limitIndex)))
			if limitErr != nil || parsed < 0 {
				rowErrors = append(rowErrors, "daily_sales_limit harus angka >= 0")
			} else {
				dailyLimit = &parsed
			}
		}
		if len(rowErrors) > 0 {
			for _, message := range rowErrors {
				result.Errors = append(result.Errors, domain.CatalogImportRowError{Row: line, Message: message})
			}
			continue
		}
		seenNames[strings.ToLower(name)] = true
		slug := slugifyMenuCategory(categoryName)
		category := categoryBySlug[slug]
		if category == nil {
			category = &domain.MenuCategory{ID: uuid.New().String(), MerchantID: m.ID, Name: categoryName, Slug: slug, Status: "active"}
			categoryBySlug[slug] = category
			newCategories = append(newCategories, category)
		}
		if category.Status != "active" {
			result.Errors = append(result.Errors, domain.CatalogImportRowError{Row: line, Message: "kategori sedang diarsipkan"})
			continue
		}
		description := strings.TrimSpace(csvValue(row, descriptionIndex))
		var descriptionPtr *string
		if description != "" {
			descriptionPtr = &description
		}
		item := &domain.MenuItem{ID: uuid.New().String(), MerchantID: m.ID, Nama: name, Deskripsi: descriptionPtr, Harga: price, Kategori: category.Name,
			CategoryID: &category.ID, PrepTimeMinutes: prep, IsAvailable: false, Status: domain.MenuItemStatusModerationPending,
			ModerationStatus: domain.MenuModerationPending, StockQuantity: stock, DailySalesLimit: dailyLimit}
		if image != nil {
			item.Foto = image
			item.Images = []domain.MenuItemImage{{URL: *image, IsPrimary: true}}
		}
		if dailyLimit != nil {
			resetAt := nextInventoryReset(time.Now())
			item.SalesResetAt = &resetAt
		}
		items = append(items, item)
	}
	if result.Rows > 1000 {
		result.Errors = append(result.Errors, domain.CatalogImportRowError{Row: 1, Message: "maksimal 1000 baris per import"})
	}
	currentCount, countErr := s.menuRepo.CountByMerchant(ctx, m.ID)
	if countErr != nil {
		return nil, countErr
	}
	if currentCount+len(items) > 1000 {
		result.Errors = append(result.Errors, domain.CatalogImportRowError{Row: 1, Message: "batas total 1000 item menu merchant terlampaui"})
	}
	if len(result.Errors) > 0 {
		result.Committed = false
		_ = governance.CompleteCatalogImport(ctx, record.ID, "rejected", *result)
		return result, nil
	}
	result.CreatedCount = len(items)
	result.Committed = true
	if err := governance.BulkImportMenu(ctx, m.ID, record.ID, items, newCategories, *result); err != nil {
		result.Committed = false
		_ = governance.CompleteCatalogImport(ctx, record.ID, "failed", *result)
		return nil, err
	}
	return result, nil
}

func normalizeCSVColumn(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	return strings.NewReplacer(" ", "_", "-", "_", ".", "_").Replace(value)
}

func firstCSVColumn(columns map[string]int, names ...string) int {
	for _, name := range names {
		if index, ok := columns[name]; ok {
			return index
		}
	}
	return -1
}

func csvValue(row []string, index int) string {
	if index < 0 || index >= len(row) {
		return ""
	}
	return row[index]
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
	"stok_habis":     "Stok menu habis",
	"terlalu_sibuk":  "Merchant terlalu sibuk",
	"tutup_mendadak": "Tutup mendadak",
	"lainnya":        "Lainnya",
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
		"order_id":                   orderID,
		"reason":                     "Pesanan ditolak merchant: " + reason,
		"original_status":            "pending_merchant",
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
