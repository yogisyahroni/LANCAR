package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"

	"tembus/order-service/internal/domain"
)

type refundService struct {
	refundRepo  domain.RefundRepository
	orderRepo   domain.OrderRepository
	paymentRepo domain.PaymentRepository
	gateway     domain.RefundGateway
}

func NewRefundService(
	refundRepo domain.RefundRepository,
	orderRepo domain.OrderRepository,
	paymentRepo domain.PaymentRepository,
	gateway domain.RefundGateway,
) domain.RefundService {
	return &refundService{
		refundRepo:  refundRepo,
		orderRepo:   orderRepo,
		paymentRepo: paymentRepo,
		gateway:     gateway,
	}
}

func (s *refundService) CalculateAndTriggerRefund(ctx context.Context, orderID uuid.UUID, cancelReason string) (*domain.RefundRecord, error) {
	// Get order details
	order, err := s.orderRepo.GetByID(ctx, orderID.String())
	if err != nil {
		return nil, fmt.Errorf("failed to get order: %w", err)
	}

	// Calculate refund amount
	// Policy:
	// - pre-assignment (no courier): 100%
	// - courier assigned but not picked up: 80%
	// - picked up (in transit, etc): 0%

	refundRatio := 0.0
	switch order.Status {
	case domain.StatusPendingPayment, domain.StatusPending, domain.StatusPendingAssignment, domain.StatusSearching:
		refundRatio = 1.0
	case domain.StatusAccepted, domain.StatusPickingUp:
		refundRatio = 0.8
	default:
		// Picked up or later -> 0% refund
		refundRatio = 0.0
	}

	if refundRatio == 0.0 {
		log.Printf("No refund applicable for order %s at status %s", orderID, order.Status)
		return nil, nil // No refund
	}

	// Get Payment
	payment, err := s.paymentRepo.GetByOrderID(ctx, orderID.String())
	if err != nil {
		return nil, fmt.Errorf("failed to get payment: %w", err)
	}
	if payment.Status != domain.PaymentStatusPaid {
		log.Printf("Payment for order %s is not paid (%s), no refund needed", orderID, payment.Status)
		return nil, nil // Payment not settled, maybe just cancel the payment instead
	}

	refundAmount := int(float64(payment.AmountIDR) * refundRatio)
	if refundAmount <= 0 {
		return nil, nil
	}

	now := time.Now()
	record := &domain.RefundRecord{
		ID:        uuid.New(),
		OrderID:   orderID,
		AmountIDR: refundAmount,
		Reason:    cancelReason,
		Status:    domain.RefundStatusPending,
		CreatedAt: now,
		UpdatedAt: now,
	}

	err = s.refundRepo.CreateRefund(ctx, record)
	if err != nil {
		return nil, fmt.Errorf("failed to create refund record: %w", err)
	}

	// For MVP, we'll try to process synchronously or via batch.
	// We'll leave it pending and processing can happen by Trigger
	return record, nil
}

func (s *refundService) ProcessPendingRefunds(ctx context.Context) error {
	pending, err := s.refundRepo.GetPendingRefunds(ctx)
	if err != nil {
		return fmt.Errorf("failed to get pending refunds: %w", err)
	}

	for _, r := range pending {
		// Get payment to find the gateway ref to refund
		payment, err := s.paymentRepo.GetByOrderID(ctx, r.OrderID.String())
		if err != nil || payment.ProviderReference == nil {
			log.Printf("Skipping refund %s, payment not found or no ref", r.ID)
			continue
		}

		ref, gatewayErr := s.gateway.ProcessRefund(ctx, *payment.ProviderReference, r.AmountIDR, r.Reason)

		status := domain.RefundStatusProcessed
		var errReason *string
		if gatewayErr != nil {
			status = domain.RefundStatusFailed
			reason := gatewayErr.Error()
			errReason = &reason
			log.Printf("Failed to process refund %s: %v", r.ID, gatewayErr)
		}

		s.refundRepo.UpdateRefundStatus(ctx, r.ID, status, &ref, errReason)
	}

	return nil
}
