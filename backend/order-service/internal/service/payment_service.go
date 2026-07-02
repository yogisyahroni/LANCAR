package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
)

type webhookAuditRepository interface {
	InsertWebhookAuditEvent(
		ctx context.Context,
		providerName string,
		providerEventID string,
		providerReference string,
		eventType string,
		payload []byte,
		signature string,
		verificationStatus string,
		processingStatus string,
		errorCode *string,
	) (string, bool, error)
	UpdateWebhookAuditEvent(ctx context.Context, id string, processingStatus string, errorCode *string) error
}

func paymentWebhookSha256Hex(value []byte) string {
	sum := sha256.Sum256(value)
	return hex.EncodeToString(sum[:])
}

func stringPtr(value string) *string {
	return &value
}

func webhookEventID(data map[string]interface{}, payload []byte) string {
	transactionID, _ := data["transaction_id"].(string)
	orderID, _ := data["order_id"].(string)
	status, _ := data["transaction_status"].(string)
	statusCode, _ := data["status_code"].(string)
	if transactionID != "" {
		return "midtrans:" + transactionID + ":" + status + ":" + statusCode
	}
	if orderID != "" {
		return "midtrans:" + orderID + ":" + status + ":" + statusCode
	}
	return "midtrans:payload:" + paymentWebhookSha256Hex(payload)
}

type DefaultPaymentService struct {
	paymentRepo    domain.PaymentRepository
	orderRepo      domain.OrderRepository
	paymentGateway domain.PaymentGateway
	configRepo     domain.ConfigRepository
}

