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

type senderContactRepository interface {
	GetUserSenderContact(ctx context.Context, userID string) (string, string, error)
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

	// Sender identity comes from the order/customer profile. The receipt must
	// never use the designer's sample address as production data.
	senderName, _ := s.orderRepo.GetUserSenderName(ctx, order.CustomerID)
	if senderName == "" {
		senderName = "Pengirim Tembus"
	}
	senderPhone := "-"
	if repo, ok := s.orderRepo.(senderContactRepository); ok {
		if profileName, profilePhone, contactErr := repo.GetUserSenderContact(ctx, order.CustomerID); contactErr == nil {
			if profileName != "" {
				senderName = profileName
			}
			if profilePhone != "" {
				senderPhone = profilePhone
			}
		}
	}

	providerName := firstNonEmptyString(order.LogisticsProvider, "TEMBUS")
	serviceType := firstNonEmptyString(order.LogisticsServiceType, order.ServiceCode, order.Model, "REGULER")
	trackingURL := firstNonEmptyString(order.TrackingURL, "https://tembus.id/track/"+firstNonEmptyString(order.AWB, awb))
	pickupAddress := formatLocation(order.PickupAddress, order.PickupCity, order.PickupZipCode)
	dropoffAddress := formatLocation(order.DropoffAddress, order.DropoffCity, order.DropoffZipCode)

	replacements := map[string]string{
		"{{awb_number}}":       order.AWB,
		"{{order_number}}":     order.OrderNumber,
		"{{provider_name}}":    providerName,
		"{{service_type}}":     serviceType,
		"{{service_name}}":     fmt.Sprintf("%s %s", strings.ToUpper(providerName), strings.ToUpper(serviceType)),
		"{{sender_name}}":      senderName,
		"{{sender_phone}}":     senderPhone,
		"{{pickup_address}}":   pickupAddress,
		"{{sender_address}}":   pickupAddress,
		"{{receiver_name}}":    firstNonEmptyString(order.ReceiverName, "Penerima"),
		"{{receiver_phone}}":   firstNonEmptyString(order.ReceiverPhone, "-"),
		"{{dropoff_address}}":  dropoffAddress,
		"{{receiver_address}}": dropoffAddress,
		"{{item_names}}":       firstNonEmptyString(order.ItemDescription, "-"),
		"{{item_description}}": firstNonEmptyString(order.ItemDescription, "-"),
		"{{total_weight}}":     fmt.Sprintf("%.1f", order.Weight),
		"{{weight}}":           fmt.Sprintf("%.1f kg", order.Weight),
		"{{total_items}}":      "1",        // Currently single package assumption
		"{{payment_type}}":     "CASHLESS", // Since no COD is allowed
		"{{total_price_idr}}":  fmt.Sprintf("%d", order.TotalPriceIDR),
		"{{total_price}}":      fmt.Sprintf("%d", order.TotalPriceIDR),
		"{{routing_code}}":     order.RoutingCode,
		"{{cod_amount}}":       "0",
		"{{tracking_url}}":     trackingURL,
	}

	processedLayout := replaceLayoutPlaceholders(layoutConfig, replacements).(map[string]interface{})

	return map[string]interface{}{
		"order":         order,
		"template_id":   template.ID,
		"paper_size":    template.PaperSize,
		"layout_config": processedLayout,
	}, nil
}

func replaceLayoutPlaceholders(value interface{}, replacements map[string]string) interface{} {
	switch current := value.(type) {
	case map[string]interface{}:
		for key, nested := range current {
			current[key] = replaceLayoutPlaceholders(nested, replacements)
		}
		return current
	case []interface{}:
		for index, nested := range current {
			current[index] = replaceLayoutPlaceholders(nested, replacements)
		}
		return current
	case string:
		for placeholder, replacement := range replacements {
			current = strings.ReplaceAll(current, placeholder, replacement)
		}
		return current
	default:
		return value
	}
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func formatLocation(address, city, postalCode string) string {
	parts := []string{strings.TrimSpace(address)}
	base := strings.ToLower(strings.TrimSpace(address))
	for _, part := range []string{city, postalCode} {
		part = strings.TrimSpace(part)
		if part != "" && !strings.Contains(base, strings.ToLower(part)) {
			parts = append(parts, part)
			base += " " + strings.ToLower(part)
		}
	}
	return firstNonEmptyString(strings.Join(filterEmpty(parts), ", "), "-")
}

func filterEmpty(values []string) []string {
	filtered := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			filtered = append(filtered, value)
		}
	}
	return filtered
}
