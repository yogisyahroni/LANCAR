package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
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
	paymentRepo        domain.PaymentRepository
	orderRepo          domain.OrderRepository
	paymentGateway     domain.PaymentGateway
	configRepo         domain.ConfigRepository
	taxService         domain.TaxService
	pushSvc            domain.PushService
	roadsideCollection domain.RoadsideCollectionService
	refundSvc          domain.RefundService  // AUDIT-FIX: refund late-payment/resurrection
	foodRepo           domain.FoodRepository // AUDIT-FIX: auto-cancel scheduled lewat jadwal
}

// SetRoadsideCollectionService connects the separate adjustment collection lifecycle.
func (s *DefaultPaymentService) SetRoadsideCollectionService(collection domain.RoadsideCollectionService) {
	s.roadsideCollection = collection
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

	// 2. Fund splitting logic. The minor-unit amount and currency are
	// authoritative; *_idr is retained only for legacy provider adapters.
	order.ApplyMoneyContract()
	currency := order.Currency
	amountMinor := order.TotalPriceMinor
	orderMoney, err := domain.NewMoney(currency, amountMinor)
	if err != nil {
		return nil, fmt.Errorf("order money is invalid: %w", err)
	}
	if amountMinor <= 0 {
		return nil, fmt.Errorf("order money amount must be greater than zero")
	}
	// MDR 0.7% for QRIS
	mdrRate := s.configRepo.GetFloatConfig(ctx, "payment_mdr_rate", 0.007)
	mdrMoney, err := orderMoney.MultiplyFloatRate(mdrRate)
	if err != nil {
		return nil, fmt.Errorf("calculate payment MDR: %w", err)
	}
	mdr := int(mdrMoney.AmountMinor)

	// PPN calculated dynamically via the money-aware tax engine where
	// available. Non-IDR payments fail closed if the tax engine is legacy.
	jurisdiction := "ID"
	if s.configRepo != nil {
		jurisdiction = s.configRepo.GetStringConfig(ctx, "tax_jurisdiction", "ID")
	}
	var taxSnapshot domain.TaxSnapshot
	if moneyTax, ok := s.taxService.(domain.MoneyTaxService); ok {
		taxSnapshot, err = moneyTax.CalculatePaymentMDRTaxMoney(ctx, mdrMoney, jurisdiction)
	} else if currency == "IDR" {
		taxSnapshot, err = s.taxService.CalculatePaymentMDRTax(ctx, int64(mdr))
	} else {
		err = fmt.Errorf("non-IDR payment requires a money-aware tax engine")
	}
	if err != nil {
		return nil, fmt.Errorf("calculate payment tax: %w", err)
	}
	ppnMinor := taxSnapshot.PPNMinor
	if currency == "IDR" && ppnMinor == 0 {
		// Legacy TaxService implementations populated only PPNIDR. Keep those
		// adapters correct while the canonical tax contract rolls out.
		ppnMinor = taxSnapshot.PPNIDR
	}
	ppnMoney, err := domain.NewMoney(currency, ppnMinor)
	if err != nil {
		return nil, fmt.Errorf("tax snapshot currency is invalid: %w", err)
	}
	weatherReserve := 0
	insuranceReserve := 0
	if currency == "IDR" {
		weatherReserve = s.configRepo.GetIntConfig(ctx, "weather_reserve_idr", 0)
		insuranceReserve = s.configRepo.GetIntConfig(ctx, "insurance_fee_idr", 0)
	}

	// netOp adalah amount yang masuk ke operasional setelah dikurangi biaya gateway (MDR + PPN).
	// Komponen reserve dipisahkan pencatatannya agar net_operational riil
	netMoney, err := orderMoney.Sub(mdrMoney)
	if err == nil {
		netMoney, err = netMoney.Sub(ppnMoney)
	}
	if err != nil {
		return nil, fmt.Errorf("calculate operational amount: %w", err)
	}
	if netMoney.AmountMinor < 0 {
		return nil, fmt.Errorf("operational amount cannot be negative")
	}
	netOp := int(netMoney.AmountMinor) - weatherReserve - insuranceReserve
	if netOp < 0 {
		return nil, fmt.Errorf("operational amount cannot be negative after reserves")
	}

	paymentNumber := generatePaymentNumber()
	legacyAmount := func(amount int64) int {
		if currency == "IDR" {
			return int(amount)
		}
		return 0
	}

	// 3. Request Gateway QRIS
	gwReq := domain.PaymentGatewayRequest{
		OrderID:           order.ID,
		PaymentNumber:     paymentNumber,
		AmountIDR:         legacyAmount(orderMoney.AmountMinor),
		AmountMinor:       orderMoney.AmountMinor,
		Currency:          orderMoney.Currency,
		CurrencyMinorUnit: orderMoney.MinorUnit,
	}
	gwResp, err := s.paymentGateway.GenerateQRIS(ctx, gwReq)
	if err != nil {
		return nil, fmt.Errorf("failed to generate QRIS: %w", err)
	}

	// 4. Save to DB
	p := &domain.Payment{
		ID:                    uuid.NewString(),
		OrderID:               order.ID,
		PaymentNumber:         paymentNumber,
		Provider:              domain.ProviderMidtrans,
		Method:                "qris",
		Status:                domain.PaymentStatusPending,
		Currency:              currency,
		CurrencyMinorUnit:     orderMoney.MinorUnit,
		AmountMinor:           orderMoney.AmountMinor,
		MDRAmountMinor:        mdrMoney.AmountMinor,
		PPNAmountMinor:        ppnMoney.AmountMinor,
		WeatherReserveMinor:   int64(weatherReserve),
		InsuranceReserveMinor: int64(insuranceReserve),
		NetOperationalMinor:   int64(netOp),
		AmountIDR:             legacyAmount(orderMoney.AmountMinor),
		MDRAmountIDR:          legacyAmount(mdrMoney.AmountMinor),
		PPNAmountIDR:          legacyAmount(ppnMoney.AmountMinor),
		WeatherReserveIDR:     legacyAmount(int64(weatherReserve)),
		InsuranceReserveIDR:   legacyAmount(int64(insuranceReserve)),
		NetOperationalIDR:     legacyAmount(int64(netOp)),
		TaxRuleCode:           &taxSnapshot.TaxRuleCode,
		TaxRuleVersion:        &taxSnapshot.TaxRuleVersion,
		TaxJurisdiction:       &taxSnapshot.TaxJurisdiction,
		PPNRateEffectivePct:   taxSnapshot.PPNRateEffectivePct,
		PPNRateStatutoryPct:   taxSnapshot.PPNRateStatutoryPct,
		DPPIDR:                int(taxSnapshot.DPPIDR),
		TaxInvoiceRequired:    taxSnapshot.TaxInvoiceRequired,
		TaxInvoiceStatus:      &taxSnapshot.TaxInvoiceStatus,
		ProviderReference:     &gwResp.ProviderReference,
		QRCodeURL:             &gwResp.QRCodeURL,
		QRCodeString:          &gwResp.QRCodeString,
		ExpiresAt:             time.Now().Add(15 * time.Minute),
		CreatedAt:             time.Now(),
		UpdatedAt:             time.Now(),
	}

	if err := s.paymentRepo.Create(ctx, p); err != nil {
		return nil, fmt.Errorf("failed to save payment: %w", err)
	}

	slog.InfoContext(ctx, "Payment created", "payment_id", p.ID, "order_id", p.OrderID)
	return p, nil
}

