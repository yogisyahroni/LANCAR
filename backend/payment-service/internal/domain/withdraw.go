package domain

// WithdrawRequest adalah DTO tervalidasi yang merepresentasikan permintaan
// penarikan dana dari sisi pengguna. Semua field sudah melalui validasi
// input zero-trust di layer handler sebelum diteruskan ke service.
//
// Standar Keamanan:
//  - Amount        : integer (rupiah penuh), bukan float — mencegah floating-point exploit
//  - AccountNumber : hanya digit numerik, 10–18 karakter (standar BI)
//  - AccountHolder : strip karakter berbahaya, max 100 karakter
//  - BankCode      : hanya huruf besar A-Z, max 20 karakter
//  - IdempotencyKey: wajib diisi, UUID v4 format — mencegah double-submit
type WithdrawRequest struct {
	// Amount adalah nominal penarikan dalam satuan rupiah penuh (integer).
	// Minimum: 10_000, Maximum: 50_000_000 (batas per-transaksi sesuai policy).
	Amount int64 `json:"amount"`

	// AccountNumber hanya boleh berisi digit 0-9, panjang 10–18 digit.
	// Contoh valid: "1234567890" (BCA 10 digit), "098765432100" (BRI 12 digit).
	AccountNumber string `json:"account_number"`

	// AccountHolder adalah nama pemilik rekening sesuai data bank.
	// Hanya boleh mengandung huruf, spasi, dan tanda titik/apostrof.
	AccountHolder string `json:"account_holder"`

	// BankCode adalah kode bank tujuan sesuai standar SKNBI/BI.
	// Contoh: "BCA", "BNI", "MANDIRI", "BRI", "GOPAY", "OVO"
	BankCode string `json:"bank_code"`

	// IdempotencyKey adalah UUID v4 yang dihasilkan client untuk memastikan
	// tidak ada double-submit. Server menolak request dengan key yang sama.
	IdempotencyKey string `json:"idempotency_key"`
}

// WithdrawLimits menyimpan batas keamanan standar bank untuk validasi.
// Nilai ini bisa diambil dari system_configs di masa depan.
const (
	// WithdrawMinAmount batas minimum penarikan = Rp 10.000
	WithdrawMinAmount int64 = 10_000
	// WithdrawMaxAmount batas maksimum per-transaksi = Rp 50.000.000
	WithdrawMaxAmount int64 = 50_000_000
	// WithdrawDailyLimit batas kumulatif harian = Rp 100.000.000
	WithdrawDailyLimit int64 = 100_000_000
	// AccountNumberMinLen panjang minimal nomor rekening
	AccountNumberMinLen = 10
	// AccountNumberMaxLen panjang maksimal nomor rekening
	AccountNumberMaxLen = 18
)

// IsWithdrawIdempotent adalah method repository tambahan untuk
// memeriksa apakah permintaan tarik dana ini sudah diproses sebelumnya
// berdasarkan idempotency_key dari client.
// Definisi implementasinya ada di WalletRepository.
