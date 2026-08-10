package service

import "testing"

// ── FB-101: unit test kalkulasi potongan promo merchant di settlement ──

func TestComputeMerchantPromoDiscount_Percent(t *testing.T) {
	items := []PromoItemLine{
		{MenuItemID: "m1", ItemPrice: 10000, Quantity: 2, Subtotal: 20000},
		{MenuItemID: "m2", ItemPrice: 15000, Quantity: 1, Subtotal: 15000},
	}
	// Merchant-wide promo 10%, cap 5000.
	promos := []MerchantPromoRule{
		{MenuItemID: "", DiscountType: "percent", DiscountValue: 10, MaxDiscountIDR: int64p(5000)},
	}
	got := ComputeMerchantPromoDiscount(items, promos)
	// m1: 20000*10% = 2000 (under cap). m2: 15000*10% = 1500. Total 3500.
	if got != 3500 {
		t.Fatalf("expected 3500, got %d", got)
	}
}

func TestComputeMerchantPromoDiscount_PercentCap(t *testing.T) {
	items := []PromoItemLine{
		{MenuItemID: "m1", ItemPrice: 100000, Quantity: 3, Subtotal: 300000},
	}
	promos := []MerchantPromoRule{
		{MenuItemID: "", DiscountType: "percent", DiscountValue: 20, MaxDiscountIDR: int64p(25000)},
	}
	got := ComputeMerchantPromoDiscount(items, promos)
	// 300000*20% = 60000 > cap 25000 → 25000.
	if got != 25000 {
		t.Fatalf("expected 25000 (cap), got %d", got)
	}
}

func TestComputeMerchantPromoDiscount_Fixed(t *testing.T) {
	items := []PromoItemLine{
		{MenuItemID: "m1", ItemPrice: 10000, Quantity: 3, Subtotal: 30000},
	}
	promos := []MerchantPromoRule{
		{MenuItemID: "m1", DiscountType: "fixed", DiscountValue: 2000},
	}
	got := ComputeMerchantPromoDiscount(items, promos)
	// 2000 * 3 = 6000.
	if got != 6000 {
		t.Fatalf("expected 6000, got %d", got)
	}
}

func TestComputeMerchantPromoDiscount_FixedCapSubtotal(t *testing.T) {
	items := []PromoItemLine{
		{MenuItemID: "m1", ItemPrice: 5000, Quantity: 2, Subtotal: 10000},
	}
	// Diskon 8000/item * 2 = 16000 > subtotal 10000 → cap 10000.
	promos := []MerchantPromoRule{
		{MenuItemID: "m1", DiscountType: "fixed", DiscountValue: 8000},
	}
	got := ComputeMerchantPromoDiscount(items, promos)
	if got != 10000 {
		t.Fatalf("expected 10000 (cap subtotal), got %d", got)
	}
}

func TestComputeMerchantPromoDiscount_Buy1Get1(t *testing.T) {
	items := []PromoItemLine{
		{MenuItemID: "m1", ItemPrice: 10000, Quantity: 3, Subtotal: 30000},
	}
	promos := []MerchantPromoRule{
		{MenuItemID: "m1", DiscountType: "buy1get1", DiscountValue: 0},
	}
	got := ComputeMerchantPromoDiscount(items, promos)
	// 3 item → 1 gratis (3/2 = 1) * 10000 = 10000.
	if got != 10000 {
		t.Fatalf("expected 10000 (1 gratis dari 3), got %d", got)
	}
}

func TestComputeMerchantPromoDiscount_ItemSpecificOnly(t *testing.T) {
	items := []PromoItemLine{
		{MenuItemID: "m1", ItemPrice: 10000, Quantity: 1, Subtotal: 10000},
		{MenuItemID: "m2", ItemPrice: 20000, Quantity: 1, Subtotal: 20000},
	}
	// Promo hanya untuk m1 — m2 tidak kena.
	promos := []MerchantPromoRule{
		{MenuItemID: "m1", DiscountType: "percent", DiscountValue: 50},
	}
	got := ComputeMerchantPromoDiscount(items, promos)
	// m1: 10000*50% = 5000. m2: 0. Total 5000.
	if got != 5000 {
		t.Fatalf("expected 5000 (hanya m1), got %d", got)
	}
}

func TestComputeMerchantPromoDiscount_NoPromos(t *testing.T) {
	items := []PromoItemLine{{MenuItemID: "m1", ItemPrice: 10000, Quantity: 1, Subtotal: 10000}}
	got := ComputeMerchantPromoDiscount(items, nil)
	if got != 0 {
		t.Fatalf("expected 0 tanpa promo, got %d", got)
	}
}

func TestComputeMerchantPromoDiscount_TotalCapSubtotal(t *testing.T) {
	items := []PromoItemLine{
		{MenuItemID: "m1", ItemPrice: 10000, Quantity: 1, Subtotal: 10000},
		{MenuItemID: "m2", ItemPrice: 5000, Quantity: 1, Subtotal: 5000},
	}
	// Diskon 100% untuk semua — total diskon 15000 = subtotal. Tidak boleh > subtotal.
	promos := []MerchantPromoRule{
		{MenuItemID: "", DiscountType: "percent", DiscountValue: 100},
	}
	got := ComputeMerchantPromoDiscount(items, promos)
	if got != 15000 {
		t.Fatalf("expected 15000 (cap total subtotal), got %d", got)
	}
}

func int64p(v int64) *int64 { return &v }
