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
	CompletionRatePct  float64    `json:"completion_rate_pct"`
	VerificationStatus string     `json:"verification_status"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
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
	// ListByVerificationStatus list merchant untuk admin review (FOOD-BIKE-048).
	ListByVerificationStatus(ctx context.Context, status string, limit, offset int) ([]*Merchant, error)
	// CountByVerificationStatus total merchant per status (untuk pagination/badge).
	CountByVerificationStatus(ctx context.Context, status string) (int, error)
	// ListDocuments ambil dokumen verifikasi merchant.
	ListDocuments(ctx context.Context, merchantID string) ([]MerchantDocument, error)
}

// Ensure sql import is used (tx helper di repository).
var _ = sql.ErrNoRows
