package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"tembus/integration-gateway/internal/domain"
)

func TestJNEProvider_CheckTariff(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/tracing/api/pricedev" {
			t.Errorf("Expected path /tracing/api/pricedev, got %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("Expected method POST, got %s", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{
			"price": [
				{
					"service_display": "REG",
					"service_code": "REG1",
					"price": "15000",
					"etd_from": "1",
					"etd_thru": "2"
				}
			]
		}`))
	}))
	defer ts.Close()

	os.Setenv("JNE_BASE_URL", ts.URL)
	os.Setenv("JNE_API_KEY", "test_key")
	os.Setenv("JNE_USERNAME", "test_user")

	provider := NewJNEProvider()
	resp, err := provider.CheckTariff(context.Background(), domain.TariffRequest{
		OriginCode:      "CGK10000",
		DestinationCode: "BDO10000",
		WeightKG:        1.0,
		ServiceType:     "REG",
	})

	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}
	if len(resp.Services) == 0 {
		t.Fatalf("Expected at least one service option, got none")
	}
	if resp.Services[0].TariffGross != 15000 {
		t.Errorf("Expected tariff 15000, got %d", resp.Services[0].TariffGross)
	}
	if resp.Provider != "JNE" {
		t.Errorf("Expected provider JNE, got %s", resp.Provider)
	}
}

func TestJNTProvider_CreateOrder(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/jts-id-open-api/api/order/create" {
			t.Errorf("Expected path /jts-id-open-api/api/order/create, got %s", r.URL.Path)
		}
		r.ParseForm()
		if r.FormValue("msg_type") != "ORDERCREATE" {
			t.Errorf("Expected msg_type ORDERCREATE, got %s", r.FormValue("msg_type"))
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{
			"code": "1",
			"msg": "success",
			"billcode": "JP1234567890",
			"txlogisticid": "ORD-001",
			"sortingcode": "JKT-01",
			"totalshippingfee": "20000"
		}`))
	}))
	defer ts.Close()

	os.Setenv("JNT_BASE_URL", ts.URL)
	os.Setenv("JNT_API_ACCOUNT", "test_account")
	os.Setenv("JNT_PRIVATE_KEY", "test_secret")
	os.Setenv("JNT_CUSTOMER_CODE", "CUST_001")

	provider := NewJNTProvider()
	resp, err := provider.CreateOrder(context.Background(), domain.LogisticsOrderRequest{
		ReferenceID:     "ORD-001",
		SenderName:      "Budi",
		SenderPhone:     "081234567890",
		SenderAddress:   "Jl. Sudirman No 1",
		ReceiverName:    "Siti",
		ReceiverPhone:   "089876543210",
		ReceiverAddress: "Jl. Asia Afrika No 2",
		OriginCode:      "JAKARTA",
		DestinationCode: "BANDUNG",
		WeightKG:        1.5,
		ServiceType:     "EZ",
	})

	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}
	if resp.AWBNumber != "JP1234567890" {
		t.Errorf("Expected AWB JP1234567890, got %s", resp.AWBNumber)
	}
	if resp.TotalAmount != 20000 {
		t.Errorf("Expected total amount 20000, got %f", resp.TotalAmount)
	}
}
