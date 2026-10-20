package service

import (
	"context"
	"strings"
	"testing"

	"tembus/order-service/internal/domain"
)

type fakeResiOrderRepo struct {
	domain.OrderRepository
	order      *domain.Order
	senderName string
}

func (f *fakeResiOrderRepo) GetByAWB(context.Context, string) (*domain.Order, error) {
	return f.order, nil
}

func (f *fakeResiOrderRepo) GetUserSenderName(context.Context, string) (string, error) {
	return f.senderName, nil
}

type fakeResiTemplateRepo struct {
	domain.ResiTemplateRepository
	template *domain.ResiTemplate
}

func (f *fakeResiTemplateRepo) GetActiveTemplateByProvider(context.Context, string) (*domain.ResiTemplate, error) {
	return f.template, nil
}

func TestRenderResiByAWBReplacesDesignerVariables(t *testing.T) {
	order := &domain.Order{
		ID:                   "order-1",
		CustomerID:           "customer-1",
		OrderNumber:          "TMB-001",
		AWB:                  "JNE123",
		LogisticsProvider:    "jne",
		LogisticsServiceType: "REG",
		PickupAddress:        "Jakarta",
		DropoffAddress:       "Bandung",
		ReceiverName:         "Andi",
		ItemDescription:      "Kemeja",
		Weight:               1.2,
		RoutingCode:          "JKT-BDG",
		TotalPriceIDR:        25000,
	}
	template := &domain.ResiTemplate{
		ID:           "template-1",
		Name:         "JNE A6",
		PaperSize:    "A6",
		LayoutConfig: `{"layout":"standard","elements":[{"type":"text","value":"{{awb_number}} - {{receiver_name}} - {{item_description}} - {{weight}} - {{routing_code}}"}]}`,
	}

	result, err := NewResiService(
		&fakeResiOrderRepo{order: order, senderName: "Toko TEMBUS"},
		&fakeResiTemplateRepo{template: template},
	).RenderResiByAWB(context.Background(), "JNE123")
	if err != nil {
		t.Fatalf("RenderResiByAWB() error = %v", err)
	}

	layout, ok := result["layout_config"].(map[string]interface{})
	if !ok {
		t.Fatalf("layout_config type = %T, want map[string]interface{}", result["layout_config"])
	}
	elements, ok := layout["elements"].([]interface{})
	if !ok || len(elements) != 1 {
		t.Fatalf("layout elements = %#v", layout["elements"])
	}
	element := elements[0].(map[string]interface{})
	value := element["value"].(string)
	for _, expected := range []string{"JNE123", "Andi", "Kemeja", "1.2 kg", "JKT-BDG"} {
		if !strings.Contains(value, expected) {
			t.Errorf("rendered value %q does not contain %q", value, expected)
		}
	}
}

func TestRenderResiByAWBRejectsMalformedProcessedLayout(t *testing.T) {
	order := &domain.Order{
		CustomerID:        "customer-1",
		AWB:               "JNE123",
		LogisticsProvider: "jne",
		ItemDescription:   `bad"value`,
	}
	template := &domain.ResiTemplate{
		ID:           "template-1",
		PaperSize:    "A6",
		LayoutConfig: `{"elements":[{"value":"{{item_description}}"}]}`,
	}

	_, err := NewResiService(
		&fakeResiOrderRepo{order: order},
		&fakeResiTemplateRepo{template: template},
	).RenderResiByAWB(context.Background(), "JNE123")
	if err == nil || !strings.Contains(err.Error(), "invalid processed layout config json") {
		t.Fatalf("RenderResiByAWB() error = %v, want processed layout validation error", err)
	}
}
