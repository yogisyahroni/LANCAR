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
	providerCode := ""
	if order.LogisticsProvider != nil {
		providerCode = *order.LogisticsProvider
	}
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
	replacements := map[string]string{
		"{{awb_number}}":       order.AWB,
		"{{order_number}}":     order.OrderNumber,
		"{{recipient_name}}":   "", // Wait, recipient_name is not in Order domain, it is in PaymentLink. But for Bulk it might be saved somewhere else? 
		"{{pickup_address}}":   order.PickupAddress,
		"{{dropoff_address}}":  order.DropoffAddress,
		"{{item_description}}": order.ItemDescription,
		"{{weight_kg}}":        fmt.Sprintf("%.1f", order.Weight),
	}

	for k, v := range replacements {
		layoutStr = strings.ReplaceAll(layoutStr, k, v)
	}

	var processedLayout map[string]interface{}
	json.Unmarshal([]byte(layoutStr), &processedLayout)

	return map[string]interface{}{
		"order":          order,
		"template_id":    template.ID,
		"paper_size":     template.PaperSize,
		"layout_config":  processedLayout,
	}, nil
}
