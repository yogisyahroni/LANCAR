package domain

import "errors"

type BalanceType string

const (
	BalanceCustomerCredit  BalanceType = "CUSTOMER_CREDIT"
	BalanceRefundCredit    BalanceType = "REFUND_CREDIT"
	BalanceMerchantPayable BalanceType = "MERCHANT_PAYABLE"
	BalanceCourierEarnings BalanceType = "COURIER_EARNINGS"
	BalanceAds             BalanceType = "ADS_BALANCE"
	BalancePromotional     BalanceType = "PROMOTIONAL_CREDIT"
)

var ErrPromotionalBalanceNotWithdrawable = errors.New("promotional credit cannot be withdrawn as cash")

// ValidateBalanceOperation keeps promotional liability separate from cash
// balances. Persistence must still use a transaction and unique idempotency
// key when applying the operation.
func ValidateBalanceOperation(balanceType BalanceType, entryType string, amountMinor int64) error {
	if amountMinor <= 0 {
		return errors.New("balance amount must be positive")
	}
	if balanceType == BalancePromotional && (entryType == "WITHDRAW" || entryType == "DISBURSE") {
		return ErrPromotionalBalanceNotWithdrawable
	}
	return nil
}
