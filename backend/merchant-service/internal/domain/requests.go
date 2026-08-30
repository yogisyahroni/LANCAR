package domain

// RegisterMerchantRequest — body pendaftaran merchant (FOOD-BIKE-045).
// NIB/izin usaha opsional (banyak UMKM kuliner belum punya).
type RegisterMerchantRequest struct {
	NamaToko      string   `json:"nama_toko"`
	Alamat        string   `json:"alamat"`
	LokasiLat     *float64 `json:"lokasi_lat,omitempty"`
	LokasiLng     *float64 `json:"lokasi_lng,omitempty"`
	JamBuka       *string  `json:"jam_buka,omitempty"`
	JamTutup      *string  `json:"jam_tutup,omitempty"`
	KtpPemilikURL string   `json:"ktp_pemilik_url"`
	FotoTokoURL   string   `json:"foto_tempat_usaha_url"`
	RekeningURL   string   `json:"rekening_bank_url"`
	// NIB opsional
	NibURL *string `json:"nib_url,omitempty"`
	// Staffing (X1): jenis usaha. Diperlukan untuk conditional staff management.
	// 'perorangan' (default) | 'perusahaan'. Perusahaan wajib punya staff.
	BusinessType string `json:"business_type,omitempty"`

	// Dokumen pangan (FB-092 / ADR 003) — SEMUA OPSIONAL, bukan gate buka toko.
	// Nomor + tanggal kedaluwarsa; URL bukti dokumen.
	HalalCertNumber    *string `json:"halal_cert_number,omitempty"`
	HalalExpiryDate    *string `json:"halal_expiry_date,omitempty"` // YYYY-MM-DD, wajib jika nomor diisi
	SertifikatHalalURL *string `json:"sertifikat_halal_url,omitempty"`
	SppIrtNumber       *string `json:"spp_irt_number,omitempty"`
	SppIrtExpiryDate   *string `json:"spp_irt_expiry_date,omitempty"` // YYYY-MM-DD, wajib jika nomor diisi
	SppIrtURL          *string `json:"spp_irt_url,omitempty"`
	BpomNumber         *string `json:"bpom_number,omitempty"`
	BpomExpiryDate     *string `json:"bpom_expiry_date,omitempty"` // YYYY-MM-DD, wajib jika nomor diisi
	IzinEdarBPOMURL    *string `json:"izin_edar_bpom_url,omitempty"`
	// ADR 003: deklarasi halal — "non_halal" | "unknown" (default dihitung otomatis).
	HalalStatus *string `json:"halal_status,omitempty"`
}

// UpdateFoodDocsRequest — update/upload dokumen pangan merchant (FB-092).
// ADR 003: SEMUA dokumen opsional (soft-gate). halal_status menentukan label:
//
//	"halal_certified" (nomor+expiry valid, otomatis) | "non_halal" | "unknown".
type UpdateFoodDocsRequest struct {
	HalalCertNumber    *string `json:"halal_cert_number,omitempty"`
	HalalExpiryDate    *string `json:"halal_expiry_date,omitempty"`
	SertifikatHalalURL *string `json:"sertifikat_halal_url,omitempty"`
	SppIrtNumber       *string `json:"spp_irt_number,omitempty"`
	SppIrtExpiryDate   *string `json:"spp_irt_expiry_date,omitempty"`
	SppIrtURL          *string `json:"spp_irt_url,omitempty"`
	BpomNumber         *string `json:"bpom_number,omitempty"`
	BpomExpiryDate     *string `json:"bpom_expiry_date,omitempty"`
	IzinEdarBPOMURL    *string `json:"izin_edar_bpom_url,omitempty"`
	// ADR 003: deklarasi halal merchant — "non_halal" (self-declare) atau
	// "unknown". "halal_certified" tidak boleh dikirim manual (dihitung dari
	// nomor + expiry valid); kalau terisi, diabaikan.
	HalalStatus *string `json:"halal_status,omitempty"`
}

// UpdateMerchantRequest — update profil merchant (nama, alamat, lokasi, jam).
type UpdateMerchantRequest struct {
	NamaToko  *string  `json:"nama_toko,omitempty"`
	Alamat    *string  `json:"alamat,omitempty"`
	LokasiLat *float64 `json:"lokasi_lat,omitempty"`
	LokasiLng *float64 `json:"lokasi_lng,omitempty"`
	JamBuka   *string  `json:"jam_buka,omitempty"`
	JamTutup  *string  `json:"jam_tutup,omitempty"`
	// FB-109: minimum subtotal order (IDR). 0 = tanpa minimum.
	MinOrderIDR    *int64  `json:"min_order_idr,omitempty"`
	PayoutSchedule *string `json:"payout_schedule,omitempty"`
	NPWP           *string `json:"npwp,omitempty"`
}

type ReplaceMerchantOperatingHoursInput struct {
	Hours []MerchantOperatingHour `json:"hours"`
}

