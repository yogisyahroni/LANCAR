package domain

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"
)

const (
	FoodGroupStatusOpen   = "open"
	FoodGroupStatusClosed = "closed"
	FoodGroupMemberActive = "active"
	FoodGroupMemberLeft   = "left"
)

type FoodGroupOrder struct {
	ID          string                `json:"id"`
	MerchantID  string                `json:"merchant_id"`
	CreatorID   string                `json:"creator_id"`
	Status      string                `json:"status"`
	Deadline    time.Time             `json:"deadline"`
	Split       bool                  `json:"split"`
	Members     []FoodGroupMember     `json:"members"`
	Cart        []FoodGroupCartItem   `json:"cart"`
	Allocations []FoodGroupAllocation `json:"allocations,omitempty"`
	CreatedAt   time.Time             `json:"created_at"`
	ClosedAt    *time.Time            `json:"closed_at,omitempty"`
}

type FoodGroupMember struct {
	UserID   string    `json:"user_id"`
	Role     string    `json:"role"` // creator | member
	Status   string    `json:"status"`
	JoinedAt time.Time `json:"joined_at"`
}

type FoodGroupCartItem struct {
	ID         string    `json:"id"`
	GroupID    string    `json:"group_id,omitempty"`
	MemberID   string    `json:"member_id"`
	MenuItemID string    `json:"menu_item_id"`
	Quantity   int       `json:"quantity"`
	Notes      string    `json:"notes,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

type FoodGroupAllocation struct {
	UserID       string `json:"user_id"`
	AmountIDR    int64  `json:"amount_idr"`
	PaymentState string `json:"payment_state"` // pending | paid | failed
}

type CreateFoodGroupRequest struct {
	MerchantID string    `json:"merchant_id" validate:"required"`
	Deadline   time.Time `json:"deadline" validate:"required"`
	Split      bool      `json:"split"`
}

type AddFoodGroupCartItemRequest struct {
	MenuItemID string `json:"menu_item_id" validate:"required"`
	Quantity   int    `json:"quantity" validate:"required,min=1,max=50"`
	Notes      string `json:"notes,omitempty" validate:"max=300"`
}

type FoodGroupRepository interface {
	CreateFoodGroup(ctx context.Context, group *FoodGroupOrder) error
	GetFoodGroup(ctx context.Context, groupID string) (*FoodGroupOrder, error)
	AddFoodGroupMember(ctx context.Context, groupID, userID, role string) error
	LeaveFoodGroup(ctx context.Context, groupID, userID string) error
	AddFoodGroupCartItem(ctx context.Context, item *FoodGroupCartItem) error
	RemoveFoodGroupCartItem(ctx context.Context, groupID, itemID, userID string) error
	CloseFoodGroup(ctx context.Context, groupID, userID string, allocations []FoodGroupAllocation) error
}

type FoodGroupService interface {
	CreateFoodGroup(ctx context.Context, userID string, req CreateFoodGroupRequest) (*FoodGroupOrder, error)
	GetFoodGroup(ctx context.Context, userID, groupID string) (*FoodGroupOrder, error)
	JoinFoodGroup(ctx context.Context, userID, groupID string) error
	LeaveFoodGroup(ctx context.Context, userID, groupID string) error
	AddCartItem(ctx context.Context, userID, groupID string, req AddFoodGroupCartItemRequest) (*FoodGroupCartItem, error)
	RemoveCartItem(ctx context.Context, userID, groupID, itemID string) error
	CloseFoodGroup(ctx context.Context, userID, groupID string, totalIDR int64) (*FoodGroupOrder, error)
}

// AllocateFoodGroupSplit deterministically divides the server-authoritative
// final total. The first member receives the rounding remainder, so the
// allocations always sum exactly to totalIDR and never use client amounts.
func AllocateFoodGroupSplit(totalIDR int64, memberIDs []string) ([]FoodGroupAllocation, error) {
	if totalIDR < 0 {
		return nil, fmt.Errorf("total group amount cannot be negative")
	}
	ids := append([]string(nil), memberIDs...)
	for i := range ids {
		ids[i] = strings.TrimSpace(ids[i])
		if ids[i] == "" {
			return nil, fmt.Errorf("group member id cannot be empty")
		}
	}
	if len(ids) == 0 {
		return nil, fmt.Errorf("at least one active group member is required")
	}
	// Preserve creator/member join order for the remainder assignment, while
	// rejecting duplicate identities that could otherwise undercharge someone.
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			return nil, fmt.Errorf("duplicate group member %q", id)
		}
		seen[id] = struct{}{}
	}
	base := totalIDR / int64(len(ids))
	remainder := totalIDR % int64(len(ids))
	allocations := make([]FoodGroupAllocation, len(ids))
	for i, id := range ids {
		amount := base
		if int64(i) < remainder {
			amount++
		}
		allocations[i] = FoodGroupAllocation{UserID: id, AmountIDR: amount, PaymentState: "pending"}
	}
	return allocations, nil
}

func ValidateFoodGroupWindow(deadline, now time.Time) error {
	if deadline.IsZero() {
		return fmt.Errorf("group deadline is required")
	}
	if !deadline.After(now.Add(5 * time.Minute)) {
		return fmt.Errorf("group deadline must be more than 5 minutes from now")
	}
	if deadline.After(now.Add(24 * time.Hour)) {
		return fmt.Errorf("group deadline cannot exceed 24 hours")
	}
	return nil
}

func ActiveFoodGroupMemberIDs(group *FoodGroupOrder) []string {
	ids := make([]string, 0, len(group.Members))
	for _, member := range group.Members {
		if member.Status == FoodGroupMemberActive {
			ids = append(ids, member.UserID)
		}
	}
	return ids
}

// sortFoodGroupMembers is used by repository-independent tests and callers
// that need stable JSON ordering without changing the creator semantics.
func sortFoodGroupMembers(members []FoodGroupMember) {
	sort.SliceStable(members, func(i, j int) bool { return members[i].JoinedAt.Before(members[j].JoinedAt) })
}
