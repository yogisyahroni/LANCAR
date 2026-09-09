package service_test

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/featureflags"
	"tembus/order-service/internal/service"
	"testing"
	"time"
)

type quoteValidationRedisRepo struct {
	*MockRedisRepo
	estimate *domain.PricingEstimateResponse
}

func (r *quoteValidationRedisRepo) GetEstimate(context.Context, string) (*domain.PricingEstimateResponse, error) {
	return r.estimate, nil
}

type quoteValidationFlags struct{ stubFlags }

func (f *quoteValidationFlags) GetFlag(context.Context, string) (*featureflags.FeatureFlag, error) {
	return &featureflags.FeatureFlag{IsEnabled: true}, nil
}

func newQuoteValidationService(redisRepo domain.RedisRepository, orderRepo domain.OrderRepository, flags featureflags.FlagReader) domain.OrderService {
	return service.NewOrderService(
		orderRepo,
		&stubEventRepo{},
		redisRepo,
		&MockPricingRepo{Config: &domain.PricingConfig{}},
		&stubRelay{},
		&stubEventBus{},
		&stubQueue{},
		flags,
		&stubNotification{},
		&MockConfigRepo{},
		&stubLedger{},
		&stubTax{},
	)
}

func quoteValidationEstimate() *domain.PricingEstimateResponse {
	return &domain.PricingEstimateResponse{
		EstimateID:       "quote-1",
		QuoteID:          "quote-1",
		InputFingerprint: domain.QuoteInputFingerprint(quoteValidationPricingInput()),
		SnapshotHash:     "snapshot-1",
		ServiceCategory:  "package_on_demand",
		Currency:         "IDR",
		Model:            "p2p",
		TotalPriceIDR:    42000,
		TotalPriceMinor:  42000,
		ExpiresAt:        time.Now().Add(time.Hour),
	}
}

func quoteValidationPricingInput() domain.PricingEstimateRequest {
	return domain.PricingEstimateRequest{
		PickupLat:  -6.2000,
		PickupLng:  106.8166,
		DropoffLat: -6.2100,
		DropoffLng: 106.8200,
		Length:     20,
		Width:      15,
		Height:     10,
		Weight:     2,
		Models:     []string{"p2p"},
		PackageFacts: domain.PackageFacts{
			Quantity:        1,
			Category:        "electronic",
			ItemDescription: "Laptop test",
		},
	}
}

func quoteValidationRequest(estimate *domain.PricingEstimateResponse) domain.CreateOrderRequest {
	return domain.CreateOrderRequest{
		EstimateID:            estimate.QuoteID,
		QuoteInputFingerprint: estimate.InputFingerprint,
		QuoteSnapshotHash:     estimate.SnapshotHash,
		ItemDescription:       "Laptop test",
	}
}

func TestCreateOrderRejectsExpiredOrChangedQuoteBeforePersistence(t *testing.T) {
	ctx := context.Background()
	baseInput := quoteValidationPricingInput()

	tests := []struct {
		name       string
		mutate     func(*domain.PricingEstimateResponse, *domain.CreateOrderRequest)
		wantReason string
	}{
		{
			name: "expired",
			mutate: func(estimate *domain.PricingEstimateResponse, _ *domain.CreateOrderRequest) {
				estimate.ExpiresAt = time.Now().Add(-time.Minute)
			},
			wantReason: "kedaluwarsa",
		},
		{
			name: "quote identity",
			mutate: func(estimate *domain.PricingEstimateResponse, req *domain.CreateOrderRequest) {
				estimate.QuoteID = "quote-from-another-selection"
				req.EstimateID = "quote-1"
			},
			wantReason: "quote_id tidak cocok",
		},
		{
			name: "address changed",
			mutate: func(estimate *domain.PricingEstimateResponse, req *domain.CreateOrderRequest) {
				changed := baseInput
				changed.DropoffLat += 0.01
				req.QuoteInputFingerprint = domain.QuoteInputFingerprint(changed)
				estimate.InputFingerprint = domain.QuoteInputFingerprint(baseInput)
			},
			wantReason: "input pricing berubah",
		},
		{
			name: "package changed",
			mutate: func(estimate *domain.PricingEstimateResponse, req *domain.CreateOrderRequest) {
				changed := baseInput
				changed.PackageFacts.ItemDescription = "Fragile camera"
				req.QuoteInputFingerprint = domain.QuoteInputFingerprint(changed)
				estimate.InputFingerprint = domain.QuoteInputFingerprint(baseInput)
			},
			wantReason: "input pricing berubah",
		},
		{
			name: "service changed",
			mutate: func(estimate *domain.PricingEstimateResponse, req *domain.CreateOrderRequest) {
				changed := baseInput
				changed.Models = []string{"food"}
				req.QuoteInputFingerprint = domain.QuoteInputFingerprint(changed)
				estimate.InputFingerprint = domain.QuoteInputFingerprint(baseInput)
			},
			wantReason: "input pricing berubah",
		},
		{
			name: "snapshot changed",
			mutate: func(_ *domain.PricingEstimateResponse, req *domain.CreateOrderRequest) {
				req.QuoteSnapshotHash = "snapshot-from-another-quote"
			},
			wantReason: "snapshot harga tidak lagi cocok",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			estimate := quoteValidationEstimate()
			req := quoteValidationRequest(estimate)
			tt.mutate(estimate, &req)
			svc := newQuoteValidationService(
				&quoteValidationRedisRepo{MockRedisRepo: &MockRedisRepo{}, estimate: estimate},
				nil,
				&quoteValidationFlags{},
			)

			order, err := svc.CreateOrder(ctx, "customer-1", req)
			if order != nil {
				t.Fatalf("CreateOrder returned order for rejected quote: %+v", order)
			}
			var requoteErr *domain.RequoteRequiredError
			if !errors.As(err, &requoteErr) {
				t.Fatalf("error = %v, want RequoteRequiredError", err)
			}
			if !strings.Contains(requoteErr.Reason, tt.wantReason) {
				t.Fatalf("reason = %q, want substring %q", requoteErr.Reason, tt.wantReason)
			}
			if requoteErr.QuoteID == "" {
				t.Fatal("requote error must include quote id")
			}
		})
	}
}

func TestCreateOrderPersistsExactAuthoritativeQuoteSnapshot(t *testing.T) {
	estimate := quoteValidationEstimate()
	request := quoteValidationRequest(estimate)
	orderRepo := &clOrderRepo{}
	svc := newQuoteValidationService(
		&quoteValidationRedisRepo{MockRedisRepo: &MockRedisRepo{}, estimate: estimate},
		orderRepo,
		&quoteValidationFlags{},
	)

	order, err := svc.CreateOrder(context.Background(), "customer-1", request)
	if err != nil {
		t.Fatalf("CreateOrder error: %v", err)
	}
	if order == nil || orderRepo.captured == nil {
		t.Fatal("CreateOrder did not persist an order")
	}

	wantSnapshot, err := json.Marshal(estimate)
	if err != nil {
		t.Fatalf("marshal authoritative quote: %v", err)
	}
	if orderRepo.captured.PricingSnapshot != string(wantSnapshot) {
		t.Fatalf("pricing snapshot = %s, want exact quote response %s", orderRepo.captured.PricingSnapshot, wantSnapshot)
	}
	if orderRepo.captured.TotalPriceIDR != estimate.TotalPriceIDR {
		t.Fatalf("persisted total = %d, want server quote total %d", orderRepo.captured.TotalPriceIDR, estimate.TotalPriceIDR)
	}
}
