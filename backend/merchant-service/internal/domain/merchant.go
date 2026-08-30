package domain

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Merchant — entitas merchant (FOOD-BIKE-003/015).
// verification_status: pending | approved | rejected (FOOD-BIKE-046).
// Merchant baru default pending, tidak bisa terima order sampai approved.
type Merchant struct {
	ID         string   `json:"id"`
	UserID     string   `json:"user_id"`
	OwnerEmail string   `json:"owner_email,omitempty"`
	OwnerPhone string   `json:"owner_phone,omitempty"`
	NamaToko   string   `json:"nama_toko"`
	Alamat     string   `json:"alamat"`
	LokasiLat  *float64 `json:"lokasi_lat,omitempty"`
	LokasiLng  *float64 `json:"lokasi_lng,omitempty"`
	JamBuka    *string  `json:"jam_buka,omitempty"`
	JamTutup   *string  `json:"jam_tutup,omitempty"`
	IsOpen     bool     `json:"is_open"`
	// FB-107: pause sementara sampai jam ini (NULL = tidak pause). Auto
	// un-pause ketika waktu habis — tidak mengubah is_open / jam operasional.
	PausedUntil *time.Time `json:"paused_until,omitempty"`
	// FB-109: minimum subtotal order (IDR). 0 = tanpa batas minimum.
	MinOrderIDR       int64   `json:"min_order_idr"`
	CompletionRatePct float64 `json:"completion_rate_pct"`
	// Staffing (X1/M1): jenis usaha. 'perorangan' = owner langsung tanpa
	// staff; 'perusahaan' = WAJIB punya staff management (merchant_staff).
	BusinessType       string `json:"business_type"`
	VerificationStatus string `json:"verification_status"`
	// Rating restoran (FOOD-BIKE-059/060): di-update order-service tiap
	// customer submit rating setelah order delivered.
	AvgRating   float64 `json:"avg_rating"`
	RatingCount int     `json:"rating_count"`
	// Dokumen pangan (FB-092): UU 33/2014 + PP 39/2021 (halal BPJPH),
	// PerBPOM 4/2024 (SPP-IRT / izin edar BPOM). Opsional saat daftar.
	// ADR 003: SEMUA opsional — bukan gate buka toko.
	HalalCertNumber  *string `json:"halal_cert_number,omitempty"`
	HalalExpiryDate  *string `json:"halal_expiry_date,omitempty"` // YYYY-MM-DD
	SppIrtNumber     *string `json:"spp_irt_number,omitempty"`
	SppIrtExpiryDate *string `json:"spp_irt_expiry_date,omitempty"` // YYYY-MM-DD
	BpomNumber       *string `json:"bpom_number,omitempty"`
	BpomExpiryDate   *string `json:"bpom_expiry_date,omitempty"` // YYYY-MM-DD
	// ADR 003 (2026-08-10): status halal untuk label + filter customer.
	// halal_certified | non_halal | unknown (default).
	HalalStatus string `json:"halal_status"`
	// Rekening bank untuk payout (FB-114) — di-update dari app; verifikasi
	// ulang oleh admin saat rekening berubah.
	BankName            *string   `json:"bank_name,omitempty"`
	BankAccountNumber   *string   `json:"bank_account_number,omitempty"`
	BankAccountHolder   *string   `json:"bank_account_holder,omitempty"`
	BankAccountVerified bool      `json:"bank_account_verified"`
	PayoutSchedule      string    `json:"payout_schedule"`
	NPWP                *string   `json:"npwp,omitempty"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

// HalalStatusValue — status halal merchant (ADR 003, model Grab/GoFood):
//
//	halal_certified = punya nomor + expiry valid (badge HALAL)
//	non_halal       = self-declare merchant (badge NON-HALAL)
//	unknown         = default, tanpa badge
//
// Fallback dari kolom lama kalau halal_status belum terisi (migrasi parsial).
func (m *Merchant) HalalStatusValue() string {
	if m.HalalStatus == "halal_certified" || m.HalalStatus == "non_halal" {
		return m.HalalStatus
	}
	// Backward-compat: turunkan dari sertifikat yang masih valid.
	if m.HalalCertNumber != nil && *m.HalalCertNumber != "" &&
		m.HalalExpiryDate != nil && *m.HalalExpiryDate != "" {
		if exp, err := time.Parse("2006-01-02", *m.HalalExpiryDate); err == nil && !exp.Before(time.Now().UTC()) {
			return "halal_certified"
		}
	}
	return "unknown"
}

// HalalCertValid — true kalau merchant punya sertifikat halal valid
// (nomor + expiry masa depan). Dipakai worker expiry → demote.
func (m *Merchant) HalalCertValid() bool {
	now := time.Now().UTC()
	if m.HalalCertNumber == nil || *m.HalalCertNumber == "" ||
		m.HalalExpiryDate == nil || *m.HalalExpiryDate == "" {
		return false
	}
	exp, err := time.Parse("2006-01-02", *m.HalalExpiryDate)
	return err == nil && !exp.Before(now)
}

// HalalStatusPtr — pointer halal_status untuk patch request (default unknown).
func (m *Merchant) HalalStatusPtr() *string {
	if m.HalalStatus == "" {
		s := "unknown"
		return &s
	}
	return &m.HalalStatus
}

// MerchantDocument — dokumen verifikasi (KTP pemilik, foto tempat usaha,
// rekening bank; NIB/izin usaha opsional). Pola courier_documents doc_type/file_url.
type MerchantDocument struct {
	ID         string    `json:"id"`
	MerchantID string    `json:"merchant_id"`
	DocType    string    `json:"doc_type"`
	FileURL    string    `json:"file_url"`
	UploadedAt time.Time `json:"uploaded_at"`
}

// MerchantOperatingHour adalah satu hari jadwal operasional. weekday mengikuti
// time.Weekday: Minggu=0 sampai Sabtu=6. Waktu berformat HH:MM.
type MerchantOperatingHour struct {
	MerchantID string  `json:"merchant_id,omitempty"`
	Weekday    int     `json:"weekday"`
	IsOpen     bool    `json:"is_open"`
	OpensAt    *string `json:"opens_at,omitempty"`
	ClosesAt   *string `json:"closes_at,omitempty"`
}

// MerchantSpecialClosure menutup toko pada satu tanggal lokal (WIB).
type MerchantSpecialClosure struct {
	ID          string `json:"id"`
	ClosureDate string `json:"closure_date"`
	Label       string `json:"label"`
}

type MerchantOperatingHoursResponse struct {
	Hours    []MerchantOperatingHour  `json:"hours"`
	Closures []MerchantSpecialClosure `json:"closures"`
}

// MerchantRepository — interface akses data merchant.
type MerchantRepository interface {
	// Create membuat merchant baru dengan status pending + dokumen verifikasi
	// dalam SATU transaksi.
	Create(ctx context.Context, m *Merchant, docs []MerchantDocument) error
	// GetByID ambil merchant by id.
	GetByID(ctx context.Context, id string) (*Merchant, error)
	// GetByUserID ambil merchant milik user (untuk profil/setting).
	GetByUserID(ctx context.Context, userID string) (*Merchant, error)
	// Update profil merchant (nama, alamat, lokasi, jam operasional).
	Update(ctx context.Context, m *Merchant) error
	// UpdateVerification set verification_status + approved_at (admin action).
	UpdateVerification(ctx context.Context, id, status string) error
	// ToggleOpen buka/tutup merchant.
	ToggleOpen(ctx context.Context, id string, isOpen bool) error
	// SetPaused (FB-107): pause sementara sampai waktu tertentu (nil = resume).
	// Tidak mengubah is_open — pause & buka/tutup adalah dua dimensi terpisah.
	SetPaused(ctx context.Context, id string, until *time.Time) error
	// ListByVerificationStatus list merchant untuk admin review (FOOD-BIKE-048).
	ListByVerificationStatus(ctx context.Context, status string, limit, offset int) ([]*Merchant, error)
	// CountByVerificationStatus total merchant per status (untuk pagination/badge).
	CountByVerificationStatus(ctx context.Context, status string) (int, error)
	// ListDocuments ambil dokumen verifikasi merchant.
	ListDocuments(ctx context.Context, merchantID string) ([]MerchantDocument, error)
	// UpdateFoodDocs update nomor + masa berlaku dokumen pangan + upsert
	// merchant_documents dalam satu transaksi.
	UpdateFoodDocs(ctx context.Context, m *Merchant, docs []MerchantDocument) error
	// UpdateBankAccount (FB-114): update rekening bank + reset verifikasi
	// (bank_account_verified=false) sampai admin setujui rekening baru.
	// changed=false → data sama persis, verifikasi dipertahankan.
	UpdateBankAccount(ctx context.Context, merchantID string, req UpdateBankAccountRequest, changed bool) error
	// ListCertifiedWithExpiredHalal merchant halal_certified dengan sertifikat
	// halal yang sudah kedaluwarsa (worker ADR 003 → auto-demote ke unknown).
	ListCertifiedWithExpiredHalal(ctx context.Context) ([]*Merchant, error)
	// SetHalalStatus (ADR 003): ubah halal_status (halal_certified/non_halal/unknown).
	SetHalalStatus(ctx context.Context, id, status string) error
	// ListForOperatingHoursSync merchant approved dengan jam_buka/jam_tutup
	// terisi — kandidat auto-toggle is_open sesuai jam operasional (FB-095).
	ListForOperatingHoursSync(ctx context.Context) ([]*Merchant, error)
	// Operating hours ZIP: jadwal per hari + tanggal tutup khusus.
	GetOperatingHours(ctx context.Context, merchantID string) ([]MerchantOperatingHour, error)
	ReplaceOperatingHours(ctx context.Context, merchantID string, hours []MerchantOperatingHour) error
	ListOperatingHoursForMerchants(ctx context.Context, merchantIDs []string) (map[string][]MerchantOperatingHour, error)
	ListSpecialClosuresOn(ctx context.Context, merchantIDs []string, date string) (map[string]bool, error)
	ListSpecialClosures(ctx context.Context, merchantID string) ([]MerchantSpecialClosure, error)
	CreateSpecialClosure(ctx context.Context, merchantID, date, label string) (*MerchantSpecialClosure, error)
	DeleteSpecialClosure(ctx context.Context, merchantID, closureID string) error
}

// Ensure sql import is used (tx helper di repository).
var _ = sql.ErrNoRows

// ── Staffing (X1/M1): business_type ──────────────────────────

// BusinessTypePerorangan / BusinessTypePerusahaan — nilai business_type.
const (
	BusinessTypePerorangan = "perorangan"
	BusinessTypePerusahaan = "perusahaan"
)

// ValidBusinessType — true kalau t valid ('perorangan'|'perusahaan').
func ValidBusinessType(t string) bool {
	return t == BusinessTypePerorangan || t == BusinessTypePerusahaan
}

// NormalizeBusinessType — default 'perorangan' kalau kosong, error kalau invalid.
func NormalizeBusinessType(t string) (string, error) {
	if t == "" {
		return BusinessTypePerorangan, nil
	}
	if !ValidBusinessType(t) {
		return "", errors.New("business_type tidak valid (perorangan|perusahaan)")
	}
	return t, nil
}

// IsCorporate — true kalau merchant bertipe perusahaan (wajib staff mgmt).
func (m *Merchant) IsCorporate() bool {
	return m.BusinessType == BusinessTypePerusahaan
}
