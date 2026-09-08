package service

import (
	"context"
	"fmt"
	"strings"
	"tembus/order-service/internal/domain"
	"time"

	"github.com/google/uuid"
)

type foodGroupService struct {
	repo     domain.FoodGroupRepository
	foodRepo domain.FoodRepository
	now      func() time.Time
}

func NewFoodGroupService(repo domain.FoodGroupRepository, foodRepo domain.FoodRepository) domain.FoodGroupService {
	return &foodGroupService{repo: repo, foodRepo: foodRepo, now: time.Now}
}

func (s *foodGroupService) CreateFoodGroup(ctx context.Context, userID string, req domain.CreateFoodGroupRequest) (*domain.FoodGroupOrder, error) {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(req.MerchantID) == "" {
		return nil, fmt.Errorf("user and merchant are required")
	}
	if err := validateUUIDLike(req.MerchantID); err != nil {
		return nil, fmt.Errorf("invalid merchant id: %w", err)
	}
	now := s.now()
	if err := domain.ValidateFoodGroupWindow(req.Deadline, now); err != nil {
		return nil, err
	}
	if s.foodRepo != nil {
		merchant, err := s.foodRepo.GetFoodMerchant(ctx, req.MerchantID)
		if err != nil {
			return nil, fmt.Errorf("validate group merchant: %w", err)
		}
		if merchant == nil {
			return nil, fmt.Errorf("merchant is not available")
		}
		if err := validateFoodMerchantOperatingState(merchant); err != nil {
			return nil, fmt.Errorf("merchant is not available")
		}
	}
	id := uuid.NewString()
	group := &domain.FoodGroupOrder{
		ID: id, MerchantID: req.MerchantID, CreatorID: userID,
		Status: domain.FoodGroupStatusOpen, Deadline: req.Deadline,
		Split: req.Split, CreatedAt: now,
		Members: []domain.FoodGroupMember{{UserID: userID, Role: "creator", Status: domain.FoodGroupMemberActive, JoinedAt: now}},
		Cart:    make([]domain.FoodGroupCartItem, 0),
	}
	if err := s.repo.CreateFoodGroup(ctx, group); err != nil {
		return nil, fmt.Errorf("create food group: %w", err)
	}
	return group, nil
}

func (s *foodGroupService) GetFoodGroup(ctx context.Context, userID, groupID string) (*domain.FoodGroupOrder, error) {
	group, err := s.repo.GetFoodGroup(ctx, groupID)
	if err != nil {
		return nil, err
	}
	if group == nil {
		return nil, domain.ErrNotFound
	}
	if !foodGroupMember(group, userID) {
		return nil, domain.ErrForbidden
	}
	return group, nil
}

func (s *foodGroupService) JoinFoodGroup(ctx context.Context, userID, groupID string) error {
	group, err := s.repo.GetFoodGroup(ctx, groupID)
	if err != nil {
		return err
	}
	if group == nil {
		return domain.ErrNotFound
	}
	if group.Status != domain.FoodGroupStatusOpen || !s.now().Before(group.Deadline) {
		return fmt.Errorf("group is closed or deadline has passed")
	}
	if foodGroupMember(group, userID) {
		return nil
	} // idempotent join
	return s.repo.AddFoodGroupMember(ctx, groupID, userID, "member")
}

func (s *foodGroupService) LeaveFoodGroup(ctx context.Context, userID, groupID string) error {
	group, err := s.repo.GetFoodGroup(ctx, groupID)
	if err != nil {
		return err
	}
	if group == nil {
		return domain.ErrNotFound
	}
	if group.CreatorID == userID {
		return fmt.Errorf("creator cannot leave the group")
	}
	if !foodGroupMember(group, userID) {
		return domain.ErrForbidden
	}
	return s.repo.LeaveFoodGroup(ctx, groupID, userID)
}

