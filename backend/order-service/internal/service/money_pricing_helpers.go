package service

import "tembus/order-service/internal/domain"

// applyProviderTariffPolicy applies provider discount first and marketplace
// markup second. Both operations use canonical integer money arithmetic.
func applyProviderTariffPolicy(gross int64, discountPct, markupPct float64) (net, customer int64, err error) {
	grossMoney := domain.LegacyIDR(gross)
	discountMoney, err := grossMoney.MultiplyPercent(discountPct)
	if err != nil {
		return 0, 0, err
	}
	netMoney, err := grossMoney.Sub(discountMoney)
	if err != nil {
		return 0, 0, err
	}
	markupMoney, err := netMoney.MultiplyPercent(markupPct)
	if err != nil {
		return 0, 0, err
	}
	customerMoney, err := netMoney.Add(markupMoney)
	if err != nil {
		return 0, 0, err
	}
	return netMoney.AmountMinor, customerMoney.AmountMinor, nil
}

func legacyLedgerIDR(currency string, amount int64) int64 {
	if currency == "IDR" {
		return amount
	}
	return 0
}
