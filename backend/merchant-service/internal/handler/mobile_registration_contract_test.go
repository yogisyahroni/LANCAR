package handler

import (
	"net/http/httptest"
	"testing"

	"tembus/merchant-service/internal/domain"
)

func TestEnforceMobileIndividualRegistration(t *testing.T) {
	tests := []struct {
		name         string
		channel      string
		businessType string
		wantType     string
		wantErr      bool
	}{
		{name: "android defaults to individual", channel: "android", wantType: "perorangan"},
		{name: "android accepts individual", channel: "ANDROID", businessType: "perorangan", wantType: "perorangan"},
		{name: "android rejects company", channel: "android", businessType: "perusahaan", wantErr: true},
		{name: "portal company lane unchanged", channel: "portal", businessType: "perusahaan", wantType: "perusahaan"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/api/v1/merchant/register", nil)
			req.Header.Set("X-Merchant-Registration-Channel", tt.channel)
			body := domain.RegisterMerchantRequest{BusinessType: tt.businessType}
			err := enforceMobileIndividualRegistration(req, &body)
			if (err != nil) != tt.wantErr {
				t.Fatalf("error = %v, wantErr %v", err, tt.wantErr)
			}
			if err == nil && body.BusinessType != tt.wantType {
				t.Fatalf("business type = %q, want %q", body.BusinessType, tt.wantType)
			}
		})
	}
}
