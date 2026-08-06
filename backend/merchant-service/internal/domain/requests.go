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
}

// UpdateMerchantRequest — update profil merchant (nama, alamat, lokasi, jam).
type UpdateMerchantRequest struct {
	NamaToko  *string  `json:"nama_toko,omitempty"`
	Alamat    *string  `json:"alamat,omitempty"`
	LokasiLat *float64 `json:"lokasi_lat,omitempty"`
	LokasiLng *float64 `json:"lokasi_lng,omitempty"`
	JamBuka   *string  `json:"jam_buka,omitempty"`
	JamTutup  *string  `json:"jam_tutup,omitempty"`
}

// CreateMenuItemRequest — body buat/update menu item.
type CreateMenuItemRequest struct {
	Nama            string  `json:"nama"`
	Harga           int64   `json:"harga"`
	Foto            *string `json:"foto,omitempty"`
	Kategori        string  `json:"kategori"`
	PrepTimeMinutes int     `json:"prep_time_minutes"`
	IsAvailable     *bool   `json:"is_available,omitempty"`
}

// UpdateMenuItemRequest — body update menu item (semua opsional).
type UpdateMenuItemRequest struct {
	Nama            *string `json:"nama,omitempty"`
	Harga           *int64  `json:"harga,omitempty"`
	Foto            *string `json:"foto,omitempty"`
	Kategori        *string `json:"kategori,omitempty"`
	PrepTimeMinutes *int    `json:"prep_time_minutes,omitempty"`
	IsAvailable     *bool   `json:"is_available,omitempty"`
}

// MerchantOrderActionRequest — body accept/reject order food (FOOD-BIKE-017/021).
// Reject wajib isi reason; accept opsional.
type MerchantOrderActionRequest struct {
	Reason string `json:"reason,omitempty"`
}