func NewPaymentService(pr domain.PaymentRepository, or domain.OrderRepository, pg domain.PaymentGateway, cr domain.ConfigRepository) *DefaultPaymentService {
	return &DefaultPaymentService{
		paymentRepo:    pr,
		orderRepo:      or,
		paymentGateway: pg,
		configRepo:     cr,
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
	mdrRate := s.configRepo.GetFloatConfig(ctx, "payment_mdr_rate", 0.007)
	mdr := int(float64(amount) * mdrRate)
	// PPN 11% of MDR (assuming tax is only on the service fee/MDR)
	ppnRate := s.configRepo.GetFloatConfig(ctx, "payment_ppn_rate", 0.11)
	ppn := int(float64(mdr) * ppnRate)

	// netOp adalah amount yang masuk ke operasional setelah dikurangi biaya gateway (MDR + PPN).
	// Catatan: weatherReserve dan insuranceReserve sengaja tidak dimasukkan ke sini
	// karena komponen tersebut tercermin dalam TotalPriceIDR yang sudah dihitung oleh pricing_service.
	netOp := amount - mdr - ppn

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
		WeatherReserveIDR:   0,
		InsuranceReserveIDR: 0,
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
	var data map[string]interface{}
	if err := json.Unmarshal(payload, &data); err != nil {
		return fmt.Errorf("failed to parse payload: %w", err)
	}
	eventID := webhookEventID(data, payload)
	orderID, _ := data["order_id"].(string)
	transactionStatus, _ := data["transaction_status"].(string)
	auditRepo, hasAuditRepo := s.paymentRepo.(webhookAuditRepository)

	// 1. Verify Signature
	if err := s.paymentGateway.VerifyWebhookSignature(ctx, payload, signature); err != nil {
		if hasAuditRepo {
			code := "invalid_signature"
			if signature == "" {
				code = "missing_signature"
			}
			_, _, auditErr := auditRepo.InsertWebhookAuditEvent(
				ctx,
				"midtrans",
				eventID,
				orderID,
				transactionStatus,
				payload,
				signature,
				map[bool]string{true: "missing_signature", false: "invalid"}[signature == ""],
				"failed",
				&code,
			)
			if auditErr != nil {
				slog.WarnContext(ctx, "Failed to audit invalid webhook", "error", auditErr)
			}
		}
		slog.WarnContext(ctx, "Invalid webhook signature", "error", err)
		return fmt.Errorf("invalid signature: %w", err)
	}

	var auditEventID string
	if hasAuditRepo {
		insertedID, duplicate, err := auditRepo.InsertWebhookAuditEvent(
			ctx,
			"midtrans",
			eventID,
			orderID,
			transactionStatus,
			payload,
			signature,
			"valid",
			"received",
			nil,
		)
		if err != nil {
			return fmt.Errorf("failed to audit webhook: %w", err)
		}
		if duplicate {
			slog.InfoContext(ctx, "Duplicate payment webhook ignored", "event_id", eventID)
			return nil
		}
		auditEventID = insertedID
	}

	if orderID == "" {
		if hasAuditRepo {
			_ = auditRepo.UpdateWebhookAuditEvent(ctx, auditEventID, "failed", stringPtr("missing_order_id"))
		}
		return fmt.Errorf("missing order_id in webhook")
	}

	if transactionStatus == "" {
		if hasAuditRepo {
			_ = auditRepo.UpdateWebhookAuditEvent(ctx, auditEventID, "failed", stringPtr("missing_transaction_status"))
		}
		return fmt.Errorf("missing transaction_status in webhook")
	}

	// 3. Get Payment
	payment, err := s.paymentRepo.GetByOrderID(ctx, orderID)
	if err != nil {
		if hasAuditRepo {
			_ = auditRepo.UpdateWebhookAuditEvent(ctx, auditEventID, "failed", stringPtr("payment_lookup_failed"))
		}
		return fmt.Errorf("failed to get payment for order %s: %w", orderID, err)
	}

	// Idempotency check
	if payment.Status == domain.PaymentStatusPaid {
		slog.InfoContext(ctx, "Payment already paid, ignoring webhook", "payment_id", payment.ID)
		if hasAuditRepo {
			_ = auditRepo.UpdateWebhookAuditEvent(ctx, auditEventID, "ignored", stringPtr("payment_already_paid"))
		}
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
		if hasAuditRepo {
			_ = auditRepo.UpdateWebhookAuditEvent(ctx, auditEventID, "ignored", stringPtr("payment_pending"))
		}
		return nil
	default:
		slog.WarnContext(ctx, "Unknown transaction status", "status", transactionStatus)
		if hasAuditRepo {
			_ = auditRepo.UpdateWebhookAuditEvent(ctx, auditEventID, "ignored", stringPtr("unknown_transaction_status"))
		}
		return nil
	}

	// 5. Update DB
	err = s.paymentRepo.UpdateStatus(ctx, payment.ID, newStatus, paidAt, nil, payload)
	if err != nil {
		if hasAuditRepo {
			_ = auditRepo.UpdateWebhookAuditEvent(ctx, auditEventID, "failed", stringPtr("payment_update_failed"))
		}
		return fmt.Errorf("failed to update payment status: %w", err)
	}

	// 6. If Paid, Update Order Status
	if newStatus == domain.PaymentStatusPaid {
		if err := s.orderRepo.UpdateStatus(ctx, orderID, domain.StatusPendingAssignment); err != nil {
			slog.ErrorContext(ctx, "Failed to update order status to pending_assignment", "order_id", orderID, "error", err)
			if hasAuditRepo {
				_ = auditRepo.UpdateWebhookAuditEvent(ctx, auditEventID, "failed", stringPtr("order_update_failed"))
			}
			return fmt.Errorf("failed to update order status: %w", err)
		}
		slog.InfoContext(ctx, "Payment successful, order status updated", "order_id", orderID)

		// Note: Here we would trigger fund splitting or dispatch workers.
		// For Sprint 4, dispatching is done by a scheduler checking pending_assignment,
		// and payout aggregation will be done by Payout system (PAY-002).
	}

	if hasAuditRepo {
		_ = auditRepo.UpdateWebhookAuditEvent(ctx, auditEventID, "processed", nil)
	}
	return nil
}

func (s *DefaultPaymentService) GetPaymentStatus(ctx context.Context, orderID string) (*domain.Payment, error) {
	return s.paymentRepo.GetByOrderID(ctx, orderID)
}
