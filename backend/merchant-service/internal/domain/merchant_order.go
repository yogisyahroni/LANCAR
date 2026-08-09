package domain

import "context"

// MerchantOrderRepository — akses order food milik merchant + transisi status.
// Semua service LANCAR share DB tembus, jadi merchant-service membaca/meng-update
// tabel orders langsung (konsisten dengan payment-service yang akses wallets).
type MerchantOrderRepository interface {
	// AcceptOrder: status pending_merchant → preparing, set merchant_accepted_at.
	AcceptOrder(ctx context.Context, merchantID, orderID string) error
	// RejectOrder: status pending_merchant → cancelled_by_merchant + reason.
	// FB-122: rejectReason adalah enum terstruktur (stok_habis/terlalu_sibuk/
	// tutup_mendadak/lainnya) untuk analitik; reason label ramah customer.
	RejectOrder(ctx context.Context, merchantID, orderID, reason, rejectReason string) error
	// ListByMerchant list order food merchant (dengan items), filter status.
	ListByMerchant(ctx context.Context, merchantID, status string, limit, offset int) ([]*MerchantOrderView, error)
	// CountByMerchant total order merchant untuk filter status.
	CountByMerchant(ctx context.Context, merchantID, status string) (int, error)
	// GetOrderForStruk ambil order food milik merchant + items untuk struk (FOOD-BIKE-034).
	GetOrderForStruk(ctx context.Context, merchantID, orderID string) (*StrukData, error)
	// RecordOrderEvent (FB-081): catat event ke order_events — dipakai saat
	// merchant reject order supaya customer/tracking dapat jejak pembatalan.
	RecordOrderEvent(ctx context.Context, orderID, eventType, description string) error
	// GetOrderForEdit (FB-087): ambil order food milik merchant untuk edit item
	// (status harus pending_merchant). Return snapshot harga lama + items.
	GetOrderForEdit(ctx context.Context, merchantID, orderID string) (*OrderEditData, error)
	// ReplaceOrderItems (FB-087): dalam SATU transaksi — hapus food_order_items,
	// insert snapshot items baru, update base_price/dynamic_price/platform_fee/total.
	ReplaceOrderItems(ctx context.Context, orderID string, items []FoodOrderItemSnapshot, subtotal, platformFee, total int64) error
	// GetOrderItemVariantDeltas (AUDIT-FIX M3): total price_delta varian per
	// menu_item_id untuk order ini (varian yang akan di-restore saat edit) —
	// dipakai service supaya subtotal edit menyertakan delta varian.
	GetOrderItemVariantDeltas(ctx context.Context, orderID string) (map[string]int64, error)
}

// FoodOrderItemSnapshot — snapshot item untuk replace saat edit order (FB-087).
// Harga diambil dari menu SEKARANG (server-side, zero-trust), nama beku di
// snapshot supaya struk/tracking konsisten walau menu berubah nama.
type FoodOrderItemSnapshot struct {
	MenuItemID string
	ItemName   string
	ItemPrice  int64
	Quantity   int
	Notes      string
	Subtotal   int64
}

// OrderEditData — data order untuk edit item oleh merchant (FB-087).
// Hanya order status pending_merchant milik merchant yang boleh di-edit.
type OrderEditData struct {
	ID             string
	Status         string
	SubtotalOldIDR int64
	DeliveryFeeIDR int64
	PlatformFeeIDR int64
	PlatformFeePct float64
	DiscountIDR    int64
	Items          []FoodOrderItemView
}

// EditOrderResult — hasil edit item order (FB-087): harga baru terhitung.
type EditOrderResult struct {
	OrderID       string `json:"order_id"`
	SubtotalIDR   int64  `json:"subtotal_idr"`
	PlatformFeeIDR int64  `json:"platform_fee_idr"`
	TotalIDR      int64  `json:"total_idr"`
}