func (s *foodGroupService) AddCartItem(ctx context.Context, userID, groupID string, req domain.AddFoodGroupCartItemRequest) (*domain.FoodGroupCartItem, error) {
	group, err := s.GetFoodGroup(ctx, userID, groupID)
	if err != nil {
		return nil, err
	}
	if group.Status != domain.FoodGroupStatusOpen || !s.now().Before(group.Deadline) {
		return nil, fmt.Errorf("group cart is closed or deadline has passed")
	}
	if req.Quantity < 1 || req.Quantity > 50 {
		return nil, fmt.Errorf("quantity must be between 1 and 50")
	}
	if s.foodRepo == nil {
		return nil, fmt.Errorf("food repository is not configured")
	}
	menuItems, err := s.foodRepo.GetFoodMenuItems(ctx, []string{req.MenuItemID})
	if err != nil {
		return nil, fmt.Errorf("validate group cart item: %w", err)
	}
	if len(menuItems) != 1 || menuItems[0].MerchantID != group.MerchantID || !menuItems[0].IsAvailable {
		return nil, fmt.Errorf("menu item is unavailable for this merchant")
	}
	now := s.now()
	item := &domain.FoodGroupCartItem{ID: uuid.NewString(), GroupID: groupID, MemberID: userID, MenuItemID: req.MenuItemID, Quantity: req.Quantity, Notes: strings.TrimSpace(req.Notes), CreatedAt: now}
	if err := s.repo.AddFoodGroupCartItem(ctx, item); err != nil {
		return nil, fmt.Errorf("add group cart item: %w", err)
	}
	return item, nil
}

func (s *foodGroupService) RemoveCartItem(ctx context.Context, userID, groupID, itemID string) error {
	group, err := s.GetFoodGroup(ctx, userID, groupID)
	if err != nil {
		return err
	}
	if group.Status != domain.FoodGroupStatusOpen || !s.now().Before(group.Deadline) {
		return fmt.Errorf("group cart is closed or deadline has passed")
	}
	return s.repo.RemoveFoodGroupCartItem(ctx, groupID, itemID, userID)
}

func (s *foodGroupService) CloseFoodGroup(ctx context.Context, userID, groupID string, totalIDR int64) (*domain.FoodGroupOrder, error) {
	group, err := s.GetFoodGroup(ctx, userID, groupID)
	if err != nil {
		return nil, err
	}
	if group.CreatorID != userID {
		return nil, domain.ErrForbidden
	}
	if group.Status != domain.FoodGroupStatusOpen {
		return nil, fmt.Errorf("group is already closed")
	}
	if !s.now().Before(group.Deadline) {
		return nil, fmt.Errorf("group deadline has passed")
	}
	if len(group.Cart) == 0 {
		return nil, fmt.Errorf("group cart cannot be empty")
	}
	if totalIDR < 0 {
		return nil, fmt.Errorf("total amount cannot be negative")
	}
	var allocations []domain.FoodGroupAllocation
	if group.Split {
		allocations, err = domain.AllocateFoodGroupSplit(totalIDR, domain.ActiveFoodGroupMemberIDs(group))
		if err != nil {
			return nil, err
		}
	} else {
		allocations = []domain.FoodGroupAllocation{{UserID: group.CreatorID, AmountIDR: totalIDR, PaymentState: "pending"}}
	}
	if err := s.repo.CloseFoodGroup(ctx, groupID, userID, allocations); err != nil {
		return nil, fmt.Errorf("close food group: %w", err)
	}
	group.Status = domain.FoodGroupStatusClosed
	now := s.now()
	group.ClosedAt = &now
	group.Allocations = allocations
	return group, nil
}

func foodGroupMember(group *domain.FoodGroupOrder, userID string) bool {
	for _, member := range group.Members {
		if member.UserID == userID && member.Status == domain.FoodGroupMemberActive {
			return true
		}
	}
	return false
}

func validateUUIDLike(value string) error {
	if _, err := uuid.Parse(value); err != nil {
		return err
	}
	return nil
}
