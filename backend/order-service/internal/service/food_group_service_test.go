package service

import (
	"context"
	"tembus/order-service/internal/domain"
	"testing"
	"time"
)

type fakeFoodGroupRepo struct {
	groups map[string]*domain.FoodGroupOrder
	closed []domain.FoodGroupAllocation
}

func (r *fakeFoodGroupRepo) CreateFoodGroup(_ context.Context, group *domain.FoodGroupOrder) error {
	r.groups[group.ID] = group
	return nil
}
func (r *fakeFoodGroupRepo) GetFoodGroup(_ context.Context, id string) (*domain.FoodGroupOrder, error) {
	return r.groups[id], nil
}
func (r *fakeFoodGroupRepo) AddFoodGroupMember(_ context.Context, groupID, userID, role string) error {
	r.groups[groupID].Members = append(r.groups[groupID].Members, domain.FoodGroupMember{UserID: userID, Role: role, Status: domain.FoodGroupMemberActive})
	return nil
}
func (r *fakeFoodGroupRepo) LeaveFoodGroup(_ context.Context, groupID, userID string) error {
	for i := range r.groups[groupID].Members {
		if r.groups[groupID].Members[i].UserID == userID {
			r.groups[groupID].Members[i].Status = domain.FoodGroupMemberLeft
		}
	}
	return nil
}
func (r *fakeFoodGroupRepo) AddFoodGroupCartItem(_ context.Context, item *domain.FoodGroupCartItem) error {
	r.groups[item.GroupID].Cart = append(r.groups[item.GroupID].Cart, *item)
	return nil
}
func (r *fakeFoodGroupRepo) RemoveFoodGroupCartItem(context.Context, string, string, string) error {
	return nil
}
func (r *fakeFoodGroupRepo) CloseFoodGroup(_ context.Context, groupID, _ string, allocations []domain.FoodGroupAllocation) error {
	r.groups[groupID].Status = domain.FoodGroupStatusClosed
	r.closed = allocations
	return nil
}

func TestFoodGroupServiceCreatorControlsCloseAndSplit(t *testing.T) {
	repo := &fakeFoodGroupRepo{groups: make(map[string]*domain.FoodGroupOrder)}
	svc := NewFoodGroupService(repo, nil).(*foodGroupService)
	now := time.Date(2026, 9, 7, 12, 0, 0, 0, time.UTC)
	svc.now = func() time.Time { return now }
	group, err := svc.CreateFoodGroup(context.Background(), "creator", domain.CreateFoodGroupRequest{MerchantID: "00000000-0000-0000-0000-000000000001", Deadline: now.Add(time.Hour), Split: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.JoinFoodGroup(context.Background(), "member", group.ID); err != nil {
		t.Fatal(err)
	}
	group.Cart = []domain.FoodGroupCartItem{{GroupID: group.ID, MemberID: "creator", MenuItemID: "item", Quantity: 1}}
	if _, err := svc.CloseFoodGroup(context.Background(), "member", group.ID, 10001); err == nil {
		t.Fatal("non-creator must not close group")
	}
	closed, err := svc.CloseFoodGroup(context.Background(), "creator", group.ID, 10001)
	if err != nil {
		t.Fatal(err)
	}
	if closed.Status != domain.FoodGroupStatusClosed || len(repo.closed) != 2 {
		t.Fatalf("unexpected close result: %+v", closed)
	}
	if repo.closed[0].AmountIDR+repo.closed[1].AmountIDR != 10001 {
		t.Fatal("split does not reconcile")
	}
}
