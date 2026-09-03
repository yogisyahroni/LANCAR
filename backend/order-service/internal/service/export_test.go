package service

import "tembus/order-service/internal/domain"

// ExportTestFoodQuoteInputFingerprint exposes the private
// foodQuoteInputFingerprint for use by package service_test (FOOD-2026-006
// contactless PoD test). Only available in test builds.
func ExportTestFoodQuoteInputFingerprint(req domain.CreateFoodOrderRequest) string {
	return foodQuoteInputFingerprint(req)
}