func (s *DefaultPaymentService) HandleWebhook(ctx context.Context, payload []byte, signature string) error {
	if err := s.paymentGateway.VerifyWebhookSignature(ctx, payload, signature); err != nil {
		return fmt.Errorf("invalid provider signature: %w", err)
	}
	notice, err := parsePaymentNotice(payload)
	if err != nil {
		return err
	}
	payment, err := s.paymentRepo.GetByPaymentNumber(ctx, notice.PaymentNumber)
	if err != nil {
		return fmt.Errorf("resolve provider payment number: %w", err)
	}
	if payment == nil || payment.PaymentNumber != notice.PaymentNumber ||
		(payment.Currency != "" && payment.Currency != notice.Currency) ||
		((payment.AmountMinor != 0 && payment.AmountMinor != notice.AmountMinor) || (payment.AmountMinor == 0 && int64(payment.AmountIDR) != notice.AmountIDR)) ||
		(payment.ProviderReference != nil && *payment.ProviderReference != notice.ProviderReference) {
		return fmt.Errorf("provider payment identity or amount mismatch")
	}
	// The gateway uses payment_number, never the internal order UUID, as order_id.
	orderID := payment.OrderID
	if payment.Purpose == "service_adjustment" {
		if s.roadsideCollection == nil {
			return fmt.Errorf("roadside collection handler unavailable")
		}
		if notice.Status == domain.PaymentStatusPending {
			return nil
		}
		return s.roadsideCollection.ApplyVerifiedWebhook(ctx, notice.PaymentNumber, notice.Status, notice.AmountIDR, notice.ProviderReference, payload)
	}
	if payment.Purpose != "" && payment.Purpose != "order" {
		return fmt.Errorf("unsupported payment purpose")
	}
	auditRepo, hasAuditRepo := s.paymentRepo.(webhookAuditRepository)
	var auditEventID string
	if hasAuditRepo {
		eventID := "midtrans:" + notice.ProviderReference + ":" + notice.TransactionStatus
		id, duplicate, auditErr := auditRepo.InsertWebhookAuditEvent(ctx, "midtrans", eventID, notice.ProviderReference, notice.TransactionStatus, payload, signature, "valid", "received", nil)
		if auditErr != nil {
			return fmt.Errorf("audit provider notice: %w", auditErr)
		}
		if !duplicate {
			auditEventID = id
		}
	}
	fail := func(code string, err error) error {
		if hasAuditRepo {
			_ = auditRepo.UpdateWebhookAuditEvent(ctx, auditEventID, "failed", stringPtr(code))
		}
		return err
	}
	if notice.Status == domain.PaymentStatusPending {
		if hasAuditRepo {
			_ = auditRepo.UpdateWebhookAuditEvent(ctx, auditEventID, "ignored", stringPtr("payment_pending"))
		}
		return nil
	}
	writer, ok := s.paymentRepo.(interface {
		ApplyVerifiedPayment(context.Context, domain.VerifiedPaymentUpdate) (*domain.Payment, error)
	})
	if !ok {
		return fail("verified_writer_unavailable", fmt.Errorf("verified payment writer unavailable"))
	}
	previousStatus := payment.Status
	payment, err = writer.ApplyVerifiedPayment(ctx, domain.VerifiedPaymentUpdate{PaymentID: payment.ID, PaymentNumber: notice.PaymentNumber, ProviderReference: notice.ProviderReference, AmountIDR: notice.AmountIDR, AmountMinor: notice.AmountMinor, Currency: notice.Currency, Status: notice.Status, Payload: payload})
	if err != nil {
		return fail("payment_update_failed", err)
	}
	newStatus := payment.Status
	if newStatus == domain.PaymentStatusPaid && previousStatus == domain.PaymentStatusPaid {
		// A previous attempt may have committed payment but failed to advance
		// the order. Re-run the idempotent order orchestration below.
	}
	if newStatus != domain.PaymentStatusPaid {
		if hasAuditRepo {
			_ = auditRepo.UpdateWebhookAuditEvent(ctx, auditEventID, "processed", nil)
		}
		return nil
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

		if order.Status != domain.StatusPendingPayment {
			// A verified duplicate must not reset an accepted/in-progress/delivered order.
			if hasAuditRepo {
				_ = auditRepo.UpdateWebhookAuditEvent(ctx, auditEventID, "processed", nil)
			}
			return nil
		}

		// M4-AUDIT-FIX: re-validasi scheduled_at saat settlement — kalau customer
		// membayar SETELAH jadwal lewat, order terjadwal dibatalkan + refund 100%
		// (tidak bisa ditahan lalu diaktivasi dengan waktu lampau).
		if order.ServiceSubType == "food_delivery" && order.IsScheduled && order.ScheduledAt != nil && order.ScheduledAt.Before(time.Now()) {
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
