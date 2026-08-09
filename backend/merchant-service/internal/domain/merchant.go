package domain

import (
	"context"
	"database/sql"
	"time"
)

// Merchant — entitas merchant (FOOD-BIKE-003/015).
// verification_status: pending | approved | rejected (FOOD-BIKE-046).
// Merchant baru default pending, tidak bisa terima order sampai approved.
type Merchant struct {
	ID                 string     `json:"id"`
	UserID             string     `json:"user_id"`
	NamaToko           string     `json:"nama_toko"`
	Alamat             string     `json:"alamat"`
	LokasiLat          *float64   `json:"lokasi_lat,omitempty"`
	LokasiLng          *float64   `json:"lokasi_lng,omitempty"`
	JamBuka            *string    `json:"jam_buka,omitempty"`
	JamTutup           *string    `json:"jam_tutup,omitempty"`
	IsOpen             bool       `json:"is_open"`
	// FB-107: pause sementara sampai jam ini (NULL = tidak pause). Auto
	// un-pause ketika waktu habis — tidak mengubah is_open / jam operasional.
	PausedUntil        *time.Time `json:"paused_until,omitempty"`
	CompletionRatePct  float64    `json:"completion_rate_pct"`
	VerificationStatus string     `json:"verification_status"`
	// Rating restoran (FOOD-BIKE-059/060): di-update order-service tiap
	// customer submit rating setelah order delivered.
	AvgRating          float64    `json:"avg_rating"`
	RatingCount        int        `json:"rating_count"`
	// Dokumen pangan (FB-092): UU 33/2014 + PP 39/2021 (halal BPJPH),
	// PerBPOM 4/2024 (SPP-IRT / izin edar BPOM). Opsional saat daftar,
	// WAJIB lengkap & belum expired sebelum is_open = true.
	HalalCertNumber   *string    `json:"halal_cert_number,omitempty"`
	HalalExpiryDate   *string    `json:"halal_expiry_date,omitempty"` // YYYY-MM-DD
	SppIrtNumber      *string    `json:"spp_irt_number,omitempty"`
	SppIrtExpiryDate  *string    `json:"spp_irt_expiry_date,omitempty"` // YYYY-MM-DD
	BpomNumber        *string    `json:"bpom_number,omitempty"`
	BpomExpiryDate    *string    `json:"bpom_expiry_date,omitempty"` // YYYY-MM-DD
	// Rekening bank untuk payout (FB-114) — di-update dari app; verifikasi
	// ulang oleh admin saat rekening berubah.
	BankName             *string  `json:"bank_name,omitempty"`
	BankAccountNumber    *string  `json:"bank_account_number,omitempty"`
	BankAccountHolder    *string  `json:"bank_account_holder,omitempty"`
	BankAccountVerified  bool     `json:"bank_account_verified"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// FoodDocsReady — gate FB-092 untuk buka toko: (1) sertifikat halal terisi &
// belum expired, DAN (2) salah satu SPP-IRT / izin edar BPOM terisi & belum
// expired. Dipakai service ToggleOpen (pesan error detail) DAN worker
// auto jam operasional (FB-095) supaya auto-buka tidak melanggar KYC.
// Logika harus SINKRON dengan validateFoodDocsReady di service.
func (m *Merchant) FoodDocsReady() bool {
	now := time.Now().UTC()

	hasHalal := m.HalalCertNumber != nil && *m.HalalCertNumber != "" &&
		m.HalalExpiryDate != nil && *m.HalalExpiryDate != ""
	if !hasHalal {
		return false
	}
	if exp, err := time.Parse("2006-01-02", *m.HalalExpiryDate); err != nil || exp.Before(now) {
		return false
	}

	hasSpp := m.SppIrtNumber != nil && *m.SppIrtNumber != "" &&
		m.SppIrtExpiryDate != nil && *m.SppIrtExpiryDate != ""
	hasBpom := m.BpomNumber != nil && *m.BpomNumber != "" &&
		m.BpomExpiryDate != nil && *m.BpomExpiryDate != ""
	if !hasSpp && !hasBpom {
		return false
	}
	if hasSpp {
		if exp, err := time.Parse("2006-01-02", *m.SppIrtExpiryDate); err == nil && exp.Before(now) {
			return false
		}
	}
	if hasBpom {
		if exp, err := time.Parse("2006-01-02", *m.BpomExpiryDate); err == nil && exp.Before(now) {
			return false
		}
	}
	return true
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
	// ListOpenWithExpiredFoodDocs merchant is_open=true dengan dokumen pangan
	// yang sudah kedaluwarsa (untuk worker auto-suspend FB-092).
	ListOpenWithExpiredFoodDocs(ctx context.Context) ([]*Merchant, error)
	// ListForOperatingHoursSync merchant approved dengan jam_buka/jam_tutup
	// terisi — kandidat auto-toggle is_open sesuai jam operasional (FB-095).
	ListForOperatingHoursSync(ctx context.Context) ([]*Merchant, error)
}

// Ensure sql import is used (tx helper di repository).
var _ = sql.ErrNoRows
