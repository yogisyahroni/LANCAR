package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"tembus/order-service/internal/domain"
)

const maxServiceAdjustmentDeltaIDR int64 = 10_000_000

type serviceAdjustmentService struct {
	repo domain.ServiceAdjustmentRepository
}

func NewServiceAdjustmentService(repo domain.ServiceAdjustmentRepository) domain.ServiceAdjustmentService {
	return &serviceAdjustmentService{repo: repo}
}

func (s *serviceAdjustmentService) Propose(ctx context.Context, req *domain.ProposeServiceAdjustmentRequest, courierID string) (*domain.ServiceAdjustment, error) {
	if req == nil || strings.TrimSpace(req.OrderID) == "" || strings.TrimSpace(courierID) == "" {
		return nil, fmt.Errorf("%w: order dan courier wajib", domain.ErrInvalidServiceAdjustment)
	}
	if strings.TrimSpace(req.IdempotencyKey) == "" {
		return nil, fmt.Errorf("%w: idempotency key wajib", domain.ErrInvalidServiceAdjustment)
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if len(req.Reason) < 5 || len(req.Reason) > 500 {
		return nil, fmt.Errorf("%w: alasan adjustment harus 5-500 karakter", domain.ErrInvalidServiceAdjustment)
	}
	if len(req.Items) == 0 || len(req.Items) > 30 {
		return nil, fmt.Errorf("%w: adjustment harus memiliki 1-30 item", domain.ErrInvalidServiceAdjustment)
	}

	var delta int64
	for i := range req.Items {
		item := &req.Items[i]
		item.Code = strings.TrimSpace(item.Code)
		item.Label = strings.TrimSpace(item.Label)
		item.Type = strings.ToLower(strings.TrimSpace(item.Type))
		if item.Code == "" || item.Label == "" {
			return nil, fmt.Errorf("%w: code dan label item wajib", domain.ErrInvalidServiceAdjustment)
		}
		if item.Type != domain.ServiceAdjustmentItemMaterial && item.Type != domain.ServiceAdjustmentItemLabor {
			return nil, fmt.Errorf("%w: tipe item harus material atau labor", domain.ErrInvalidServiceAdjustment)
		}
		if item.Quantity <= 0 || item.Quantity > 100 || item.UnitPriceIDR <= 0 {
			return nil, fmt.Errorf("%w: quantity/unit price tidak valid", domain.ErrInvalidServiceAdjustment)
		}
		if item.UnitPriceIDR > math.MaxInt64/item.Quantity {
			return nil, fmt.Errorf("%w: nilai item overflow", domain.ErrInvalidServiceAdjustment)
		}
		item.TotalIDR = item.UnitPriceIDR * item.Quantity
		if delta > maxServiceAdjustmentDeltaIDR-item.TotalIDR {
			return nil, fmt.Errorf("%w: total adjustment melebihi batas keamanan", domain.ErrInvalidServiceAdjustment)
		}
		delta += item.TotalIDR
	}
	if delta <= 0 || delta > maxServiceAdjustmentDeltaIDR {
		return nil, fmt.Errorf("%w: total adjustment tidak valid", domain.ErrInvalidServiceAdjustment)
	}

	fingerprint, err := serviceAdjustmentFingerprint(map[string]any{
		"order_id": req.OrderID,
		"reason":   req.Reason,
		"items":    req.Items,
	})
	if err != nil {
		return nil, fmt.Errorf("fingerprint adjustment: %w", err)
	}
	req.RequestFingerprint = fingerprint
	return s.repo.Propose(ctx, req, courierID, delta)
}

func (s *serviceAdjustmentService) ListForCustomer(ctx context.Context, orderID, customerID string) ([]domain.ServiceAdjustment, error) {
	if strings.TrimSpace(orderID) == "" || strings.TrimSpace(customerID) == "" {
		return nil, fmt.Errorf("%w: order/customer wajib", domain.ErrInvalidServiceAdjustment)
	}
	return s.repo.ListForCustomer(ctx, strings.TrimSpace(orderID), strings.TrimSpace(customerID))
}

func (s *serviceAdjustmentService) Decide(ctx context.Context, req *domain.DecideServiceAdjustmentRequest, customerID string) (*domain.ServiceAdjustment, error) {
	if req == nil || strings.TrimSpace(req.AdjustmentID) == "" || strings.TrimSpace(customerID) == "" {
		return nil, fmt.Errorf("%w: adjustment/customer wajib", domain.ErrInvalidServiceAdjustment)
	}
	if strings.TrimSpace(req.IdempotencyKey) == "" {
		return nil, fmt.Errorf("%w: idempotency key wajib", domain.ErrInvalidServiceAdjustment)
	}
	req.Decision = strings.ToLower(strings.TrimSpace(req.Decision))
	req.RejectionReason = strings.TrimSpace(req.RejectionReason)
	if req.Decision != "approve" && req.Decision != "reject" {
		return nil, fmt.Errorf("%w: decision harus approve atau reject", domain.ErrInvalidServiceAdjustment)
	}
	if req.Decision == "reject" && (len(req.RejectionReason) < 3 || len(req.RejectionReason) > 500) {
		return nil, fmt.Errorf("%w: rejection_reason harus 3-500 karakter", domain.ErrInvalidServiceAdjustment)
	}
	if req.Decision == "approve" {
		req.RejectionReason = ""
	}

	fingerprint, err := serviceAdjustmentFingerprint(map[string]any{
		"adjustment_id":   req.AdjustmentID,
		"decision":        req.Decision,
		"rejection_reason": req.RejectionReason,
	})
	if err != nil {
		return nil, fmt.Errorf("fingerprint decision: %w", err)
	}
	req.RequestFingerprint = fingerprint
	return s.repo.Decide(ctx, req, customerID)
}

func serviceAdjustmentFingerprint(value any) (string, error) {
	payload, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:]), nil
}
