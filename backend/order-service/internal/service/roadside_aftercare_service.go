package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"tembus/order-service/internal/domain"
)

type roadsideAftercareService struct {
	repo domain.RoadsideAftercareRepository
}

func NewRoadsideAftercareService(repo domain.RoadsideAftercareRepository) domain.RoadsideAftercareService {
	return &roadsideAftercareService{repo: repo}
}

func (s *roadsideAftercareService) SubmitClaim(ctx context.Context, req *domain.SubmitRoadsideClaimRequest, customerID string) (*domain.RoadsideServiceClaim, error) {
	if req == nil || strings.TrimSpace(req.OrderID) == "" || strings.TrimSpace(customerID) == "" || strings.TrimSpace(req.IdempotencyKey) == "" {
		return nil, fmt.Errorf("%w: order, customer, dan idempotency key wajib", domain.ErrInvalidRoadsideAftercare)
	}
	req.OrderID = strings.TrimSpace(req.OrderID)
	req.IssueType = strings.ToLower(strings.TrimSpace(req.IssueType))
	req.Description = strings.TrimSpace(req.Description)
	if req.IssueType != domain.RoadsideClaimIssueWarranty &&
		req.IssueType != domain.RoadsideClaimIssueServiceQuality &&
		req.IssueType != domain.RoadsideClaimIssueDamage &&
		req.IssueType != domain.RoadsideClaimIssueOther {
		return nil, fmt.Errorf("%w: issue_type tidak didukung", domain.ErrInvalidRoadsideAftercare)
	}
	if len(req.Description) < 10 || len(req.Description) > 2000 {
		return nil, fmt.Errorf("%w: description harus 10-2000 karakter", domain.ErrInvalidRoadsideAftercare)
	}
	fingerprint, err := roadsideAftercareFingerprint(map[string]any{
		"order_id": req.OrderID, "issue_type": req.IssueType, "description": req.Description,
	})
	if err != nil {
		return nil, err
	}
	req.RequestFingerprint = fingerprint
	return s.repo.SubmitClaim(ctx, req, strings.TrimSpace(customerID))
}

func (s *roadsideAftercareService) SubmitRating(ctx context.Context, req *domain.SubmitRoadsideRatingRequest, customerID string) (*domain.RoadsideServiceRating, error) {
	if req == nil || strings.TrimSpace(req.OrderID) == "" || strings.TrimSpace(customerID) == "" || strings.TrimSpace(req.IdempotencyKey) == "" {
		return nil, fmt.Errorf("%w: order, customer, dan idempotency key wajib", domain.ErrInvalidRoadsideAftercare)
	}
	req.OrderID = strings.TrimSpace(req.OrderID)
	req.Comment = strings.TrimSpace(req.Comment)
	if req.OverallRating < 1 || req.OverallRating > 5 || req.TechnicianQualityRating < 1 || req.TechnicianQualityRating > 5 {
		return nil, fmt.Errorf("%w: rating harus 1-5", domain.ErrInvalidRoadsideAftercare)
	}
	if len(req.Comment) > 500 {
		return nil, fmt.Errorf("%w: comment maksimal 500 karakter", domain.ErrInvalidRoadsideAftercare)
	}
	fingerprint, err := roadsideAftercareFingerprint(map[string]any{
		"order_id": req.OrderID,
		"overall_rating": req.OverallRating,
		"technician_quality_rating": req.TechnicianQualityRating,
		"comment": req.Comment,
	})
	if err != nil {
		return nil, err
	}
	req.RequestFingerprint = fingerprint
	return s.repo.SubmitRating(ctx, req, strings.TrimSpace(customerID))
}

func roadsideAftercareFingerprint(value any) (string, error) {
	payload, err := json.Marshal(value)
	if err != nil {
		return "", fmt.Errorf("fingerprint roadside aftercare: %w", err)
	}
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:]), nil
}
