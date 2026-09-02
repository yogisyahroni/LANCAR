package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"tembus/integration-gateway/internal/domain"
)

type tariffInputProbe struct {
	request domain.TariffRequest
}

func (p *tariffInputProbe) CheckTariff(_ context.Context, request domain.TariffRequest) (*domain.TariffResponse, error) {
	p.request = request
	return &domain.TariffResponse{
		Provider: "probe",
		Services: []domain.TariffServiceOption{{ServiceCode: "REG", ServiceName: "Regular", TariffGross: 15000}},
	}, nil
}

type handlerRegistryProbe struct {
	registration domain.ProviderRegistration
}

func (r handlerRegistryProbe) Get(_ string) (domain.ProviderRegistration, bool) {
	return r.registration, true
}
func (r handlerRegistryProbe) List() []domain.ProviderDescriptor        { return nil }
func (r handlerRegistryProbe) Validate() error                          { return nil }
func (r handlerRegistryProbe) Diagnostics() []domain.ProviderDiagnostic { return nil }

func TestCheckTariffPreservesCompleteQuoteInputContract(t *testing.T) {
	probe := &tariffInputProbe{}
	h := NewLogisticsHandler(handlerRegistryProbe{registration: domain.ProviderRegistration{
		Descriptor: domain.ProviderDescriptor{Code: "probe", Name: "Probe", Available: true},
		Tariff:     probe,
	}})

	req := httptest.NewRequest(http.MethodGet, "/api/internal/logistics/tariff?provider=probe&origin=JKT-01&destination=BDG-02&weight=2.50&length_cm=30&width_cm=20&height_cm=10&item_value_idr=250000&category=fragile%20food&insurance=true&cod=true", nil)
	recorder := httptest.NewRecorder()
	h.CheckTariff(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if probe.request.OriginCode != "JKT-01" || probe.request.DestinationCode != "BDG-02" || probe.request.WeightKG != 2.5 {
		t.Fatalf("route input was not forwarded: %#v", probe.request)
	}
	if probe.request.LengthCM != 30 || probe.request.WidthCM != 20 || probe.request.HeightCM != 10 || probe.request.ItemValueIDR != 250000 {
		t.Fatalf("package quote inputs were not forwarded: %#v", probe.request)
	}
	if probe.request.Category != "fragile food" || !probe.request.Insurance || !probe.request.COD {
		t.Fatalf("commercial quote inputs were not forwarded: %#v", probe.request)
	}

	var envelope map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if envelope["success"] != true {
		t.Fatalf("expected successful tariff envelope: %#v", envelope)
	}
}
