package service_test

import (
	"context"
	"testing"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/service"
)

// foodSubstitutionRepo — embed mockFoodRepo (refund_service_test.go), override
// substitution methods so the decision logic can be exercised.
type foodSubstitutionRepo struct {
	mockFoodRepo
	order       *domain.Order
	proposal    *domain.FoodSubstitutionProposal
	resolved    string
	priceUpdated *resolvedPrice
}

type resolvedPrice struct {
	orderID, itemID string
	newPrice        int64
	called          bool
}

func (r *foodSubstitutionRepo) GetFoodOrderForMerchant(ctx context.Context, orderID, merchantID string) (*domain.Order, error) {
	if r.order != nil {
		return r.order, nil
	}
	return nil, domain.ErrNotFound
}

func (r *foodSubstitutionRepo) GetSubstitutionProposalByID(ctx context.Context, proposalID string) (*domain.FoodSubstitutionProposal, error) {
	if r.proposal != nil && r.proposal.ID == proposalID {
		return r.proposal, nil
	}
	return nil, domain.ErrNotFound
}

func (r *foodSubstitutionRepo) ResolveFoodSubstitution(ctx context.Context, proposalID, decision string) error {
	r.resolved = decision
	if r.proposal != nil {
		r.proposal.CustomerDecision = decision
	}
	return nil
}

func (r *foodSubstitutionRepo) UpdateFoodOrderItemPrice(ctx context.Context, orderID, itemID string, newPrice int64) error {
	r.priceUpdated = &resolvedPrice{orderID: orderID, itemID: itemID, newPrice: newPrice, called: true}
	return nil
}

// ── DecideFoodSubstitution: approve update price + event ──────────────

func TestDecideFoodSubstitution_Approve_UpdatesItemPrice(t *testing.T) {
	ctx := context.Background()
	foodRepo := &foodSubstitutionRepo{
		order: &domain.Order{
			ID:        "order-1",
			Status:    domain.StatusPreparing,
			CustomerID: "cust-1",
			MerchantID: ptrString("merchant-1"),
		},
		proposal: &domain.FoodSubstitutionProposal{
			ID:               "prop-1",
			OrderID:          "order-1",
			OriginalItemID:   "item-orig",
			OriginalItemName: "Nasi Goreng",
			ReplacementItemID: "item-rep",
			ReplacementItemName: "Nasi Ayam",
			ReplacementPrice:   30000,
			PriceDifferenceIDR: 5000,
			CustomerDecision:   "pending",
		},
	}
	orderRepo := &mockOrderRepo{order: foodRepo.order}
	svc := service.NewOrderService(
		orderRepo, &stubEventRepo{}, &MockRedisRepo{}, &MockPricingRepo{},
		&stubRelay{}, &stubEventBus{}, &stubQueue{}, &stubFlags{},
		&stubNotification{}, &MockConfigRepo{}, &stubLedger{}, &stubTax{},
	)
	svc.SetFoodRepository(foodRepo)

	req := domain.SubstitutionDecisionRequest{Decision: "approved"}
	err := svc.DecideFoodSubstitution(ctx, "cust-1", "prop-1", req)
	if err != nil {
		t.Fatalf("DecideFoodSubstitution approved error: %v", err)
	}
	if foodRepo.resolved != "approved" {
		t.Errorf("expected resolved=approved, got %s", foodRepo.resolved)
	}
	if foodRepo.priceUpdated == nil || !foodRepo.priceUpdated.called {
		t.Fatal("expected UpdateFoodOrderItemPrice to be called on approval")
	}
	if foodRepo.priceUpdated.orderID != "order-1" || foodRepo.priceUpdated.itemID != "item-orig" {
		t.Errorf("price update target mismatch: order=%s item=%s", foodRepo.priceUpdated.orderID, foodRepo.priceUpdated.itemID)
	}
	if foodRepo.priceUpdated.newPrice != 30000 {
		t.Errorf("expected new price 30000, got %d", foodRepo.priceUpdated.newPrice)
	}
}

// ── DecideFoodSubstitution: reject does NOT update price ──────────────

