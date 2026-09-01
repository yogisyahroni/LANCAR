package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"tembus/order-service/internal/domain"
)

type fakeTowingClaimRepo struct {
	created    bool
	decided    bool
	reconciled bool
	claim      *domain.TowingDamageClaim
}

func (r *fakeTowingClaimRepo) CreateTowingDamageClaim(_ context.Context, req *domain.SubmitTowingDamageClaimRequest, operatorID string) (*domain.TowingDamageClaim, error) {
	r.created = true
	r.claim = &domain.TowingDamageClaim{
		ID: "claim-1", OrderID: req.OrderID, VehicleID: "vehicle-1", OperatorID: operatorID,
		Status: domain.TowingDamageClaimStatusSubmitted, Severity: req.Severity, ClaimAmountIDR: req.ClaimAmountIDR,
	}
	return r.claim, nil
}

func (r *fakeTowingClaimRepo) GetTowingDamageClaim(context.Context, string) (*domain.TowingDamageClaim, error) {
	return r.claim, nil
}

func (r *fakeTowingClaimRepo) GetTowingDamageClaimByOrderID(context.Context, string) (*domain.TowingDamageClaim, error) {
	return r.claim, nil
}

func (r *fakeTowingClaimRepo) DecideTowingDamageClaim(_ context.Context, req *domain.DecideTowingDamageClaimRequest, reviewerID string) (*domain.TowingDamageClaim, error) {
	r.decided = true
	r.claim.Status = domain.TowingDamageClaimStatusApproved
	r.claim.LiabilityDecision = req.LiabilityDecision
	r.claim.ApprovedAmountIDR = req.ApprovedAmountIDR
	r.claim.LiabilityDecidedBy = &reviewerID
	return r.claim, nil
}

func (r *fakeTowingClaimRepo) ReconcileTowingDamageCompensation(_ context.Context, req *domain.ReconcileTowingDamageCompensationRequest, _ string) (*domain.TowingDamageClaim, error) {
	r.reconciled = true
	r.claim.Status = domain.TowingDamageClaimStatusPaid
	r.claim.CompensationChannel = &req.CompensationChannel
	r.claim.CompensationReference = &req.CompensationReference
	now := time.Now()
	r.claim.CompensatedAt = &now
	return r.claim, nil
}

func newClaimService(report *domain.TowingReport, repo *fakeTowingClaimRepo) domain.TowingDamageClaimService {
	reportRepo := &fakeServiceReportRepo{towingReport: report}
	return NewTowingDamageClaimService(NewServiceReportService(reportRepo), repo)
}

func TestSubmitTowingDamageClaimRequiresVehicleBoundReport(t *testing.T) {
	repo := &fakeTowingClaimRepo{}
	svc := newClaimService(&domain.TowingReport{OrderID: "order-1", DamageReport: &domain.TowingDamageReport{Severity: "major"}}, repo)

	_, err := svc.SubmitClaim(context.Background(), &domain.SubmitTowingDamageClaimRequest{OrderID: "order-1", Severity: "major", ClaimAmountIDR: 500000}, "operator-1")
	if !errors.Is(err, domain.ErrInvalidTowingDamageClaim) {
		t.Fatalf("expected vehicle binding validation, got %v", err)
	}
	if repo.created {
		t.Fatal("claim repository should not be called without a bound vehicle")
	}
}

func TestTowingDamageClaimWorkflowRequiresMatchingEvidenceAndReferences(t *testing.T) {
	repo := &fakeTowingClaimRepo{}
	report := &domain.TowingReport{
		OrderID: "order-1", VehicleID: "vehicle-1",
		DamageReport: &domain.TowingDamageReport{Severity: "major", Areas: []string{"front_bumper"}},
	}
	svc := newClaimService(report, repo)

	_, err := svc.SubmitClaim(context.Background(), &domain.SubmitTowingDamageClaimRequest{OrderID: "order-1", Severity: "minor", ClaimAmountIDR: 500000}, "operator-1")
	if !errors.Is(err, domain.ErrInvalidTowingDamageClaim) {
		t.Fatalf("expected severity mismatch validation, got %v", err)
	}

	claim, err := svc.SubmitClaim(context.Background(), &domain.SubmitTowingDamageClaimRequest{OrderID: "order-1", Severity: "major", ClaimAmountIDR: 500000}, "operator-1")
	if err != nil || claim == nil || !repo.created {
		t.Fatalf("expected claim submission, claim=%#v err=%v", claim, err)
	}

	_, err = svc.DecideClaim(context.Background(), &domain.DecideTowingDamageClaimRequest{ClaimID: claim.ID, LiabilityDecision: domain.TowingLiabilityPlatform, ApprovedAmountIDR: 500000}, "reviewer-1")
	if !errors.Is(err, domain.ErrInvalidTowingDamageClaim) {
		t.Fatalf("expected decision reason validation, got %v", err)
	}

	claim, err = svc.DecideClaim(context.Background(), &domain.DecideTowingDamageClaimRequest{ClaimID: claim.ID, LiabilityDecision: domain.TowingLiabilityPlatform, ApprovedAmountIDR: 500000, LiabilityReason: "Bukti sebelum dan sesudah konsisten."}, "reviewer-1")
	if err != nil || claim.Status != domain.TowingDamageClaimStatusApproved || !repo.decided {
		t.Fatalf("expected approved claim, claim=%#v err=%v", claim, err)
	}

	_, err = svc.ReconcileCompensation(context.Background(), &domain.ReconcileTowingDamageCompensationRequest{ClaimID: claim.ID, CompensationChannel: domain.TowingCompensationInsurance}, "reviewer-1")
	if !errors.Is(err, domain.ErrInvalidTowingDamageClaim) {
		t.Fatalf("expected compensation reference validation, got %v", err)
	}

	claim, err = svc.ReconcileCompensation(context.Background(), &domain.ReconcileTowingDamageCompensationRequest{ClaimID: claim.ID, CompensationChannel: domain.TowingCompensationInsurance, CompensationReference: "INS-2026-001"}, "reviewer-1")
	if err != nil || claim.Status != domain.TowingDamageClaimStatusPaid || !repo.reconciled {
		t.Fatalf("expected reconciled paid claim, claim=%#v err=%v", claim, err)
	}
}

func TestTowingDamageClaimDecisionRejectsNonPositiveApprovedAmount(t *testing.T) {
	repo := &fakeTowingClaimRepo{claim: &domain.TowingDamageClaim{ID: "claim-1"}}
	svc := newClaimService(&domain.TowingReport{OrderID: "order-1", VehicleID: "vehicle-1", DamageReport: &domain.TowingDamageReport{Severity: "minor"}}, repo)

	_, err := svc.DecideClaim(context.Background(), &domain.DecideTowingDamageClaimRequest{ClaimID: "claim-1", LiabilityDecision: domain.TowingLiabilityOperator, ApprovedAmountIDR: 0, LiabilityReason: "Tidak ada kerusakan yang disebabkan operator."}, "reviewer-1")
	if !errors.Is(err, domain.ErrInvalidTowingDamageClaim) {
		t.Fatalf("expected positive compensation validation, got %v", err)
	}
}
