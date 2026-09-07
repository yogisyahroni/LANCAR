package domain

import "testing"

func TestValidateFoodMultiStoreMerchants(t *testing.T) {
	if err := ValidateFoodMultiStoreMerchants([]string{"merchant-a", "merchant-b"}); err != nil { t.Fatal(err) }
	if err := ValidateFoodMultiStoreMerchants([]string{"merchant-a", "merchant-a"}); err == nil { t.Fatal("duplicate merchant must be rejected") }
	if err := ValidateFoodMultiStoreMerchants([]string{"merchant-a"}); err == nil { t.Fatal("single merchant must use normal food order") }
}
