package service

import (
	"context"
	"fmt"
	"strings"

	"tembus/order-service/internal/domain"
)

type towingDamageClaimService struct {
	reportSvc domain.ServiceReportService
	repo      domain.TowingDamageClaimRepository
}

func NewTowingDamageClaimService(reportSvc domain.ServiceReportService, repo domain.TowingDamageClaimRepository) domain.TowingDamageClaimService {
	return &towingDamageClaimService{reportSvc: reportSvc, repo: repo}
}

func (s *towingDamageClaimService) SubmitClaim(ctx context.Context, req *domain.SubmitTowingDamageClaimRequest, operatorID string) (*domain.TowingDamageClaim, error) {
	if err := validateDamageClaimRequest(req, operatorID); err != nil {
		return nil, err
	}
	report, err := s.reportSvc.GetTowingReport(ctx, req.OrderID)
	if err != nil {
		return nil, fmt.Errorf("load towing report: %w", err)
	}
	if report == nil || report.VehicleID == "" {
		return nil, fmt.Errorf("%w: towing report belum memiliki kendaraan terikat", domain.ErrInvalidTowingDamageClaim)
	}
	if report.DamageReport == nil || report.DamageReport.Severity == "none" {
		return nil, fmt.Errorf("%w: laporan kerusakan wajib ada sebelum claim", domain.ErrInvalidTowingDamageClaim)
	}
	if report.DamageReport.Severity != req.Severity {
		return nil, fmt.Errorf("%w: severity claim harus sama dengan bukti kerusakan", domain.ErrInvalidTowingDamageClaim)
	}
	return s.repo.CreateTowingDamageClaim(ctx, req, operatorID)
}

func (s *towingDamageClaimService) GetClaim(ctx context.Context, claimID string) (*domain.TowingDamageClaim, error) {
	if strings.TrimSpace(claimID) == "" {
		return nil, fmt.Errorf("%w: claim_id wajib diisi", domain.ErrInvalidTowingDamageClaim)
	}
	return s.repo.GetTowingDamageClaim(ctx, claimID)
}

func (s *towingDamageClaimService) GetClaimByOrderID(ctx context.Context, orderID string) (*domain.TowingDamageClaim, error) {
	if strings.TrimSpace(orderID) == "" {
		return nil, fmt.Errorf("%w: order_id wajib diisi", domain.ErrInvalidTowingDamageClaim)
	}
	return s.repo.GetTowingDamageClaimByOrderID(ctx, orderID)
}

func (s *towingDamageClaimService) DecideClaim(ctx context.Context, req *domain.DecideTowingDamageClaimRequest, reviewerID string) (*domain.TowingDamageClaim, error) {
	if strings.TrimSpace(reviewerID) == "" {
		return nil, fmt.Errorf("%w: reviewer wajib diisi", domain.ErrInvalidTowingDamageClaim)
	}
	if req == nil || strings.TrimSpace(req.ClaimID) == "" {
		return nil, fmt.Errorf("%w: claim_id wajib diisi", domain.ErrInvalidTowingDamageClaim)
	}
	if req.LiabilityDecision != domain.TowingLiabilityOperator && req.LiabilityDecision != domain.TowingLiabilityPlatform &&
		req.LiabilityDecision != domain.TowingLiabilityCustomer && req.LiabilityDecision != domain.TowingLiabilityShared &&
		req.LiabilityDecision != domain.TowingLiabilityRejected {
		return nil, fmt.Errorf("%w: keputusan liability tidak valid", domain.ErrInvalidTowingDamageClaim)
	}
	if strings.TrimSpace(req.LiabilityReason) == "" {
		return nil, fmt.Errorf("%w: alasan keputusan wajib diisi", domain.ErrInvalidTowingDamageClaim)
	}
	if req.LiabilityDecision == domain.TowingLiabilityRejected {
		if req.ApprovedAmountIDR != 0 {
			return nil, fmt.Errorf("%w: claim rejected tidak boleh memiliki nominal kompensasi", domain.ErrInvalidTowingDamageClaim)
		}
	} else if req.ApprovedAmountIDR <= 0 {
		return nil, fmt.Errorf("%w: nominal kompensasi wajib lebih besar dari nol", domain.ErrInvalidTowingDamageClaim)
	}
	return s.repo.DecideTowingDamageClaim(ctx, req, reviewerID)
}

func (s *towingDamageClaimService) ReconcileCompensation(ctx context.Context, req *domain.ReconcileTowingDamageCompensationRequest, reviewerID string) (*domain.TowingDamageClaim, error) {
	if strings.TrimSpace(reviewerID) == "" {
		return nil, fmt.Errorf("%w: reviewer wajib diisi", domain.ErrInvalidTowingDamageClaim)
	}
	if req == nil || strings.TrimSpace(req.ClaimID) == "" {
		return nil, fmt.Errorf("%w: claim_id wajib diisi", domain.ErrInvalidTowingDamageClaim)
	}
	if req.CompensationChannel != domain.TowingCompensationSettlement && req.CompensationChannel != domain.TowingCompensationInsurance && req.CompensationChannel != domain.TowingCompensationReserve {
		return nil, fmt.Errorf("%w: channel kompensasi tidak valid", domain.ErrInvalidTowingDamageClaim)
	}
	if strings.TrimSpace(req.CompensationReference) == "" {
		return nil, fmt.Errorf("%w: reference settlement/insurance wajib diisi", domain.ErrInvalidTowingDamageClaim)
	}
	return s.repo.ReconcileTowingDamageCompensation(ctx, req, reviewerID)
}

func validateDamageClaimRequest(req *domain.SubmitTowingDamageClaimRequest, operatorID string) error {
	if req == nil {
		return fmt.Errorf("%w: body claim wajib diisi", domain.ErrInvalidTowingDamageClaim)
	}
	if strings.TrimSpace(operatorID) == "" {
		return fmt.Errorf("%w: operator wajib diisi", domain.ErrInvalidTowingDamageClaim)
	}
	if strings.TrimSpace(req.OrderID) == "" {
		return fmt.Errorf("%w: order_id wajib diisi", domain.ErrInvalidTowingDamageClaim)
	}
	if req.Severity != "minor" && req.Severity != "major" {
		return fmt.Errorf("%w: severity harus minor atau major", domain.ErrInvalidTowingDamageClaim)
	}
	if req.ClaimAmountIDR <= 0 {
		return fmt.Errorf("%w: claim_amount_idr wajib lebih besar dari nol", domain.ErrInvalidTowingDamageClaim)
	}
	return nil
}
