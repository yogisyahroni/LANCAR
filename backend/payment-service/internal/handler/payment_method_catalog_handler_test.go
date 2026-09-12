package handler

import (
	"net/http/httptest"
	"testing"
)

func TestPaymentMethodCatalogRequiresMarketCurrencyAndValue(t *testing.T) {
	h := NewPaymentMethodCatalogHandler(nil)
	req := httptest.NewRequest("GET", "/api/v1/payment-methods?currency=IDR&amount_minor=1000", nil)
	res := httptest.NewRecorder()
	h.List(res, req)
	if res.Code != 400 {
		t.Fatalf("expected invalid context, got %d", res.Code)
	}
}
