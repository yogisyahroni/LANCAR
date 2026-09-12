package domain

import "testing"

func TestPromotionalCreditCannotBecomeWithdrawableCash(t *testing.T) {
	if err := ValidateBalanceOperation(BalancePromotional, "WITHDRAW", 100); err != ErrPromotionalBalanceNotWithdrawable {
		t.Fatalf("expected promotional credit withdrawal to be rejected, got %v", err)
	}
	if err := ValidateBalanceOperation(BalanceCourierEarnings, "DISBURSE", 100); err != nil {
		t.Fatalf("courier earnings should support disbursement: %v", err)
	}
}
