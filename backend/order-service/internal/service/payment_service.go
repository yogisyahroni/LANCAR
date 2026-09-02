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
	taxService     domain.TaxService
	pushSvc        domain.PushService
	refundSvc      domain.RefundService  // AUDIT-FIX: refund late-payment/resurrection
	foodRepo       domain.FoodRepository // AUDIT-FIX: auto-cancel scheduled lewat jadwal
}

// SetPushService inject push service (FOOD-BIKE-064): notifikasi FCM ke
// merchant saat order food paid → pending_merchant.
func (s *DefaultPaymentService) SetPushService(ps domain.PushService) {
	s.pushSvc = ps
}

// SetRefundService inject refund service (AUDIT-FIX C2/M4): refund otomatis
// untuk pembayaran yang datang setelah order dibatalkan / jadwal lewat.
func (s *DefaultPaymentService) SetRefundService(rs domain.RefundService) {
	s.refundSvc = rs
}

// SetFoodRepository inject food repository (AUDIT-FIX M4): auto-cancel order
// terjadwal yang dibayar setelah scheduled_at lewat.
func (s *DefaultPaymentService) SetFoodRepository(fr domain.FoodRepository) {
	s.foodRepo = fr
}

func NewPaymentService(pr domain.PaymentRepository, or domain.OrderRepository, pg domain.PaymentGateway, cr domain.ConfigRepository, ts domain.TaxService) *DefaultPaymentService {
	return &DefaultPaymentService{
		paymentRepo:    pr,
		orderRepo:      or,
		paymentGateway: pg,
		configRepo:     cr,
		taxService:     ts,
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

	// PPN calculated dynamically via tax engine
	taxSnapshot, _ := s.taxService.CalculatePaymentMDRTax(ctx, int64(mdr))
	ppn := int(taxSnapshot.PPNIDR)

	weatherReserve := s.configRepo.GetIntConfig(ctx, "weather_reserve_idr", 0)
	insuranceReserve := s.configRepo.GetIntConfig(ctx, "insurance_fee_idr", 0)

	// netOp adalah amount yang masuk ke operasional setelah dikurangi biaya gateway (MDR + PPN).
	// Komponen reserve dipisahkan pencatatannya agar net_operational riil
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
		TaxRuleCode:         &taxSnapshot.TaxRuleCode,
		PPNRateEffectivePct: taxSnapshot.PPNRateEffectivePct,
		PPNRateStatutoryPct: taxSnapshot.PPNRateStatutoryPct,
		DPPIDR:              int(taxSnapshot.DPPIDR),
		TaxInvoiceRequired:  taxSnapshot.TaxInvoiceRequired,
		TaxInvoiceStatus:    &taxSnapshot.TaxInvoiceStatus,
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

	if err := domain.ValidatePaymentTransition(payment.Status, newStatus); err != nil {
		if hasAuditRepo {
			_ = auditRepo.UpdateWebhookAuditEvent(ctx, auditEventID, "ignored", stringPtr("invalid_payment_transition"))
		}
		return fmt.Errorf("invalid payment transition for %s: %w", payment.ID, err)
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
		// FOOD-BIKE-021: order food → pending_merchant (merchant wajib respon dulu),
		// order reguler → pending_assignment (matching driver langsung).
		// FB-123: order food TERJADWAL → 'scheduled' (ditahan, belum masuk radar
		// merchant sama sekali; diaktivasi scheduled_order_worker mendekati
		// scheduled_at). Merchant TIDAK di-notify di titik ini.
		order, err := s.orderRepo.GetByID(ctx, orderID)
		if err != nil {
			slog.ErrorContext(ctx, "Failed to load order for payment settlement", "order_id", orderID, "error", err)
			if hasAuditRepo {
				_ = auditRepo.UpdateWebhookAuditEvent(ctx, auditEventID, "failed", stringPtr("order_load_failed"))
			}
			return fmt.Errorf("failed to load order: %w", err)
		}

		// C2-AUDIT-FIX: jangan bangkitkan order yang sudah dibatalkan
		// (resurrection). Kalau customer cancel dulu (status cancelled) lalu
		// payment webhook datang terlambat, order TIDAK boleh kembali aktif —
		// dana yang telanjur masuk akan di-refund via jalur cancel.
		if order.Status == domain.StatusCancelled {
			slog.WarnContext(ctx, "Payment settlement for cancelled order — tidak membangkitkan order", "order_id", orderID)
			if s.refundSvc != nil {
				oid, _ := uuid.Parse(orderID)
				if _, rerr := s.refundSvc.CalculateAndTriggerRefund(ctx, oid,
					"Pembayaran diterima setelah order dibatalkan — dana dikembalikan",
					domain.RefundOptions{OriginalStatus: domain.StatusCancelled}); rerr != nil {
					slog.WarnContext(ctx, "refund for late payment after cancel failed", "order_id", orderID, "error", rerr)
				}
			}
			return nil
		}

		// M4-AUDIT-FIX: re-validasi scheduled_at saat settlement — kalau customer
		// membayar SETELAH jadwal lewat, order terjadwal dibatalkan + refund 100%
		// (tidak bisa ditahan lalu diaktivasi dengan waktu lampau).
		if order.IsScheduled && order.ScheduledAt != nil && order.ScheduledAt.Before(time.Now()) {
			slog.WarnContext(ctx, "Scheduled order paid after scheduled_at — auto-cancel + refund", "order_id", orderID)
			if err := s.foodRepo.CancelScheduledFoodOrder(ctx, orderID, "scheduled_at_sudah_lewat_saat_pembayaran"); err != nil {
				slog.WarnContext(ctx, "auto-cancel late scheduled order failed", "order_id", orderID, "error", err)
			}
			if s.refundSvc != nil {
				oid, _ := uuid.Parse(orderID)
				if _, rerr := s.refundSvc.CalculateAndTriggerRefund(ctx, oid,
					"Jadwal pesanan sudah lewat saat pembayaran — dana dikembalikan penuh",
					domain.RefundOptions{OriginalStatus: domain.StatusScheduled}); rerr != nil {
					slog.WarnContext(ctx, "refund for late scheduled order failed", "order_id", orderID, "error", rerr)
				}
			}
			if s.pushSvc != nil {
				_ = s.pushSvc.NotifyCustomerOrderCancelled(ctx, orderID,
					"Jadwal pesanan sudah lewat saat pembayaran — dana dikembalikan penuh")
			}
			return nil
		}

		newOrderStatus := domain.StatusPendingAssignment
		if order != nil && order.ServiceSubType == "food_delivery" {
			if order.IsScheduled {
				newOrderStatus = domain.StatusScheduled
			} else {
				newOrderStatus = domain.StatusPendingMerchant
			}
		}
		if err := s.orderRepo.UpdateStatus(ctx, orderID, newOrderStatus); err != nil {
			slog.ErrorContext(ctx, "Failed to update order status", "order_id", orderID, "error", err)
			if hasAuditRepo {
				_ = auditRepo.UpdateWebhookAuditEvent(ctx, auditEventID, "failed", stringPtr("order_update_failed"))
			}
			return fmt.Errorf("failed to update order status: %w", err)
		}
		slog.InfoContext(ctx, "Payment successful, order status updated", "order_id", orderID, "new_status", newOrderStatus)

		// FOOD-BIKE-064: order food → pending_merchant, kirim FCM ke owner
		// merchant (SLA respon 3 menit). Non-fatal: gagal push tidak
		// menggagalkan webhook payment.
		if newOrderStatus == domain.StatusPendingMerchant && s.pushSvc != nil {
			if err := s.pushSvc.NotifyMerchantNewOrder(ctx, orderID); err != nil {
				slog.WarnContext(ctx, "push merchant new order failed", "order_id", orderID, "error", err)
			}
		}

		// FB-123: order terjadwal → konfirmasi ke customer (type
		// "order_scheduled" + scheduled_at). Fire-and-forget, non-fatal.
		if newOrderStatus == domain.StatusScheduled && s.pushSvc != nil && order != nil {
			var when string
			if order.ScheduledAt != nil {
				when = order.ScheduledAt.Format("15:04")
			}
			msg := "Pesanan kamu dijadwalkan"
			if when != "" {
				msg += " untuk " + when
			}
			if err := s.pushSvc.NotifyCustomerOrderScheduled(ctx, orderID, msg); err != nil {
				slog.WarnContext(ctx, "push customer order scheduled failed", "order_id", orderID, "error", err)
			}
		}

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
