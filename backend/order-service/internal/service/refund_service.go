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
	foodRepo    domain.FoodRepository // FB-080: snapshot food_order_items utk partial refund
	cancelFeeRepo domain.MerchantCancellationFeeRepository // FB-082: piutang fee merchant
}

func NewRefundService(
	refundRepo domain.RefundRepository,
	orderRepo domain.OrderRepository,
	paymentRepo domain.PaymentRepository,
	gateway domain.RefundGateway,
	redisRepo domain.RedisRepository,
	ledgerRepo domain.FinanceLedgerRepository,
	foodRepo domain.FoodRepository,
	cancelFeeRepo domain.MerchantCancellationFeeRepository,
) domain.RefundService {
	return &refundService{
		refundRepo:    refundRepo,
		orderRepo:     orderRepo,
		paymentRepo:   paymentRepo,
		gateway:       gateway,
		redisRepo:     redisRepo,
		ledgerRepo:    ledgerRepo,
		foodRepo:      foodRepo,
		cancelFeeRepo: cancelFeeRepo,
	}
}

func (s *refundService) CalculateAndTriggerRefund(ctx context.Context, orderID uuid.UUID, cancelReason string, opts domain.RefundOptions) (*domain.RefundRecord, error) {
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

	// Status asal: prefer dari opts (cancel flow), fallback ke status DB
	// kalau bukan cancelled (manual admin trigger).
	statusAtCancel := opts.OriginalStatus
	if statusAtCancel == "" || statusAtCancel == domain.StatusCancelled {
		statusAtCancel = order.Status
	}
	isFood := order.ServiceSubType == "food_delivery" || order.MerchantID != nil
	courierAssigned := order.CourierID != nil && *order.CourierID != ""

	// Kebijakan refund per status (FB-079):
	// - FOOD free: pending_payment / pending_merchant / preparing / ready_for_pickup
	//   / pending / pending_assignment / no_courier_found / searching tanpa driver → 100%
	// - FOOD kena biaya layanan (platform fee ditahan sbg cancellation fee):
	//   searching+dengan driver / accepted / picking_up → refund = total − platform_fee
	// - FOOD picked_up ke atas: 0% (harusnya ditolak di handler → dispute)
	// - PARCEL: existing policy (100% / 80% / 0%)
	refundRatio := 0.0
	withholdServiceFee := false
	if isFood {
		switch statusAtCancel {
		case domain.StatusPendingPayment, domain.StatusPendingMerchant, domain.StatusPreparing,
			domain.StatusReadyForPickup, domain.StatusPending, domain.StatusPendingAssignment,
			domain.StatusNoCourierFound:
			refundRatio = 1.0
		case domain.StatusSearching:
			refundRatio = 1.0
			withholdServiceFee = courierAssigned
		case domain.StatusAccepted, domain.StatusPickingUp:
			refundRatio = 1.0
			withholdServiceFee = true
		default:
			// picked_up ke atas → 0%
			refundRatio = 0.0
		}
	} else {
		switch statusAtCancel {
		case domain.StatusPendingPayment, domain.StatusPending, domain.StatusPendingAssignment, domain.StatusSearching, domain.StatusNoCourierFound, domain.StatusCancelled:
			refundRatio = 1.0
		case domain.StatusAccepted, domain.StatusPickingUp:
			refundRatio = 0.8
		default:
			// Picked up or later -> 0% refund
			refundRatio = 0.0
		}
	}

	if refundRatio == 0.0 {
		log.Printf("No refund applicable for order %s at status %s", orderID, statusAtCancel)
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
	platformFeeReversal := int64(float64(order.PlatformFeeIDR) * refundRatio)
	if withholdServiceFee {
		// FB-079: biaya layanan (platform fee) ditahan sebagai cancellation fee,
		// sisanya (makanan + ongkir) direfund ke customer.
		refundAmount -= int(order.PlatformFeeIDR)
		platformFeeReversal = 0
	}
	if opts.ChargeCancellationFeeTo == "merchant" {
		// FB-082: kesalahan merchant (reject/timeout) — customer refund 100%,
		// fee TIDAK direversal (platform tidak rugi): menjadi piutang merchant
		// yang dipotong dari settlement berikutnya.
		refundAmount = int(payment.AmountIDR)
		platformFeeReversal = 0
	}
	if refundAmount <= 0 {
		return nil, nil
	}

	// Ratio aktual dihitung ulang agar RefundPercentage / TaxReversal konsisten
	// dengan jumlah yang benar-benar direfund (fee case ≠ ratio 100%).
	actualRatio := float64(refundAmount) / float64(payment.AmountIDR)
	refundPercentage := int(actualRatio*100 + 0.5)
	taxReversal := int64(float64(order.PPNIDR) * actualRatio)

	now := time.Now()
	refundID := uuid.New()

	// FB-082: kesalahan merchant → catat piutang cancellation fee (dipotong
	// dari settlement merchant berikutnya). Idempotent via UNIQUE(order_id).
	if opts.ChargeCancellationFeeTo == "merchant" && s.cancelFeeRepo != nil && order.MerchantID != nil && order.PlatformFeeIDR > 0 {
		fee := &domain.MerchantCancellationFee{
			ID:         uuid.New(),
			MerchantID: *order.MerchantID,
			OrderID:    order.ID,
			AmountIDR:  order.PlatformFeeIDR,
			Reason:     cancelReason,
			Status:     domain.CancellationFeePending,
			CreatedAt:  now,
		}
		if feeErr := s.cancelFeeRepo.Create(ctx, fee); feeErr != nil {
			log.Printf("Warning: gagal catat merchant cancellation fee utk order %s: %v", orderID, feeErr)
		}
	}

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
		if opts.ChargeCancellationFeeTo == "merchant" {
			// Double-entry seimbang: piutang dari merchant (debit) = fee,
			// pendapatan platform (credit) = fee. Balance tetap terjaga.
			entries = append(entries,
				domain.LedgerEntry{ID: uuid.New(), AccountName: "merchant_cancellation_fee_receivable", DebitIDR: order.PlatformFeeIDR, CreditIDR: 0, CreatedAt: now},
				domain.LedgerEntry{ID: uuid.New(), AccountName: "platform_fee_revenue", DebitIDR: 0, CreditIDR: order.PlatformFeeIDR, CreatedAt: now},
			)
		}

		journal := &domain.LedgerJournal{
			ID:             uuid.New(),
			JournalType:    "order_refund",
			ReferenceType:  "order",
			ReferenceID:    orderID.String(),
			IdempotencyKey: fmt.Sprintf("REFUND-JRN-%s", refundID.String()),
			Reason:         cancelReason,
			Metadata: map[string]any{
				"refund_id":                  refundID.String(),
				"refund_percentage":          refundPercentage,
				"tax_reversal_idr":           taxReversal,
				"fee_reversal_idr":           platformFeeReversal,
				"charge_cancellation_fee_to": opts.ChargeCancellationFeeTo,
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

// CalculateItemRefund — refund partial per item food (FB-080).
// Refund = Σ(snapshot item_price × qty) dari food_order_items (harga beku
// saat order). Ongkir TIDAK direfund kecuali opts.IncludeDeliveryFee
// (kesalahan driver/platform — sesuai spec: ongkir umumnya tidak direfund).
func (s *refundService) CalculateItemRefund(ctx context.Context, orderID uuid.UUID, items []domain.ItemRefundRequest, opts domain.RefundItemOptions) (*domain.RefundRecord, error) {
	if len(items) == 0 {
		return nil, fmt.Errorf("no items specified for partial refund")
	}

	order, err := s.orderRepo.GetByID(ctx, orderID.String())
	if err != nil {
		return nil, fmt.Errorf("failed to get order: %w", err)
	}

	// Payment harus paid — kalau belum settled tidak ada yang bisa direfund.
	payment, err := s.paymentRepo.GetByOrderID(ctx, orderID.String())
	if err != nil {
		return nil, fmt.Errorf("failed to get payment: %w", err)
	}
	if payment.Status != domain.PaymentStatusPaid {
		log.Printf("Payment for order %s is not paid (%s), no partial refund needed", orderID, payment.Status)
		return nil, nil
	}

	// Ambil snapshot item order (harga beku saat order dibuat).
	if s.foodRepo == nil {
		return nil, fmt.Errorf("food repo not wired — cannot compute item refund")
	}
	snapshot, err := s.foodRepo.GetFoodOrderItems(ctx, orderID.String())
	if err != nil {
		return nil, fmt.Errorf("failed to get food order items: %w", err)
	}
	if len(snapshot) == 0 {
		return nil, fmt.Errorf("order %s has no food_order_items (bukan order food?)", orderID)
	}

	// Hitung refund = Σ(item_price × qty), validasi qty tidak melebihi pesanan.
	byMenuID := make(map[string]*domain.FoodOrderItem, len(snapshot))
	for i := range snapshot {
		it := &snapshot[i]
		byMenuID[it.MenuItemID] = it
	}

	var refundAmount int64
	var detail []map[string]any
	for _, req := range items {
		it, ok := byMenuID[req.MenuItemID]
		if !ok {
			return nil, fmt.Errorf("menu_item_id %s tidak ada di order %s", req.MenuItemID, orderID)
		}
		if req.Quantity > it.Quantity {
			return nil, fmt.Errorf("quantity refund (%d) melebihi quantity pesanan (%d) untuk %s", req.Quantity, it.Quantity, it.ItemName)
		}
		lineAmount := it.ItemPrice * int64(req.Quantity)
		refundAmount += lineAmount
		detail = append(detail, map[string]any{
			"menu_item_id": req.MenuItemID,
			"item_name":    it.ItemName,
			"quantity":     req.Quantity,
			"unit_price":   it.ItemPrice,
			"subtotal":     lineAmount,
			"reason":       req.Reason,
		})
	}

	if opts.IncludeDeliveryFee {
		// Kesalahan driver/platform → ongkir ikut direfund.
		deliveryFee := order.DistanceFeeIDR + order.SurgeFeeIDR
		refundAmount += deliveryFee
	}

	if refundAmount <= 0 {
		return nil, nil
	}

	// Batasi tidak melebihi total pembayaran.
	if refundAmount > int64(payment.AmountIDR) {
		refundAmount = int64(payment.AmountIDR)
	}

	now := time.Now()
	refundID := uuid.New()
	refundPercentage := int(float64(refundAmount)/float64(payment.AmountIDR)*100 + 0.5)

	var journalIDPtr *uuid.UUID
	if s.ledgerRepo != nil {
		entries := []domain.LedgerEntry{
			{ID: uuid.New(), AccountName: "escrow_holding", DebitIDR: refundAmount, CreditIDR: 0, CreatedAt: now},
			{ID: uuid.New(), AccountName: "customer_refund_payable", DebitIDR: 0, CreditIDR: refundAmount, CreatedAt: now},
		}
		journal := &domain.LedgerJournal{
			ID:             uuid.New(),
			JournalType:    "item_refund",
			ReferenceType:  "order",
			ReferenceID:    orderID.String(),
			IdempotencyKey: fmt.Sprintf("REFUND-JRN-%s", refundID.String()),
			Reason:         "Partial item refund",
			Metadata: map[string]any{
				"refund_id":          refundID.String(),
				"refund_percentage":  refundPercentage,
				"items":              detail,
				"include_delivery":   opts.IncludeDeliveryFee,
				"delivery_fee_idr":   order.DistanceFeeIDR + order.SurgeFeeIDR,
				"platform_fee_idr":   order.PlatformFeeIDR,
			},
			CreatedBy: "system",
			ActorRole: "system",
			CreatedAt: now,
		}
		jid, errLedger := s.ledgerRepo.CreateJournalReturningID(ctx, journal, entries)
		if errLedger != nil {
			log.Printf("Warning: failed to record ledger journal for item refund %s: %v", refundID, errLedger)
		} else if jid != uuid.Nil {
			journalIDPtr = &jid
		}
	}

	reason := "Refund item tidak sesuai"
	record := &domain.RefundRecord{
		ID:                     refundID,
		OrderID:                orderID,
		AmountIDR:              int(refundAmount),
		Reason:                 reason,
		Status:                 domain.RefundStatusPending,
		RefundPercentage:       refundPercentage,
		TaxReversalIDR:         0,
		PlatformFeeReversalIDR: 0,
		LedgerJournalID:        journalIDPtr,
		CreatedAt:              now,
		UpdatedAt:              now,
	}

	if err := s.refundRepo.CreateRefund(ctx, record); err != nil {
		return nil, fmt.Errorf("failed to create refund record: %w", err)
	}

	_ = s.ProcessPendingRefunds(ctx)
	return record, nil
}
