package service

import (
	"context"
	"fmt"
	"strings"
	"tembus/order-service/internal/domain"

	"github.com/google/uuid"
)

type foodBundleService struct {
	repo      domain.FoodBundleRepository
	orderRepo foodBundleOrderReader
	foodRepo  domain.FoodRepository
}

// foodBundleOrderReader keeps the bundle module coupled only to the read it
// needs. It must not require every unrelated order repository mutation method.
type foodBundleOrderReader interface {
	GetByID(ctx context.Context, id string) (*domain.Order, error)
}

func NewFoodBundleService(repo domain.FoodBundleRepository, orderRepo foodBundleOrderReader, foodRepo domain.FoodRepository) domain.FoodBundleService {
	return &foodBundleService{repo: repo, orderRepo: orderRepo, foodRepo: foodRepo}
}

func (s *foodBundleService) CreateBundle(ctx context.Context, customerID string, req domain.CreateFoodMultiStoreBundleRequest) (*domain.FoodMultiStoreBundle, error) {
	if strings.TrimSpace(customerID) == "" {
		return nil, domain.ErrForbidden
	}
	if err := domain.ValidateFoodMultiStoreMerchants(req.MerchantIDs); err != nil {
		return nil, err
	}
	if s.foodRepo != nil {
		for _, merchantID := range req.MerchantIDs {
			merchant, err := s.foodRepo.GetFoodMerchant(ctx, merchantID)
			if err != nil || merchant == nil {
				return nil, fmt.Errorf("merchant %s is unavailable", merchantID)
			}
		}
	}
	bundle := &domain.FoodMultiStoreBundle{ID: uuid.NewString(), CustomerID: customerID, Status: domain.FoodBundleOpen, MerchantIDs: append([]string(nil), req.MerchantIDs...), OrderIDs: []string{}}
	if err := s.repo.CreateFoodBundle(ctx, bundle); err != nil {
		return nil, fmt.Errorf("create food bundle: %w", err)
	}
	return bundle, nil
}

func (s *foodBundleService) GetBundle(ctx context.Context, customerID, bundleID string) (*domain.FoodMultiStoreBundle, error) {
	bundle, err := s.repo.GetFoodBundle(ctx, bundleID)
	if err != nil {
		return nil, err
	}
	if bundle == nil {
		return nil, domain.ErrNotFound
	}
	if bundle.CustomerID != customerID {
		return nil, domain.ErrForbidden
	}
	return bundle, nil
}

func (s *foodBundleService) AttachOrder(ctx context.Context, customerID, bundleID, orderID string) error {
	bundle, err := s.GetBundle(ctx, customerID, bundleID)
	if err != nil {
		return err
	}
	if bundle.Status != domain.FoodBundleOpen {
		return fmt.Errorf("bundle is already finalized")
	}
	if s.orderRepo == nil {
		return fmt.Errorf("order repository is not configured")
	}
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return err
	}
	if order == nil {
		return domain.ErrNotFound
	}
	if order.CustomerID != customerID || order.ServiceSubType != "food_delivery" && order.ServiceSubType != "food_pickup" {
		return domain.ErrForbidden
	}
	if order.MerchantID == nil {
		return fmt.Errorf("child order has no merchant")
	}
	found := false
	for _, merchantID := range bundle.MerchantIDs {
		if merchantID == *order.MerchantID {
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("child order merchant is not part of this bundle")
	}
	for _, id := range bundle.OrderIDs {
		if id == orderID {
			return nil
		}
	}
	return s.repo.AttachFoodBundleOrder(ctx, bundleID, orderID, *order.MerchantID)
}

func (s *foodBundleService) FinalizeBundle(ctx context.Context, customerID, bundleID string) (*domain.FoodMultiStoreBundle, error) {
	bundle, err := s.GetBundle(ctx, customerID, bundleID)
	if err != nil {
		return nil, err
	}
	if bundle.Status != domain.FoodBundleOpen {
		return nil, fmt.Errorf("bundle is already finalized")
	}
	if len(bundle.OrderIDs) != len(bundle.MerchantIDs) {
		return nil, fmt.Errorf("one paid child order per merchant is required before finalization")
	}
	settlement := domain.FoodBundleSettlement{BundleID: bundleID, ChildOrderCount: len(bundle.OrderIDs), Status: "pending"}
	for _, orderID := range bundle.OrderIDs {
		order, getErr := s.orderRepo.GetByID(ctx, orderID)
		if getErr != nil {
			return nil, getErr
		}
		if order == nil || order.CustomerID != customerID {
			return nil, domain.ErrForbidden
		}
		settlement.GrossTotalIDR += order.TotalPriceIDR
	}
	if err := s.repo.FinalizeFoodBundle(ctx, bundleID, customerID, settlement); err != nil {
		return nil, err
	}
	bundle.Status = domain.FoodBundleFinal
	bundle.Settlement = &settlement
	return bundle, nil
}
