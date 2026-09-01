package service

import (
	"context"
	"errors"
	"fmt"
	"tembus/order-service/internal/domain"
)

// Auto-generated split of orderServiceImpl methods (god-file refactor).
func (s *orderServiceImpl) ListFoodMerchants(ctx context.Context, lat, lng float64, search, halal string) ([]domain.FoodMerchantInfo, error) {
	if s.foodRepo == nil {
		return nil, fmt.Errorf("food repository not wired")
	}
	return s.foodRepo.ListFoodMerchants(ctx, lat, lng, search, halal, 50)
}

func (s *orderServiceImpl) GetFoodMerchantDetail(ctx context.Context, merchantID string) (*domain.FoodMerchantInfo, error) {
	if s.foodRepo == nil {
		return nil, fmt.Errorf("food repository not wired")
	}
	merchant, err := s.foodRepo.GetFoodMerchant(ctx, merchantID)
	if err != nil {
		return nil, err
	}
	menu, err := s.foodRepo.GetFoodMerchantMenu(ctx, merchantID)
	if err != nil {
		return nil, err
	}
	merchant.MenuItems = menu
	return merchant, nil
}

func (s *orderServiceImpl) AddFavoriteMerchant(ctx context.Context, customerID, merchantID string) error {
	if s.foodRepo == nil {
		return fmt.Errorf("food repository not wired")
	}
	return s.foodRepo.AddFavoriteMerchant(ctx, customerID, merchantID)
}

func (s *orderServiceImpl) RemoveFavoriteMerchant(ctx context.Context, customerID, merchantID string) error {
	if s.foodRepo == nil {
		return fmt.Errorf("food repository not wired")
	}
	return s.foodRepo.RemoveFavoriteMerchant(ctx, customerID, merchantID)
}

func (s *orderServiceImpl) ListFavoriteMerchants(ctx context.Context, customerID string) ([]domain.FoodMerchantInfo, error) {
	if s.foodRepo == nil {
		return nil, fmt.Errorf("food repository not wired")
	}
	return s.foodRepo.ListFavoriteMerchants(ctx, customerID)
}

func (s *orderServiceImpl) CheckIsFavoriteMerchant(ctx context.Context, customerID, merchantID string) (bool, error) {
	if s.foodRepo == nil {
		return false, fmt.Errorf("food repository not wired")
	}
	return s.foodRepo.CheckIsFavoriteMerchant(ctx, customerID, merchantID)
}

func (s *orderServiceImpl) CheckReorder(ctx context.Context, orderID string) (*domain.ReorderCheckResult, error) {
	if s.foodRepo == nil {
		return nil, fmt.Errorf("food repository not wired")
	}

	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, errors.New("order not found")
	}
	if order.ServiceSubType != "food_delivery" {
		return nil, errors.New("reorder hanya untuk order food delivery")
	}

	// 1. Snapshot item saat order (harga beku).
	snapshotItems, err := s.foodRepo.GetFoodOrderItems(ctx, orderID)
	if err != nil {
		return nil, fmt.Errorf("get food order items: %w", err)
	}

	// 2. Merchant saat ini (is_open + nama) untuk konteks checkout.
	if order.MerchantID == nil || *order.MerchantID == "" {
		return nil, errors.New("order bukan pesanan merchant (tidak bisa reorder)")
	}
	merchant, err := s.foodRepo.GetFoodMerchant(ctx, *order.MerchantID)
	if err != nil {
		return nil, fmt.Errorf("get food merchant: %w", err)
	}

	// 3. Harga & availability menu SAAT INI untuk tiap menu_item_id.
	menuIDs := make([]string, 0, len(snapshotItems))
	for _, it := range snapshotItems {
		menuIDs = append(menuIDs, it.MenuItemID)
	}
	currentMenu := map[string]domain.FoodMenuItemInfo{}
	if len(menuIDs) > 0 {
		list, err := s.foodRepo.GetFoodMenuItems(ctx, menuIDs)
		if err != nil {
			return nil, fmt.Errorf("get current menu items: %w", err)
		}
		for _, m := range list {
			currentMenu[m.ID] = m
		}
	}

	// 4. Bangun hasil per item + total.
	result := &domain.ReorderCheckResult{
		OrderID:      order.ID,
		MerchantID:   *order.MerchantID,
		MerchantName: merchant.Name,
		MerchantOpen: merchant.IsOpen,
		Items:        make([]domain.ReorderCheckItem, 0, len(snapshotItems)),
	}
	for _, it := range snapshotItems {
		cur, found := currentMenu[it.MenuItemID]
		newPrice := it.ItemPrice
		available := found && cur.IsAvailable
		if found {
			newPrice = cur.Price
		}
		item := domain.ReorderCheckItem{
			MenuItemID:   it.MenuItemID,
			ItemName:     it.ItemName,
			Quantity:     it.Quantity,
			Notes:        it.Notes,
			Variants:     it.Variants,
			OldPrice:     it.ItemPrice,
			NewPrice:     newPrice,
			Available:    available,
			PriceChanged: !found || cur.Price != it.ItemPrice,
		}
		result.Items = append(result.Items, item)
		result.TotalOld += it.ItemPrice * int64(it.Quantity)
		result.TotalNew += newPrice * int64(it.Quantity)
		if item.PriceChanged || !item.Available {
			result.HasChanges = true
		}
	}

	return result, nil
}