func TestDecideFoodSubstitution_Reject_DoesNotUpdatePrice(t *testing.T) {
	ctx := context.Background()
	foodRepo := &foodSubstitutionRepo{
		order: &domain.Order{ID: "order-1", Status: domain.StatusPreparing, CustomerID: "cust-1", MerchantID: ptrString("m-1")},
		proposal: &domain.FoodSubstitutionProposal{
			ID:                "prop-1",
			OrderID:           "order-1",
			OriginalItemID:    "item-orig",
			ReplacementPrice:  30000,
			CustomerDecision:  "pending",
		},
	}
	orderRepo := &mockOrderRepo{order: foodRepo.order}
	svc := service.NewOrderService(
		orderRepo, &stubEventRepo{}, &MockRedisRepo{}, &MockPricingRepo{},
		&stubRelay{}, &stubEventBus{}, &stubQueue{}, &stubFlags{},
		&stubNotification{}, &MockConfigRepo{}, &stubLedger{}, &stubTax{},
	)
	svc.SetFoodRepository(foodRepo)

	if err := svc.DecideFoodSubstitution(ctx, "cust-1", "prop-1", domain.SubstitutionDecisionRequest{Decision: "rejected"}); err != nil {
		t.Fatalf("DecideFoodSubstitution rejected error: %v", err)
	}
	if foodRepo.resolved != "rejected" {
		t.Errorf("expected resolved=rejected, got %s", foodRepo.resolved)
	}
	if foodRepo.priceUpdated != nil && foodRepo.priceUpdated.called {
		t.Error("price must not update on rejection")
	}
}

// ── DecideFoodSubstitution: authorization — wrong customer ─────────────

func TestDecideFoodSubstitution_WrongCustomer_Rejected(t *testing.T) {
	ctx := context.Background()
	foodRepo := &foodSubstitutionRepo{
		order: &domain.Order{ID: "order-1", Status: domain.StatusPreparing, CustomerID: "cust-1", MerchantID: ptrString("m-1")},
		proposal: &domain.FoodSubstitutionProposal{ID: "prop-1", OrderID: "order-1", CustomerDecision: "pending"},
	}
	orderRepo := &mockOrderRepo{order: foodRepo.order}
	svc := service.NewOrderService(
		orderRepo, &stubEventRepo{}, &MockRedisRepo{}, &MockPricingRepo{},
		&stubRelay{}, &stubEventBus{}, &stubQueue{}, &stubFlags{},
		&stubNotification{}, &MockConfigRepo{}, &stubLedger{}, &stubTax{},
	)
	svc.SetFoodRepository(foodRepo)

	err := svc.DecideFoodSubstitution(ctx, "wrong-customer", "prop-1", domain.SubstitutionDecisionRequest{Decision: "approved"})
	if err == nil {
		t.Fatal("expected authorization error for wrong customer")
	}
}

// ── DecideFoodSubstitution: status guard — only preparing/searching ────

func TestDecideFoodSubstitution_NotPreparingOrSearching_Rejected(t *testing.T) {
	ctx := context.Background()
	foodRepo := &foodSubstitutionRepo{
		order: &domain.Order{ID: "order-1", Status: domain.StatusDelivered, CustomerID: "cust-1", MerchantID: ptrString("m-1")},
		proposal: &domain.FoodSubstitutionProposal{ID: "prop-1", OrderID: "order-1", CustomerDecision: "pending"},
	}
	orderRepo := &mockOrderRepo{order: foodRepo.order}
	svc := service.NewOrderService(
		orderRepo, &stubEventRepo{}, &MockRedisRepo{}, &MockPricingRepo{},
		&stubRelay{}, &stubEventBus{}, &stubQueue{}, &stubFlags{},
		&stubNotification{}, &MockConfigRepo{}, &stubLedger{}, &stubTax{},
	)
	svc.SetFoodRepository(foodRepo)

	err := svc.DecideFoodSubstitution(ctx, "cust-1", "prop-1", domain.SubstitutionDecisionRequest{Decision: "approved"})
	if err == nil {
		t.Fatal("expected status guard to reject decision on delivered order")
	}
}

// ── DecideFoodSubstitution: idempotency — already decided ─────────────

func TestDecideFoodSubstitution_AlreadyDecided_Rejected(t *testing.T) {
	ctx := context.Background()
	foodRepo := &foodSubstitutionRepo{
		order: &domain.Order{ID: "order-1", Status: domain.StatusPreparing, CustomerID: "cust-1", MerchantID: ptrString("m-1")},
		proposal: &domain.FoodSubstitutionProposal{ID: "prop-1", OrderID: "order-1", CustomerDecision: "approved"},
	}
	orderRepo := &mockOrderRepo{order: foodRepo.order}
	svc := service.NewOrderService(
		orderRepo, &stubEventRepo{}, &MockRedisRepo{}, &MockPricingRepo{},
		&stubRelay{}, &stubEventBus{}, &stubQueue{}, &stubFlags{},
		&stubNotification{}, &MockConfigRepo{}, &stubLedger{}, &stubTax{},
	)
	svc.SetFoodRepository(foodRepo)

	err := svc.DecideFoodSubstitution(ctx, "cust-1", "prop-1", domain.SubstitutionDecisionRequest{Decision: "rejected"})
	if err == nil {
		t.Fatal("expected idempotency guard to reject re-decision")
	}
}
