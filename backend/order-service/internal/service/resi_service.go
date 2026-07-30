package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"tembus/order-service/internal/domain"
)

type ResiService interface {
	RenderResiByAWB(ctx context.Context, awb string) (map[string]interface{}, error)
}

type resiService struct {
	orderRepo    domain.OrderRepository
	templateRepo domain.ResiTemplateRepository
}

func NewResiService(orderRepo domain.OrderRepository, templateRepo domain.ResiTemplateRepository) ResiService {
	return &resiService{
		orderRepo:    orderRepo,
		templateRepo: templateRepo,
	}
}

func (s *resiService) RenderResiByAWB(ctx context.Context, awb string) (map[string]interface{}, error) {
	// 1. Get Order
	order, err := s.orderRepo.GetByAWB(ctx, awb)
	if err != nil {
		return nil, fmt.Errorf("failed to get order by awb: %w", err)
	}
	if order == nil {
		return nil, fmt.Errorf("order not found for awb: %s", awb)
	}

	// 2. Get Active Template
	providerCode := order.LogisticsProvider
	template, err := s.templateRepo.GetActiveTemplateByProvider(ctx, providerCode)
	if err != nil {
		return nil, fmt.Errorf("failed to get active template: %w", err)
	}

	// 3. Process Layout Config
	var layoutConfig map[string]interface{}
	if err := json.Unmarshal([]byte(template.LayoutConfig), &layoutConfig); err != nil {
		return nil, fmt.Errorf("invalid layout config json: %w", err)
	}

	// Replace placeholders in the layout config string, then unmarshal again
	// We can do simple string replacement for now.
	layoutStr := template.LayoutConfig
	
	// Get sender name if possible
	senderName, _ := s.orderRepo.GetUserSenderName(ctx, order.CustomerID)
	if senderName == "" {
		senderName = "Pengirim Tembus"
	}

	replacements := map[string]string{
		"{{awb_number}}":       order.AWB,
		"{{order_number}}":     order.OrderNumber,
		"{{provider_name}}":    order.LogisticsProvider,
		"{{service_type}}":     order.LogisticsServiceType,
		"{{service_name}}":     fmt.Sprintf("%s %s", strings.ToUpper(order.LogisticsProvider), strings.ToUpper(order.LogisticsServiceType)),
		"{{sender_name}}":      senderName,
		"{{sender_phone}}":     "-", // TBD from customer profile
		"{{pickup_address}}":   order.PickupAddress,
		"{{receiver_name}}":    order.ReceiverName,
		"{{receiver_phone}}":   order.ReceiverPhone,
		"{{dropoff_address}}":  order.DropoffAddress,
		"{{item_names}}":       order.ItemDescription,
		"{{total_weight}}":     fmt.Sprintf("%.1f", order.Weight),
		"{{total_items}}":      "1", // Currently single package assumption
		"{{payment_type}}":     "CASHLESS", // Since no COD is allowed
		"{{total_price_idr}}":  fmt.Sprintf("%d", order.TotalPriceIDR),
		"{{total_price}}":      fmt.Sprintf("%d", order.TotalPriceIDR),
		"{{routing_code}}":     order.RoutingCode,
	}

	for k, v := range replacements {
		layoutStr = strings.ReplaceAll(layoutStr, k, v)
	}

	var processedLayout map[string]interface{}
	_ = json.Unmarshal([]byte(layoutStr), &processedLayout)

	return map[string]interface{}{
		"order":          order,
		"template_id":    template.ID,
		"paper_size":     template.PaperSize,
		"layout_config":  processedLayout,
	}, nil
}
