package service

// ── FB-101: potongan promo merchant di settlement ────────────────────────
// Promo merchant (merchant_promos) DIBIAYAI merchant — diskonnya mengurangi
// payout merchant (merchant_net), BUKAN komisi PT. Saat settlement food
// dibuat, hitung diskon dari promo aktif yang match menu item order.

// PromoItemLine — satu baris item order yang ikut kalkulasi diskon.
type PromoItemLine struct {
	MenuItemID string
	ItemPrice  int64 // harga satuan snapshot saat order
	Quantity   int   // kuantitas
	Subtotal   int64 // item_price * quantity
}

// MerchantPromoRule — snapshot promo aktif merchant dari tabel merchant_promos.
type MerchantPromoRule struct {
	MenuItemID     string // "" = promo seluruh menu (merchant-wide)
	DiscountType   string // percent | fixed | buy1get1
	DiscountValue  int64
	MaxDiscountIDR *int64
}

// ComputeMerchantPromoDiscount menghitung total potongan promo merchant
// untuk satu order: cari promo aktif yang match (menu-wide atau per item),
// pakai diskon terbesar per item, cap di subtotal item & max_discount.
// Return total potongan (>= 0, tidak pernah melebihi total subtotal).
func ComputeMerchantPromoDiscount(items []PromoItemLine, promos []MerchantPromoRule) int64 {
	var total int64

	// Index promo per menu item: "all" = merchant-wide, "item:<id>" = spesifik.
	type rule struct {
		promo   MerchantPromoRule
		applied bool
	}
	byItem := map[string][]MerchantPromoRule{}
	for _, p := range promos {
		key := "all"
		if p.MenuItemID != "" {
			key = "item:" + p.MenuItemID
		}
		byItem[key] = append(byItem[key], p)
	}

	for _, line := range items {
		// Kumpulkan kandidat promo untuk item ini: merchant-wide + item-specific.
		candidates := append([]MerchantPromoRule{}, byItem["all"]...)
		if line.MenuItemID != "" {
			candidates = append(candidates, byItem["item:"+line.MenuItemID]...)
		}
		if len(candidates) == 0 {
			continue
		}

		best := int64(0)
		for _, c := range candidates {
			d := promoDiscountForLine(c, line)
			if d > best {
				best = d
			}
		}
		// Cap di subtotal item — diskon tidak boleh bikin item jadi negatif.
		if best > line.Subtotal {
			best = line.Subtotal
		}
		total += best
	}

	// Safety net: total tidak pernah melebihi total subtotal seluruh order.
	var sumSubtotal int64
	for _, l := range items {
		sumSubtotal += l.Subtotal
	}
	if total > sumSubtotal {
		total = sumSubtotal
	}
	return total
}

// promoDiscountForLine — diskon SATU promo terhadap SATU baris item.
func promoDiscountForLine(promo MerchantPromoRule, line PromoItemLine) int64 {
	switch promo.DiscountType {
	case "percent":
		// value = persen (1-100). Diskon = subtotal * pct / 100.
		if promo.DiscountValue <= 0 || promo.DiscountValue > 100 {
			return 0
		}
		d := line.Subtotal * promo.DiscountValue / 100
		if promo.MaxDiscountIDR != nil && *promo.MaxDiscountIDR > 0 && d > *promo.MaxDiscountIDR {
			d = *promo.MaxDiscountIDR
		}
		return d
	case "fixed":
		// value = potongan per item (Rp). Cap di subtotal baris.
		if promo.DiscountValue <= 0 {
			return 0
		}
		d := promo.DiscountValue * int64(line.Quantity)
		if d > line.Subtotal {
			d = line.Subtotal
		}
		return d
	case "buy1get1":
		// beli 1 gratis 1: tiap 2 item, 1 gratis = potongan 1x harga satuan.
		if line.ItemPrice <= 0 {
			return 0
		}
		free := int64(line.Quantity / 2)
		d := free * line.ItemPrice
		if d > line.Subtotal {
			d = line.Subtotal
		}
		return d
	}
	return 0
}
