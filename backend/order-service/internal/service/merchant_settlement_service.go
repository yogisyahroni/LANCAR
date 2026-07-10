package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
)

// merchantSettlementService mengimplementasikan domain.MerchantSettlementService.
// Ini adalah service inti untuk escrow penyimpanan dan pelepasan dana merchant.
type merchantSettlementService struct {
	repo            domain.MerchantSettlementRepository
	configRepo      domain.ConfigRepository
	notificationSvc domain.NotificationService
	awbClient       domain.AWBClient
	ledgerRepo      domain.FinanceLedgerRepository
	gatewayURL      string
	internalAPIKey  string
	httpClient      *http.Client
}

// NewMerchantSettlementService membuat instance settlement service.
func NewMerchantSettlementService(
	repo domain.MerchantSettlementRepository,
	configRepo domain.ConfigRepository,
	notificationSvc domain.NotificationService,
	awbClient domain.AWBClient,
	ledgerRepo domain.FinanceLedgerRepository,
) domain.MerchantSettlementService {
	gatewayURL := os.Getenv("INTEGRATION_GATEWAY_URL")
	if gatewayURL == "" {
		gatewayURL = "http://integration-gateway:8085"
	}
	return &merchantSettlementService{
		repo:            repo,
		configRepo:      configRepo,
		notificationSvc: notificationSvc,
		awbClient:       awbClient,
		ledgerRepo:      ledgerRepo,
		gatewayURL:      gatewayURL,
		internalAPIKey:  os.Getenv("INTERNAL_API_KEY"),
		httpClient:      &http.Client{Timeout: 15 * time.Second},
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// HandleDeliveryConfirmed dipanggil ketika integration-gateway menerima
// webhook DELIVERED dari 3PL (JNE/J&T/SiCepat) dan memforward ke kita.
// ─────────────────────────────────────────────────────────────────────────────
func (s *merchantSettlementService) HandleDeliveryConfirmed(ctx context.Context, req domain.DeliveryConfirmedRequest) error {
	// 1. Cari order berdasarkan AWB number
	order, err := s.repo.GetOrderByAWB(ctx, req.AWBNumber)
	if err != nil {
		return fmt.Errorf("HandleDeliveryConfirmed: lookup order by AWB %q failed: %w", req.AWBNumber, err)
	}
	if order == nil {
		// AWB tidak ditemukan di sistem — mungkin order On-Demand (bukan 3PL)
		// atau AWB belum diinput. Log dan skip tanpa error.
		slog.WarnContext(ctx, "merchant_settlement: AWB not found in orders table, skipping",
			"awb_number", req.AWBNumber, "provider", req.Provider)
		return nil
	}

	// 2. Cari payment_link yang terkait dengan order ini
	paymentLink, err := s.repo.GetPaymentLinkByOrderID(ctx, order.ID)
	if err != nil {
		return fmt.Errorf("HandleDeliveryConfirmed: lookup payment_link for order %q failed: %w", order.ID, err)
	}
	if paymentLink == nil {
		// Order ini bukan dari payment link (bisa dari order normal/on-demand)
		slog.InfoContext(ctx, "merchant_settlement: order has no associated payment link, skipping",
			"order_id", order.ID)
		// Update delivery_confirmed_at tetap dilakukan
		_ = s.repo.UpdateOrderDeliveryConfirmed(ctx, order.ID, req.ConfirmedAt, req.PodURL)
		return nil
	}

	// 2026 Three-Way Reconciliation Check: Pastikan payment link berstatus PAID dan order tidak batal/refund
	if strings.ToUpper(string(paymentLink.Status)) != "PAID" {
		slog.WarnContext(ctx, "merchant_settlement: payment link is not PAID (possible refund/cancel collision), skipping escrow creation",
			"payment_link_id", paymentLink.ID, "status", paymentLink.Status)
		return nil
	}
	if strings.ToUpper(string(order.Status)) == "CANCELLED" || strings.ToUpper(string(order.Status)) == "REFUNDED" {
		slog.WarnContext(ctx, "merchant_settlement: order is CANCELLED/REFUNDED, blocking escrow settlement creation",
			"order_id", order.ID, "order_status", order.Status)
		return nil
	}

	// 3. Idempotency check: satu payment link hanya boleh satu settlement
	idempotencyKey := fmt.Sprintf("settle-%s", paymentLink.ID)
	existing, err := s.repo.GetByIdempotencyKey(ctx, idempotencyKey)
	if err != nil {
		return fmt.Errorf("HandleDeliveryConfirmed: idempotency check failed: %w", err)
	}
	if existing != nil {
		// Settlement sudah dibuat sebelumnya — webhook duplikat, skip dengan aman
		slog.InfoContext(ctx, "merchant_settlement: idempotent skip, settlement already exists",
			"idempotency_key", idempotencyKey, "settlement_id", existing.ID, "status", existing.Status)
		return nil
	}

	// 4. Hitung holding_release_at
	holdingDays := s.configRepo.GetIntConfig(ctx, "merchant_settlement_holding_days", 1)
	holdingReleaseAt := time.Now().Add(time.Duration(holdingDays) * 24 * time.Hour)

	if paymentLink.MerchantFeeAmount < 0 || paymentLink.ItemPrice < 0 {
		return fmt.Errorf("HandleDeliveryConfirmed: invalid negative amount (fee: %d, price: %d) — potential integer underflow attack blocked", paymentLink.MerchantFeeAmount, paymentLink.ItemPrice)
	}

	netPayoutIDR := paymentLink.ItemPrice - paymentLink.MerchantFeeAmount
	if netPayoutIDR < 0 {
		return fmt.Errorf("HandleDeliveryConfirmed: invalid net payout amount (price: %d, fee: %d) — payout cannot be negative", paymentLink.ItemPrice, paymentLink.MerchantFeeAmount)
	}
	// 6. Buat settlement record (status = HOLDING)
	now := req.ConfirmedAt
	settlementID := uuid.New()
	merchantUUID, err := uuid.Parse(paymentLink.MerchantID)
	if err != nil {
		return fmt.Errorf("HandleDeliveryConfirmed: invalid merchant_id %q: %w", paymentLink.MerchantID, err)
	}
	orderUUID, err := uuid.Parse(order.ID)
	if err != nil {
		// Jika order ID bukan UUID (bisa saja string lain), simpan saja sebagai string
		orderUUID = uuid.Nil
		_ = orderUUID
	}

	settlement := &domain.MerchantSettlement{
		ID:                settlementID,
		PaymentLinkID:     paymentLink.ID,
		MerchantID:        paymentLink.MerchantID,
		OrderID:           order.ID,
		GrossItemPriceIDR: paymentLink.ItemPrice,
		MerchantFeeIDR:    paymentLink.MerchantFeeAmount,
		NetPayoutIDR:      netPayoutIDR,
		Status:            domain.SettlementStatusHolding,
		IdempotencyKey:    idempotencyKey,
		PODConfirmedAt:    &now,
		HoldingReleaseAt:  &holdingReleaseAt,
		RetryCount:        0,
		Metadata: map[string]any{
			"awb_number":    req.AWBNumber,
			"provider":      req.Provider,
			"pod_url":       req.PodURL,
			"holding_days":  holdingDays,
			"merchant_id":   merchantUUID.String(),
		},
	}

	if err := s.repo.Create(ctx, settlement); err != nil {
		return fmt.Errorf("HandleDeliveryConfirmed: failed to create settlement: %w", err)
	}

	if s.ledgerRepo != nil {
		journal := &domain.LedgerJournal{
			ID:            uuid.New(),
			JournalType:   "SETTLEMENT",
			ReferenceType: "MERCHANT_SETTLEMENT_HOLDING",
			ReferenceID:   settlement.ID.String(),
			Reason:        fmt.Sprintf("Merchant Settlement Escrow Holding for AWB %s", req.AWBNumber),
			CreatedBy:     "SYSTEM",
			ActorRole:     "SYSTEM",
			CreatedAt:     now,
		}
		entries := []domain.LedgerEntry{
			{AccountName: "1101 - Cash / Bank", DebitIDR: paymentLink.ItemPrice, CreditIDR: 0},
			{AccountName: "2102 - Merchant Compensation Payable", DebitIDR: 0, CreditIDR: netPayoutIDR},
			{AccountName: "4101 - Shipping Revenue", DebitIDR: 0, CreditIDR: paymentLink.MerchantFeeAmount},
		}
		if _, err := s.ledgerRepo.CreateJournalReturningID(ctx, journal, entries); err != nil {
			slog.WarnContext(ctx, "merchant_settlement: failed to post ledger journal for holding", "error", err)
		}
	}

	// 7. Update order: delivery_confirmed_at, delivery_pod_url, status = delivered
	if updateErr := s.repo.UpdateOrderDeliveryConfirmed(ctx, order.ID, req.ConfirmedAt, req.PodURL); updateErr != nil {
		// Non-fatal: settlement sudah tersimpan, order update bisa diretry
		slog.WarnContext(ctx, "merchant_settlement: order delivery confirm update failed (non-fatal)",
			"order_id", order.ID, "error", updateErr)
	}

	// 8. Notifikasi ke merchant: dana akan dicairkan dalam X hari
	go func() {
		notifCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		msg := fmt.Sprintf(
			"✅ *Pesanan Terkirim!*\n\nBarang pesanan melalui link pembayaran Anda telah dikonfirmasi terkirim ke pembeli.\n\n💰 *Dana Rp %s akan dicairkan ke rekening Anda dalam %d hari kerja.*\n\n📦 AWB: %s (%s)",
			formatIDR(netPayoutIDR), holdingDays, req.AWBNumber, req.Provider,
		)
		_ = s.notificationSvc.Send(notifCtx, domain.NotificationRequest{
			UserID:  merchantUUID.String(),
			Title:   "Dana Segera Cair!",
			Message: msg,
			Channel: domain.ChannelPush,
			Data: map[string]string{
				"type":          "merchant_settlement_pending",
				"settlement_id": settlementID.String(),
				"payment_link_id": paymentLink.ID,
			},
		})
	}()

	slog.InfoContext(ctx, "merchant_settlement: settlement created",
		"settlement_id", settlementID,
		"payment_link_id", paymentLink.ID,
		"merchant_id", paymentLink.MerchantID,
		"net_payout_idr", netPayoutIDR,
		"holding_release_at", holdingReleaseAt)

	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// ProcessPendingSettlements adalah cron runner — dijalankan setiap 5 menit
// dari goroutine background di cmd/main.go.
// ─────────────────────────────────────────────────────────────────────────────
func (s *merchantSettlementService) ProcessPendingSettlements(ctx context.Context) error {
	autoEnabled := s.configRepo.GetStringConfig(ctx, "merchant_settlement_auto_enabled", "true")
	if autoEnabled != "true" {
		slog.InfoContext(ctx, "merchant_settlement: auto settlement disabled via config, skipping cron")
		return nil
	}

	// Ambil maksimal 50 record per run (batching untuk hindari long lock)
	settlements, err := s.repo.GetPendingHoldingReleased(ctx, time.Now(), 50)
	if err != nil {
		return fmt.Errorf("ProcessPendingSettlements: fetch failed: %w", err)
	}

	if len(settlements) == 0 {
		return nil
	}

	slog.InfoContext(ctx, "merchant_settlement: processing batch", "count", len(settlements))

	maxRetry := s.configRepo.GetIntConfig(ctx, "merchant_settlement_max_retry", 3)
	retryDelayHours := s.configRepo.GetIntConfig(ctx, "merchant_settlement_retry_delay_hours", 1)

	for _, settlement := range settlements {
		// Atomic transition HOLDING → PROCESSING (safe untuk multi-instance / race condition)
		moved, err := s.repo.AtomicSetStatus(ctx, settlement.ID, domain.SettlementStatusHolding, domain.SettlementStatusProcessing)
		if err != nil {
			slog.ErrorContext(ctx, "merchant_settlement: AtomicSetStatus failed",
				"settlement_id", settlement.ID, "error", err)
			continue
		}
		if !moved {
			// Sudah diproses oleh instance lain — skip dengan aman
			slog.InfoContext(ctx, "merchant_settlement: skip (already moved by another instance)",
				"settlement_id", settlement.ID)
			continue
		}

		// Proses disbursement dalam goroutine agar tidak blocking batch loop
		go func(s *merchantSettlementService, settlement *domain.MerchantSettlement, maxRetry, retryDelayHours int) {
			disbCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()

			if err := s.disburseToMerchant(disbCtx, settlement, maxRetry, retryDelayHours); err != nil {
				slog.ErrorContext(disbCtx, "merchant_settlement: disbursement failed",
					"settlement_id", settlement.ID, "error", err)
			}
		}(s, settlement, maxRetry, retryDelayHours)
	}

	return nil
}

// disburseToMerchant melakukan transfer ke rekening merchant via integration-gateway.
// Dipanggil dari goroutine oleh ProcessPendingSettlements.
func (s *merchantSettlementService) disburseToMerchant(ctx context.Context, settlement *domain.MerchantSettlement, maxRetry, retryDelayHours int) error {
	merchantUUID, err := uuid.Parse(settlement.MerchantID)
	if err != nil {
		return s.markFailed(ctx, settlement, fmt.Sprintf("invalid merchant_id: %s", settlement.MerchantID), maxRetry, retryDelayHours)
	}

	// 1. Ambil info bank merchant dari users table
	bankInfo, err := s.repo.GetMerchantBankInfo(ctx, merchantUUID)
	if err != nil {
		return s.markFailed(ctx, settlement, fmt.Sprintf("failed to get merchant bank info: %v", err), maxRetry, retryDelayHours)
	}

	// 2. Validasi bank info lengkap
	if !bankInfo.BankVerified {
		return s.markFailed(ctx, settlement,
			"merchant bank account not verified by admin — disbursement blocked",
			maxRetry, retryDelayHours)
	}
	if bankInfo.BankCode == nil || *bankInfo.BankCode == "" ||
		bankInfo.BankAccountNumber == nil || *bankInfo.BankAccountNumber == "" ||
		bankInfo.BankAccountName == nil || *bankInfo.BankAccountName == "" {
		return s.markFailed(ctx, settlement,
			"merchant bank info incomplete (bank_code/account_number/account_name missing)",
			maxRetry, retryDelayHours)
	}

	// 2026 Financial Sanity Check: Block zero, negative, or abnormally large automated payouts
	if settlement.NetPayoutIDR <= 0 {
		return s.markFailed(ctx, settlement,
			fmt.Sprintf("invalid net payout amount IDR %d (must be > 0)", settlement.NetPayoutIDR),
			maxRetry, retryDelayHours)
	}
	if settlement.NetPayoutIDR > 500000000 {
		return s.markFailed(ctx, settlement,
			fmt.Sprintf("net payout amount IDR %d exceeds automated disbursement threshold (Rp 500M limit)", settlement.NetPayoutIDR),
			maxRetry, retryDelayHours)
	}

	// 3. Simpan bank snapshot ke metadata SEBELUM disburse (audit trail)
	settlement.Metadata["bank_snapshot"] = map[string]any{
		"bank_code":              *bankInfo.BankCode,
		"bank_account_name":      *bankInfo.BankAccountName,
		"masked_account_number":  maskAccountNumber(*bankInfo.BankAccountNumber),
		"disbursed_amount_idr":   settlement.NetPayoutIDR,
		"disbursed_at":           time.Now().Format(time.RFC3339),
	}

	// 4. Panggil integration-gateway untuk disburse
	disbRef := fmt.Sprintf("SETTLE-%s-%d", settlement.ID.String()[:8], time.Now().UnixMilli())
	disbPayload := map[string]any{
		"ReferenceID":        disbRef,
		"Amount":             float64(settlement.NetPayoutIDR),
		"BeneficiaryName":    *bankInfo.BankAccountName,
		"BeneficiaryAccount": *bankInfo.BankAccountNumber,
		"BeneficiaryBank":    *bankInfo.BankCode,
		"Notes":              fmt.Sprintf("TEMBUS Merchant Settlement - PaymentLink %s", settlement.PaymentLinkID),
	}

	bodyBytes, err := json.Marshal(disbPayload)
	if err != nil {
		return s.markFailed(ctx, settlement, fmt.Sprintf("marshal disbursement payload failed: %v", err), maxRetry, retryDelayHours)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		s.gatewayURL+"/api/internal/payment/disburse",
		bytes.NewReader(bodyBytes))
	if err != nil {
		return s.markFailed(ctx, settlement, fmt.Sprintf("build request failed: %v", err), maxRetry, retryDelayHours)
	}
	req.Header.Set("Content-Type", "application/json")
	if s.internalAPIKey != "" {
		req.Header.Set("X-Internal-Api-Key", s.internalAPIKey)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return s.markFailed(ctx, settlement, fmt.Sprintf("disburse HTTP request failed: %v", err), maxRetry, retryDelayHours)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		var errBody map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&errBody)
		return s.markFailed(ctx, settlement,
			fmt.Sprintf("disbursement gateway rejected (status %d): %v", resp.StatusCode, errBody),
			maxRetry, retryDelayHours)
	}

	// 5. Disbursement berhasil: update COMPLETED
	if err := s.repo.UpdateCompleted(ctx, settlement.ID, disbRef); err != nil {
		slog.ErrorContext(ctx, "merchant_settlement: UpdateCompleted failed after successful disburse — NEEDS RECONCILIATION",
			"settlement_id", settlement.ID, "disbursement_ref", disbRef, "error", err)
		// Jangan return error — uang sudah ditransfer. Ini kasus yang butuh manual reconciliation.
		// Dalam production: kirim alert ke Slack/Telegram + PagerDuty.
		return nil
	}

	if s.ledgerRepo != nil {
		journal := &domain.LedgerJournal{
			ID:            uuid.New(),
			JournalType:   "SETTLEMENT",
			ReferenceType: "MERCHANT_SETTLEMENT_RELEASED",
			ReferenceID:   settlement.ID.String(),
			Reason:        fmt.Sprintf("Merchant Settlement Released for ID %s (Ref: %s)", settlement.ID.String(), disbRef),
			CreatedBy:     "SYSTEM",
			ActorRole:     "SYSTEM",
			CreatedAt:     time.Now(),
		}
		entries := []domain.LedgerEntry{
			{AccountName: "2102 - Merchant Compensation Payable", DebitIDR: settlement.NetPayoutIDR, CreditIDR: 0},
			{AccountName: "1101 - Cash / Bank", DebitIDR: 0, CreditIDR: settlement.NetPayoutIDR},
		}
		if _, err := s.ledgerRepo.CreateJournalReturningID(ctx, journal, entries); err != nil {
			slog.WarnContext(ctx, "merchant_settlement: failed to post ledger journal for release", "error", err)
		}
	}

	slog.InfoContext(ctx, "merchant_settlement: COMPLETED",
		"settlement_id", settlement.ID,
		"merchant_id", settlement.MerchantID,
		"net_payout_idr", settlement.NetPayoutIDR,
		"disbursement_ref", disbRef)

	// 6. Notifikasi merchant: dana sudah masuk
	go func() {
		notifCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = s.notificationSvc.Send(notifCtx, domain.NotificationRequest{
			UserID:  settlement.MerchantID,
			Title:   "Dana Telah Cair! 🎉",
			Message: fmt.Sprintf("Dana sebesar Rp %s untuk pesanan dari payment link Anda telah berhasil ditransfer ke rekening %s.", formatIDR(settlement.NetPayoutIDR), *bankInfo.BankCode),
			Channel: domain.ChannelPush,
			Data: map[string]string{
				"type":            "merchant_settlement_completed",
				"settlement_id":   settlement.ID.String(),
				"payment_link_id": settlement.PaymentLinkID,
				"disbursement_ref": disbRef,
			},
		})
	}()

	return nil
}

// markFailed menangani kegagalan disbursement.
// Jika retry masih tersisa: requeue ke HOLDING dengan delay.
// Jika sudah habis: set FAILED permanen.
func (s *merchantSettlementService) markFailed(ctx context.Context, settlement *domain.MerchantSettlement, reason string, maxRetry, retryDelayHours int) error {
	slog.ErrorContext(ctx, "merchant_settlement: disbursement error",
		"settlement_id", settlement.ID, "reason", reason, "retry_count", settlement.RetryCount)

	if settlement.RetryCount < maxRetry {
		// Masih bisa retry: set ulang ke HOLDING dengan delay
		retryAt := time.Now().Add(time.Duration(retryDelayHours) * time.Hour)
		if requeueErr := s.repo.RequeueForRetry(ctx, settlement.ID, retryAt); requeueErr != nil {
			slog.ErrorContext(ctx, "merchant_settlement: RequeueForRetry failed",
				"settlement_id", settlement.ID, "error", requeueErr)
		}
		// Update failure reason dan increment retry_count
		_ = s.repo.UpdateFailed(ctx, settlement.ID, reason)
		// Segera requeue ke HOLDING lagi
		_ = s.repo.RequeueForRetry(ctx, settlement.ID, retryAt)
		return fmt.Errorf("settlement %s failed (retry %d/%d): %s", settlement.ID, settlement.RetryCount+1, maxRetry, reason)
	}

	// Retry habis: set FAILED permanen
	if err := s.repo.UpdateFailed(ctx, settlement.ID, reason); err != nil {
		slog.ErrorContext(ctx, "merchant_settlement: UpdateFailed failed",
			"settlement_id", settlement.ID, "error", err)
	}
	// TODO production: kirim alert ke Slack/Telegram/PagerDuty
	slog.ErrorContext(ctx, "merchant_settlement: PERMANENTLY FAILED — manual intervention required",
		"settlement_id", settlement.ID, "merchant_id", settlement.MerchantID, "reason", reason)
	return fmt.Errorf("settlement %s PERMANENTLY FAILED after %d retries: %s", settlement.ID, maxRetry, reason)
}

// ─────────────────────────────────────────────────────────────────────────────
// ManualRelease — override oleh admin untuk bypass holding period.
// ─────────────────────────────────────────────────────────────────────────────
func (s *merchantSettlementService) ManualRelease(ctx context.Context, settlementID uuid.UUID, adminID uuid.UUID) error {
	settlement, err := s.repo.GetByID(ctx, settlementID)
	if err != nil {
		return fmt.Errorf("ManualRelease: GetByID failed: %w", err)
	}
	if settlement == nil {
		return fmt.Errorf("ManualRelease: settlement %s not found", settlementID)
	}
	if settlement.Status != domain.SettlementStatusHolding {
		return fmt.Errorf("ManualRelease: settlement is %s, only HOLDING can be manually released", settlement.Status)
	}

	// Set holding_release_at = NOW() agar cron segera memprosesnya
	releaseNow := time.Now()
	settlement.HoldingReleaseAt = &releaseNow
	settlement.Metadata["manual_release_by"] = adminID.String()
	settlement.Metadata["manual_release_at"] = releaseNow.Format(time.RFC3339)

	if err := s.repo.RequeueForRetry(ctx, settlementID, releaseNow); err != nil {
		return fmt.Errorf("ManualRelease: requeue failed: %w", err)
	}

	slog.InfoContext(ctx, "merchant_settlement: manual release triggered",
		"settlement_id", settlementID, "admin_id", adminID)
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// MarkDisputed — admin menandai settlement sebagai sengketa.
// ─────────────────────────────────────────────────────────────────────────────
func (s *merchantSettlementService) MarkDisputed(ctx context.Context, settlementID uuid.UUID, adminID uuid.UUID, reason string) error {
	moved, err := s.repo.AtomicSetStatus(ctx, settlementID, domain.SettlementStatusHolding, domain.SettlementStatusDisputed)
	if err != nil {
		return fmt.Errorf("MarkDisputed: %w", err)
	}
	if !moved {
		return fmt.Errorf("MarkDisputed: settlement %s is not in HOLDING status or already processed", settlementID)
	}
	_ = s.repo.UpdateFailed(ctx, settlementID, fmt.Sprintf("DISPUTED by admin %s: %s", adminID, reason))
	slog.InfoContext(ctx, "merchant_settlement: marked DISPUTED", "settlement_id", settlementID, "admin_id", adminID)
	return nil
}

func (s *merchantSettlementService) GetByPaymentLink(ctx context.Context, paymentLinkID string) (*domain.MerchantSettlement, error) {
	key := fmt.Sprintf("settle-%s", paymentLinkID)
	return s.repo.GetByIdempotencyKey(ctx, key)
}

func (s *merchantSettlementService) ListByMerchant(ctx context.Context, merchantID string, limit, offset int) ([]*domain.MerchantSettlement, error) {
	return s.repo.ListByMerchantID(ctx, merchantID, limit, offset)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func formatIDR(amount int64) string {
	// Format sederhana: 1500000 → "1.500.000"
	s := fmt.Sprintf("%d", amount)
	result := ""
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			result += "."
		}
		result += string(c)
	}
	return result
}

func maskAccountNumber(account string) string {
	if len(account) <= 4 {
		return "****"
	}
	masked := ""
	for i := 0; i < len(account)-4; i++ {
		masked += "*"
	}
	return masked + account[len(account)-4:]
}
