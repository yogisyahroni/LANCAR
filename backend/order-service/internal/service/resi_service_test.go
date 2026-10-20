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
		PickupCity:           "Jakarta Pusat",
		PickupZipCode:        "10210",
		DropoffAddress:       "Bandung",
		DropoffCity:          "Bandung",
		DropoffZipCode:       "40123",
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
		LayoutConfig: `{"layout":"standard","elements":[{"type":"text","value":"{{awb_number}} - {{receiver_name}} - {{item_description}} - {{weight}} - {{routing_code}} - {{dropoff_address}} - {{cod_amount}} - {{tracking_url}}"}]}`,
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
	for _, expected := range []string{"JNE123", "Andi", "Kemeja", "1.2 kg", "JKT-BDG", "0", "https://tembus.id/track/JNE123"} {
		if !strings.Contains(value, expected) {
			t.Errorf("rendered value %q does not contain %q", value, expected)
		}
	}
	if !strings.Contains(value, "Bandung, 40123") {
		t.Errorf("rendered value %q does not contain formatted drop-off location", value)
	}
}

func TestRenderResiByAWBEscapesDataInsideLayoutValues(t *testing.T) {
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

	result, err := NewResiService(
		&fakeResiOrderRepo{order: order},
		&fakeResiTemplateRepo{template: template},
	).RenderResiByAWB(context.Background(), "JNE123")
	if err != nil {
		t.Fatalf("RenderResiByAWB() error = %v, want safe rendering", err)
	}
	layout := result["layout_config"].(map[string]interface{})
	element := layout["elements"].([]interface{})[0].(map[string]interface{})
	if element["value"] != `bad"value` {
		t.Fatalf("rendered value = %#v, want original quoted value", element["value"])
	}
}
