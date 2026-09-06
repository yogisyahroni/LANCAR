package service

import (
	"context"
	"errors"
	"testing"
	"tembus/order-service/internal/domain"
)

type fakeServiceAdjustmentRepo struct {
	proposed *domain.ProposeServiceAdjustmentRequest
	delta    int64
	decided  *domain.DecideServiceAdjustmentRequest
}

func (f *fakeServiceAdjustmentRepo) Propose(_ context.Context, req *domain.ProposeServiceAdjustmentRequest, _ string, delta int64) (*domain.ServiceAdjustment, error) {
	copyReq := *req
	copyReq.Items = append([]domain.ServiceAdjustmentItem(nil), req.Items...)
	f.proposed = &copyReq
	f.delta = delta
	return &domain.ServiceAdjustment{ID: "adj-1", DeltaIDR: delta}, nil
}
func (f *fakeServiceAdjustmentRepo) ListForCustomer(context.Context, string, string) ([]domain.ServiceAdjustment, error) {
	return nil, nil
}
func (f *fakeServiceAdjustmentRepo) Decide(_ context.Context, req *domain.DecideServiceAdjustmentRequest, _ string) (*domain.ServiceAdjustment, error) {
	copyReq := *req
	f.decided = &copyReq
	return &domain.ServiceAdjustment{ID: req.AdjustmentID, Status: domain.ServiceAdjustmentStatusApproved}, nil
}

func TestServiceAdjustmentProposalComputesStructuredDeltaServerSide(t *testing.T) {
	repo := &fakeServiceAdjustmentRepo{}
	svc := NewServiceAdjustmentService(repo)
	result, err := svc.Propose(context.Background(), &domain.ProposeServiceAdjustmentRequest{
		OrderID: "order-1", Reason: "Ban membutuhkan patch dan valve baru", IdempotencyKey: "proposal-key-12345",
		Items: []domain.ServiceAdjustmentItem{
			{Code: "PATCH", Label: "Patch tubeless", Type: "material", Quantity: 2, UnitPriceIDR: 15_000, TotalIDR: 1},
			{Code: "LABOR", Label: "Jasa tambahan", Type: "labor", Quantity: 1, UnitPriceIDR: 20_000},
		},
	}, "courier-1")
	if err != nil { t.Fatalf("Propose() error = %v", err) }
	if result.DeltaIDR != 50_000 || repo.delta != 50_000 { t.Fatalf("delta = %d, want 50000", repo.delta) }
	if repo.proposed.Items[0].TotalIDR != 30_000 { t.Fatalf("server total = %d, want 30000", repo.proposed.Items[0].TotalIDR) }
	if repo.proposed.RequestFingerprint == "" { t.Fatal("request fingerprint must be populated") }
}

func TestServiceAdjustmentProposalRejectsUnstructuredOrUnsafeItems(t *testing.T) {
	svc := NewServiceAdjustmentService(&fakeServiceAdjustmentRepo{})
	_, err := svc.Propose(context.Background(), &domain.ProposeServiceAdjustmentRequest{
		OrderID: "order-1", Reason: "Tambahan pekerjaan", IdempotencyKey: "proposal-key-12345",
		Items: []domain.ServiceAdjustmentItem{{Code: "X", Label: "Unknown", Type: "free_text", Quantity: 1, UnitPriceIDR: 1}},
	}, "courier-1")
	if !errors.Is(err, domain.ErrInvalidServiceAdjustment) { t.Fatalf("error = %v, want invalid adjustment", err) }
}

func TestServiceAdjustmentProposalRejectsDeltaAboveSafetyCap(t *testing.T) {
	svc := NewServiceAdjustmentService(&fakeServiceAdjustmentRepo{})
	_, err := svc.Propose(context.Background(), &domain.ProposeServiceAdjustmentRequest{
		OrderID: "order-1", Reason: "Tambahan material melebihi batas keamanan", IdempotencyKey: "proposal-key-safety-cap",
		Items: []domain.ServiceAdjustmentItem{{
			Code: "PREMIUM_MATERIAL", Label: "Material premium", Type: "material", Quantity: 2, UnitPriceIDR: 5_000_001,
		}},
	}, "courier-1")
	if !errors.Is(err, domain.ErrInvalidServiceAdjustment) { t.Fatalf("error = %v, want invalid adjustment", err) }
}

func TestServiceAdjustmentDecisionRequiresExplicitApproveOrReject(t *testing.T) {
	svc := NewServiceAdjustmentService(&fakeServiceAdjustmentRepo{})
	_, err := svc.Decide(context.Background(), &domain.DecideServiceAdjustmentRequest{
		AdjustmentID: "adj-1", Decision: "maybe", IdempotencyKey: "decision-key-12345",
	}, "customer-1")
	if !errors.Is(err, domain.ErrInvalidServiceAdjustment) { t.Fatalf("error = %v, want invalid adjustment", err) }
}

func TestServiceAdjustmentRejectRequiresReason(t *testing.T) {
	svc := NewServiceAdjustmentService(&fakeServiceAdjustmentRepo{})
	_, err := svc.Decide(context.Background(), &domain.DecideServiceAdjustmentRequest{
		AdjustmentID: "adj-1", Decision: "reject", IdempotencyKey: "decision-key-12345",
	}, "customer-1")
	if !errors.Is(err, domain.ErrInvalidServiceAdjustment) { t.Fatalf("error = %v, want invalid adjustment", err) }
}
