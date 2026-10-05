package service

import (
	"context"
	"fmt"
	"time"

	"tembus/order-service/internal/domain"
)

// merchantPromoReader is additive so existing test doubles remain valid.
type merchantPromoReader interface {
	ListActiveMerchantPromos(ctx context.Context, merchantID string, now time.Time) ([]domain.ActiveMerchantPromo, error)
}

func computeFoodMerchantPromoDiscount(ctx context.Context, repo domain.FoodRepository, merchantID string, items []PromoItemLine, now time.Time) (int64, error) {
	reader, ok := repo.(merchantPromoReader)
	if !ok {
		return 0, nil
	}
	promos, err := reader.ListActiveMerchantPromos(ctx, merchantID, now)
	if err != nil {
		return 0, fmt.Errorf("list active merchant promos: %w", err)
	}
	rules := make([]MerchantPromoRule, 0, len(promos))
	for _, promo := range promos {
		menuItemID := ""
		if promo.MenuItemID != nil {
			menuItemID = *promo.MenuItemID
		}
		rules = append(rules, MerchantPromoRule{
			MenuItemID: menuItemID, DiscountType: promo.DiscountType,
			DiscountValue: promo.DiscountValue, MaxDiscountIDR: promo.MaxDiscountIDR,
		})
	}
	return ComputeMerchantPromoDiscount(items, rules), nil
}

func quoteItemPromoLines(items []domain.FoodQuoteItem) []PromoItemLine {
	lines := make([]PromoItemLine, 0, len(items))
	for _, item := range items {
		lines = append(lines, PromoItemLine{MenuItemID: item.MenuItemID, ItemPrice: item.UnitPrice, Quantity: item.Quantity, Subtotal: item.Subtotal})
	}
	return lines
}

func foodOrderItemPromoLines(items []domain.FoodOrderItem) []PromoItemLine {
	lines := make([]PromoItemLine, 0, len(items))
	for _, item := range items {
		lines = append(lines, PromoItemLine{MenuItemID: item.MenuItemID, ItemPrice: item.ItemPrice, Quantity: item.Quantity, Subtotal: item.Subtotal})
	}
	return lines
}

func merchantPromoSponsor(merchantDiscount, voucherDiscount int64) string {
	switch {
	case merchantDiscount > 0 && voucherDiscount > 0:
		return "merchant_and_platform"
	case merchantDiscount > 0:
		return "merchant"
	case voucherDiscount > 0:
		return "platform"
	default:
		return ""
	}
}
