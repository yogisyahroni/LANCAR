package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"lancar/order-service/internal/domain"
)

type DefaultPaymentService struct {
	paymentRepo    domain.PaymentRepository
	orderRepo      domain.OrderRepository
	paymentGateway domain.PaymentGateway
}

func NewPaymentService(pr domain.PaymentRepository, or domain.OrderRepository, pg domain.PaymentGateway) *DefaultPaymentService {
	return &DefaultPaymentService{
		paymentRepo:    pr,
		orderRepo:      or,
		paymentGateway: pg,
	}
}

func generatePaymentNumber() string {
	b := errGuardBytes(4)
	return fmt.Sprintf("PAY-%s", hex.EncodeToString(b))
}

func errGuardBytes(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b
}

func (s *DefaultPaymentService) CreatePayment(ctx context.Context, orderID string) (*domain.Payment, error) {
	// 1. Get Order
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return nil, fmt.Errorf("failed to get order: %w", err)
	}

	if order.Status != domain.StatusPendingPayment {
		return nil, fmt.Errorf("order is not in pending_payment status: %s", order.Status)
	}

	// 2. Fund splitting logic
	amount := int(order.TotalPriceIDR)
	// MDR 0.7% for QRIS
	mdr := int(float64(amount) * 0.007)
	// PPN 11% of MDR (assuming tax is only on the service fee/MDR)
	ppn := int(float64(mdr) * 0.11)
	
	// Weather and insurance reserve placeholders
	weatherReserve := 0
	insuranceReserve := 0

	netOp := amount - mdr - ppn - weatherReserve - insuranceReserve

	paymentNumber := generatePaymentNumber()

	// 3. Request Gateway QRIS
	gwReq := domain.PaymentGatewayRequest{
		OrderID:       order.ID,
		PaymentNumber: paymentNumber,
		AmountIDR:     amount,
	}
	gwResp, err := s.paymentGateway.GenerateQRIS(ctx, gwReq)
	if err != nil {
		return nil, fmt.Errorf("failed to generate QRIS: %w", err)
	}

	// 4. Save to DB
	p := &domain.Payment{
		ID:                  uuid.NewString(),
		OrderID:             order.ID,
		PaymentNumber:       paymentNumber,
		Provider:            domain.ProviderMidtrans,
		Method:              "qris",
		Status:              domain.PaymentStatusPending,
		AmountIDR:           amount,
		MDRAmountIDR:        mdr,
		PPNAmountIDR:        ppn,
		WeatherReserveIDR:   weatherReserve,
		InsuranceReserveIDR: insuranceReserve,
		NetOperationalIDR:   netOp,
		ProviderReference:   &gwResp.ProviderReference,
		QRCodeURL:           &gwResp.QRCodeURL,
		QRCodeString:        &gwResp.QRCodeString,
		ExpiresAt:           time.Now().Add(15 * time.Minute),
		CreatedAt:           time.Now(),
		UpdatedAt:           time.Now(),
	}

	if err := s.paymentRepo.Create(ctx, p); err != nil {
		return nil, fmt.Errorf("failed to save payment: %w", err)
	}

	slog.InfoContext(ctx, "Payment created", "payment_id", p.ID, "order_id", p.OrderID)
	return p, nil
}

func (s *DefaultPaymentService) HandleWebhook(ctx context.Context, payload []byte, signature string) error {
	// 1. Verify Signature
	if err := s.paymentGateway.VerifyWebhookSignature(ctx, payload, signature); err != nil {
		slog.WarnContext(ctx, "Invalid webhook signature", "error", err)
		return fmt.Errorf("invalid signature: %w", err)
	}

	// 2. Parse Payload
	var data map[string]interface{}
	if err := json.Unmarshal(payload, &data); err != nil {
		return fmt.Errorf("failed to parse payload: %w", err)
	}

	orderID, ok := data["order_id"].(string)
	if !ok {
		return fmt.Errorf("missing order_id in webhook")
	}

	transactionStatus, ok := data["transaction_status"].(string)
	if !ok {
		return fmt.Errorf("missing transaction_status in webhook")
	}

	// 3. Get Payment
	payment, err := s.paymentRepo.GetByOrderID(ctx, orderID)
	if err != nil {
		return fmt.Errorf("failed to get payment for order %s: %w", orderID, err)
	}

	// Idempotency check
	if payment.Status == domain.PaymentStatusPaid {
		slog.InfoContext(ctx, "Payment already paid, ignoring webhook", "payment_id", payment.ID)
		return nil // Already processed
	}

	// 4. Handle Status
	var newStatus domain.PaymentStatus
	var paidAt *time.Time
	switch transactionStatus {
	case "settlement", "capture":
		newStatus = domain.PaymentStatusPaid
		now := time.Now()
		paidAt = &now
	case "deny", "cancel", "expire":
		newStatus = domain.PaymentStatusFailed
		if transactionStatus == "expire" {
			newStatus = domain.PaymentStatusExpired
		}
	case "pending":
		// still pending
		return nil
	default:
		slog.WarnContext(ctx, "Unknown transaction status", "status", transactionStatus)
		return nil
	}

	// 5. Update DB
	err = s.paymentRepo.UpdateStatus(ctx, payment.ID, newStatus, paidAt, nil, payload)
	if err != nil {
		return fmt.Errorf("failed to update payment status: %w", err)
	}

	// 6. If Paid, Update Order Status
	if newStatus == domain.PaymentStatusPaid {
		if err := s.orderRepo.UpdateStatus(ctx, orderID, domain.StatusPendingAssignment); err != nil {
			slog.ErrorContext(ctx, "Failed to update order status to pending_assignment", "order_id", orderID, "error", err)
			return fmt.Errorf("failed to update order status: %w", err)
		}
		slog.InfoContext(ctx, "Payment successful, order status updated", "order_id", orderID)
		
		// Note: Here we would trigger fund splitting or dispatch workers.
		// For Sprint 4, dispatching is done by a scheduler checking pending_assignment,
		// and payout aggregation will be done by Payout system (PAY-002).
	}

	return nil
}

func (s *DefaultPaymentService) GetPaymentStatus(ctx context.Context, orderID string) (*domain.Payment, error) {
	return s.paymentRepo.GetByOrderID(ctx, orderID)
}