type CreateMerchantSpecialClosureInput struct {
	ClosureDate string `json:"closure_date"`
	Label       string `json:"label"`
}

// CreateMenuItemRequest — body buat/update menu item.
type CreateMenuItemRequest struct {
	Nama            string  `json:"nama"`
	Harga           int64   `json:"harga"`
	Foto            *string `json:"foto,omitempty"`
	Deskripsi       *string `json:"deskripsi,omitempty"`
	Kategori        string  `json:"kategori"`
	PrepTimeMinutes int     `json:"prep_time_minutes"`
	IsAvailable     *bool   `json:"is_available,omitempty"`
}

// UpdateMenuItemRequest — body update menu item (semua opsional).
type UpdateMenuItemRequest struct {
	Nama            *string `json:"nama,omitempty"`
	Harga           *int64  `json:"harga,omitempty"`
	Foto            *string `json:"foto,omitempty"`
	Deskripsi       *string `json:"deskripsi,omitempty"`
	Kategori        *string `json:"kategori,omitempty"`
	PrepTimeMinutes *int    `json:"prep_time_minutes,omitempty"`
	IsAvailable     *bool   `json:"is_available,omitempty"`
}

// MerchantOrderActionRequest — body accept/reject order food (FOOD-BIKE-017/021).
// Reject wajib isi reason; accept opsional.
// FB-122: reject_reason enum terstruktur — stok_habis | terlalu_sibuk |
// tutup_mendadak | lainnya. Reason (label) otomatis dari enum; boleh diisi
// detail tambahan lewat reason.
type MerchantOrderActionRequest struct {
	Reason       string `json:"reason,omitempty"`
	RejectReason string `json:"reject_reason,omitempty"`
}

// ── FB-108: varian menu ────────────────────────────────────────────────
// ReplaceMenuItemVariantsRequest — body PUT /merchant/menu/{id}/variants.
// Array kosong = hapus semua varian (kembali single-variant).
type ReplaceMenuItemVariantsRequest struct {
	Variants []ReplaceVariantGroup `json:"variants"`
}

// ReplaceVariantGroup — satu grup varian lengkap dengan opsi-opsinya.
type ReplaceVariantGroup struct {
	Nama       string                 `json:"nama" validate:"required,max=80"`
	IsRequired bool                   `json:"is_required"`
	MinSelect  int                    `json:"min_select"`
	MaxSelect  int                    `json:"max_select"`
	Options    []ReplaceVariantOption `json:"options"`
}

// ReplaceVariantOption — satu opsi varian (harga delta IDR, >= 0).
type ReplaceVariantOption struct {
	Nama       string `json:"nama" validate:"required,max=80"`
	PriceDelta int64  `json:"price_delta"`
}

// EditOrderItemRequest — item baru saat merchant edit order (FB-087).
type EditOrderItemRequest struct {
	MenuID   string `json:"menu_item_id"`
	Quantity int    `json:"quantity"`
	Notes    string `json:"notes,omitempty"`
}

// EditOrderItemsRequest — body edit item order oleh merchant (FB-087).
// Berlaku HANYA saat status pending_merchant (belum dikonfirmasi).
type EditOrderItemsRequest struct {
	Items []EditOrderItemRequest `json:"items"`
}

// CreateMerchantPromoRequest — body buat promo merchant (FB-099).
// discount_type: percent | fixed | buy1get1. max_discount_idr hanya
// relevan untuk percent (cap diskon). Harga tidak boleh negatif/nol.
type CreateMerchantPromoRequest struct {
	MenuItemID     *string `json:"menu_item_id,omitempty"`
	DiscountType   string  `json:"discount_type"`
	DiscountValue  int64   `json:"discount_value"`
	MaxDiscountIDR *int64  `json:"max_discount_idr,omitempty"`
	StartsAt       string  `json:"starts_at"` // RFC3339
	EndsAt         string  `json:"ends_at"`   // RFC3339
}

// UpdateMerchantPromoRequest — body update promo (patch, semua opsional).
type UpdateMerchantPromoRequest struct {
	MenuItemID     *string `json:"menu_item_id,omitempty"`
	DiscountType   *string `json:"discount_type,omitempty"`
	DiscountValue  *int64  `json:"discount_value,omitempty"`
	MaxDiscountIDR *int64  `json:"max_discount_idr,omitempty"`
	StartsAt       *string `json:"starts_at,omitempty"`
	EndsAt         *string `json:"ends_at,omitempty"`
}

// UpdateBankAccountRequest — body update rekening bank merchant (FB-114).
// Dipakai payout settlement (FB-113). Rekening baru butuh verifikasi ulang
// (bank_account_verified di-reset false sampai admin approve).
type UpdateBankAccountRequest struct {
	BankName          string `json:"bank_name"`
	BankAccountNumber string `json:"bank_account_number"`
	BankAccountHolder string `json:"bank_account_holder"`
	RekeningBankURL   string `json:"rekening_bank_url,omitempty"` // foto buku tabungan baru (opsional)
}
