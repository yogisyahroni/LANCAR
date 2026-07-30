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
	redisRepo   domain.RedisRepository
	ledgerRepo  domain.FinanceLedgerRepository
}

func NewRefundService(
	refundRepo domain.RefundRepository,
	orderRepo domain.OrderRepository,
	paymentRepo domain.PaymentRepository,
	gateway domain.RefundGateway,
	redisRepo domain.RedisRepository,
	ledgerRepo domain.FinanceLedgerRepository,
) domain.RefundService {
	return &refundService{
		refundRepo:  refundRepo,
		orderRepo:   orderRepo,
		paymentRepo: paymentRepo,
		gateway:     gateway,
		redisRepo:   redisRepo,
		ledgerRepo:  ledgerRepo,
	}
}

func (s *refundService) CalculateAndTriggerRefund(ctx context.Context, orderID uuid.UUID, cancelReason string) (*domain.RefundRecord, error) {
	// CEL-NEW #4: Prevent TOCTOU / Double Refund Admin Click via Distributed Lock
	lockKey := fmt.Sprintf("refund_lock:%s", orderID.String())
	acquired, err := s.redisRepo.AcquireLock(ctx, lockKey, 30*time.Second)
	if err != nil {
		return nil, fmt.Errorf("failed to acquire refund lock: %w", err)
	}
	if !acquired {
		return nil, fmt.Errorf("refund process is already running for order %s", orderID.String())
	}
	defer func() {
		_ = s.redisRepo.ReleaseLock(ctx, lockKey)
	}()

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
	case domain.StatusPendingPayment, domain.StatusPending, domain.StatusPendingAssignment, domain.StatusSearching, domain.StatusNoCourierFound, domain.StatusCancelled:
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

	refundPercentage := int(refundRatio * 100)
	taxReversal := int64(float64(order.PPNIDR) * refundRatio)
	platformFeeReversal := int64(float64(order.PlatformFeeIDR) * refundRatio)

	now := time.Now()
	refundID := uuid.New()

	var journalIDPtr *uuid.UUID
	if s.ledgerRepo != nil {
		retainedAmount := int64(payment.AmountIDR - refundAmount)
		entries := []domain.LedgerEntry{
			{ID: uuid.New(), AccountName: "escrow_holding", DebitIDR: int64(payment.AmountIDR), CreditIDR: 0, CreatedAt: now},
			{ID: uuid.New(), AccountName: "customer_refund_payable", DebitIDR: 0, CreditIDR: int64(refundAmount), CreatedAt: now},
		}
		if retainedAmount > 0 {
			entries = append(entries, domain.LedgerEntry{
				ID:          uuid.New(),
				AccountName: "cancellation_fee_revenue",
				DebitIDR:    0,
				CreditIDR:   retainedAmount,
				CreatedAt:   now,
			})
		}

		journal := &domain.LedgerJournal{
			ID:             uuid.New(),
			JournalType:    "order_refund",
			ReferenceType:  "order",
			ReferenceID:    orderID.String(),
			IdempotencyKey: fmt.Sprintf("REFUND-JRN-%s", refundID.String()),
			Reason:         cancelReason,
			Metadata: map[string]any{
				"refund_id":           refundID.String(),
				"refund_percentage":   refundPercentage,
				"tax_reversal_idr":    taxReversal,
				"fee_reversal_idr":    platformFeeReversal,
			},
			CreatedBy: "system",
			ActorRole: "system",
			CreatedAt: now,
		}

		jid, errLedger := s.ledgerRepo.CreateJournalReturningID(ctx, journal, entries)
		if errLedger != nil {
			log.Printf("Warning: failed to record ledger journal for refund %s: %v", refundID, errLedger)
		} else if jid != uuid.Nil {
			journalIDPtr = &jid
		}
	}

	record := &domain.RefundRecord{
		ID:                     refundID,
		OrderID:                orderID,
		AmountIDR:              refundAmount,
		Reason:                 cancelReason,
		Status:                 domain.RefundStatusPending,
		RefundPercentage:       refundPercentage,
		TaxReversalIDR:         taxReversal,
		PlatformFeeReversalIDR: platformFeeReversal,
		LedgerJournalID:        journalIDPtr,
		CreatedAt:              now,
		UpdatedAt:              now,
	}

	err = s.refundRepo.CreateRefund(ctx, record)
	if err != nil {
		return nil, fmt.Errorf("failed to create refund record: %w", err)
	}

	// For MVP, we process synchronously immediately
	_ = s.ProcessPendingRefunds(ctx)
	return record, nil
}

func (s *refundService) ProcessPendingRefunds(ctx context.Context) error {
	pending, err := s.refundRepo.GetPendingRefunds(ctx)
	if err != nil {
		return fmt.Errorf("failed to get pending refunds: %w", err)
	}

	for _, r := range pending {
		// Get payment to find the gateway ref to refund if available
		payment, err := s.paymentRepo.GetByOrderID(ctx, r.OrderID.String())
		if err != nil {
			log.Printf("Skipping refund %s, payment not found: %v", r.ID, err)
			continue
		}
		paymentRef := ""
		if payment.ProviderReference != nil {
			paymentRef = *payment.ProviderReference
		}

		ref, gatewayErr := s.gateway.ProcessRefund(ctx, r.OrderID.String(), paymentRef, r.AmountIDR, r.Reason)

		status := domain.RefundStatusProcessed
		var errReason *string
		if gatewayErr != nil {
			status = domain.RefundStatusFailed
			reason := gatewayErr.Error()
			errReason = &reason
			log.Printf("Failed to process refund %s: %v", r.ID, gatewayErr)
		}

		_ = s.refundRepo.UpdateRefundStatus(ctx, r.ID, status, &ref, errReason)
	}

	return nil
}
