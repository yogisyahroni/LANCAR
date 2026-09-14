package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestInternalWalletMutationsFailClosedWithoutServiceCredential(t *testing.T) {
	t.Setenv("INTERNAL_PAYMENT_API_KEY", "wallet-service-test-key")
	h := NewWalletHandler(nil)

	tests := []struct {
		name string
		path string
		call func(http.ResponseWriter, *http.Request)
	}{
		{name: "refund", path: "refund", call: h.Refund},
		{name: "sos penalty", path: "sos-penalty", call: h.SosPenalty},
		{name: "sos reward", path: "sos-reward", call: h.SosReward},
		{name: "tip", path: "tip", call: h.Tip},
		{name: "tip refund", path: "tip/refund", call: h.TipRefund},
		{name: "hold deduct", path: "hold-deduct", call: h.HoldDeduct},
		{name: "hold autorefill", path: "hold-autorefill", call: h.HoldAutoRefill},
		{name: "hold minimum", path: "hold-minimum", call: h.SetHoldMinimum},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/internal/wallet/"+tt.path, nil)
			res := httptest.NewRecorder()
			tt.call(res, req)
			if res.Code != http.StatusUnauthorized {
				t.Fatalf("expected fail-closed 401, got %d: %s", res.Code, res.Body.String())
			}
		})
	}
}
