package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Voucher — FB-078: diskon yang bisa di-redeem customer saat checkout.
// Tabel `vouchers` sudah ada (migration 00008) — CRUD admin di admin-service.
// Nilai default-nya server-side, client hanya kirim kode (zero-trust).
type Voucher struct {
	ID               uuid.UUID  `json:"id" db:"id"`
	Code             string     `json:"code" db:"code"`
	Name             string     `json:"name" db:"name"`
	Type             string     `json:"type" db:"type"` // percentage | fixed | free_shipping | sla_compensation
	Value            int        `json:"value" db:"value"`
	MaxDiscountIDR   *int       `json:"max_discount_idr,omitempty" db:"max_discount_idr"`
	MinOrderIDR      int        `json:"min_order_idr" db:"min_order_idr"`
	Quota            *int       `json:"quota,omitempty" db:"quota"`
	UsedCount        int        `json:"used_count" db:"used_count"`
	IsActive         bool       `json:"is_active" db:"is_active"`
	IsSingleUse      bool       `json:"is_single_use" db:"is_single_use"`
	ApplicableModels []string   `json:"applicable_models,omitempty" db:"applicable_models"`
	ValidFrom        time.Time  `json:"valid_from" db:"valid_from"`
	ValidUntil       *time.Time `json:"valid_until,omitempty" db:"valid_until"`
	CreatedAt        time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at" db:"updated_at"`
}

// VoucherValidationResult — hasil validasi + hitung diskon untuk preview
// customer (POST /api/v1/vouchers/validate) dan saat apply di create order.
type VoucherValidationResult struct {
	VoucherID   uuid.UUID `json:"voucher_id"`
	Code        string    `json:"code"`
	Name        string    `json:"name"`
	DiscountIDR int64     `json:"discount_idr"`
	// Harga yang dijadikan basis diskon (subtotal + deliveryFee, sebelum platform fee).
	// Percentage dihitung dari base; fixed langsung. Dibatasi max_discount_idr.
	Valid bool   `json:"valid"`
	Error string  `json:"error,omitempty"`
}

// VoucherRepository — akses data voucher (order-service).
type VoucherRepository interface {
	// GetActiveByCode ambil voucher aktif by kode (tanpa validasi aturan —
	// validasi di service).
	GetActiveByCode(ctx context.Context, code string) (*Voucher, error)
	// HasUserUsed true kalau user pernah pakai voucher ini (untuk is_single_use).
	HasUserUsed(ctx context.Context, voucherID, userID uuid.UUID) (bool, error)
	// ApplyUsage catat pemakaian + increment used_count dalam SATU transaksi.
	// Idempotent via UNIQUE(voucher_id, order_id): kalau sudah tercatat utk order
	// yang sama, tidak dobel.
	ApplyUsage(ctx context.Context, voucherID, orderID, userID uuid.UUID, discountIDR int64) error
}

// VoucherService — validasi & apply voucher di checkout (implementasi: service).
type VoucherService interface {
	// Validate memvalidasi kode voucher untuk (user, base amount, model).
	// Mengembalikan hasil valid + diskon untuk preview customer.
	Validate(ctx context.Context, code, userID string, baseIDR int64, model string) (*VoucherValidationResult, error)
	// Apply memvalidasi ulang + catat pemakaian (dipanggil dalam create order).
	// orderID dipakai untuk idempotency voucher_usages.
	Apply(ctx context.Context, code, userID, orderID string, baseIDR int64, model string) (*VoucherValidationResult, error)
	// RecordUsage mencatat pemakaian voucher TANPA validasi ulang.
	// Dipanggil SETELAH order berhasil dibuat — menghindari usage tercatat
	// padahal order gagal disimpan (single-use voucher tidak hangus).
	RecordUsage(ctx context.Context, voucherID, orderID, userID uuid.UUID, discountIDR int64) error
}
