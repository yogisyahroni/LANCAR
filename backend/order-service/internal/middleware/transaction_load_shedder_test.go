package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTransactionLoadShedderRejectsWhenCapacityIsFull(t *testing.T) {
	shedder := NewTransactionLoadShedder(1)
	if !shedder.TryAcquire() {
		t.Fatal("expected first transaction slot to be available")
	}

	called := 0
	handler := shedder.Wrap(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		called++
	}))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/orders", nil)
	req.Header.Set(correlationIDHeader, "corr-load-shed")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", res.Code)
	}
	if called != 0 {
		t.Fatalf("handler ran while capacity was full: %d", called)
	}
	if got := res.Header().Get("X-Load-Shed"); got != "transaction-capacity" {
		t.Fatalf("expected load-shed header, got %q", got)
	}
	if shedder.InFlight() != 1 {
		t.Fatalf("rejected request changed in-flight count: %d", shedder.InFlight())
	}

	shedder.Release()
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/api/v1/orders", nil))
	if called != 1 || shedder.InFlight() != 0 {
		t.Fatalf("expected released slot to be reused, called=%d in_flight=%d", called, shedder.InFlight())
	}
}

func TestTransactionLoadShedderDoesNotLimitQuoteReads(t *testing.T) {
	shedder := NewTransactionLoadShedder(1)
	if !shedder.TryAcquire() {
		t.Fatal("expected first transaction slot to be available")
	}
	called := false
	handler := shedder.Wrap(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true }))
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/api/v1/orders/food/quote", nil))
	if !called {
		t.Fatal("quote request should remain available while writes are saturated")
	}
	shedder.Release()
}

func TestTransactionLoadShedderUsesConfiguredDefault(t *testing.T) {
	shedder := NewTransactionLoadShedder(0)
	if shedder.Limit() != defaultTransactionalInFlight {
		t.Fatalf("expected default limit %d, got %d", defaultTransactionalInFlight, shedder.Limit())
	}
}
