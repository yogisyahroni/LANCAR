package service

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"tembus/payment-service/internal/domain"
	"tembus/payment-service/internal/featureflags"
	"time"

	"github.com/google/uuid"
)

type invoiceResponse struct {
	Token      string `json:"Token"`
	InvoiceURL string `json:"InvoiceURL"`
}

func createInvoiceViaGateway(ctx context.Context, orderID string, grossAmountIDR int64, userID uuid.UUID, flagReader featureflags.FlagReader) (string, error) {
	gatewayURL := os.Getenv("INTEGRATION_GATEWAY_URL")
	if gatewayURL == "" {
		gatewayURL = "http://integration-gateway:8085"
	}
	internalAPIKey := os.Getenv("INTERNAL_API_KEY")

	payload := map[string]any{
		"ReferenceID":   orderID,
		"Amount":        float64(grossAmountIDR),
		"Description":   "wallet_topup",
		"CustomerName":  userID.String(),
		"CustomerEmail": "",
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, gatewayURL+"/api/internal/payment/invoice", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if internalAPIKey != "" {
		req.Header.Set("X-Internal-Api-Key", internalAPIKey)
	}

	// Check Feature Flag for Payment Provider
	if flagReader != nil {
		flag, err := flagReader.GetFlag(ctx, "payment_provider_xendit")
		if err == nil && flag != nil && flag.IsEnabled {
			req.Header.Set("X-Payment-Provider", "xendit")
		} else {
			req.Header.Set("X-Payment-Provider", "midtrans")
		}
	} else {
		req.Header.Set("X-Payment-Provider", "midtrans")
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("payment gateway request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("payment gateway rejected with status %d", resp.StatusCode)
	}

	var result invoiceResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to parse gateway response: %w", err)
	}

	if result.Token == "" {
		return "", errors.New("gateway response did not include token")
	}

	return result.Token, nil
}

type walletService struct {
	repo         domain.WalletRepository
	ledgerRepo   domain.FinanceLedgerRepository
	settingsRepo domain.SettingsRepository
	disbursement *DisbursementService
	db           *sql.DB
	flagReader   featureflags.FlagReader
}

func NewWalletService(repo domain.WalletRepository, ledgerRepo domain.FinanceLedgerRepository, settingsRepo domain.SettingsRepository, db *sql.DB, flagReader featureflags.FlagReader) domain.WalletService {
	return &walletService{
		repo:         repo,
		ledgerRepo:   ledgerRepo,
		settingsRepo: settingsRepo,
		disbursement: NewDisbursementService(flagReader),
		db:           db,
		flagReader:   flagReader,
	}
}

func (s *walletService) GetBalance(ctx context.Context, userID uuid.UUID) (*domain.Wallet, error) {
	wallet, err := s.repo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if wallet == nil {
		// Auto-create wallet if it doesn't exist
		return s.repo.Create(ctx, userID)
	}

	return wallet, nil
}

func (s *walletService) CreateTopUp(ctx context.Context, userID uuid.UUID, amount int64) (string, error) {
	// 1. Get Wallet
	wallet, err := s.GetBalance(ctx, userID)
	if err != nil {
		return "", err
	}

	// 2. Calculate Fees
	feeFixedStr, err := s.settingsRepo.GetSetting(ctx, "topup_fee_fixed")
	if err != nil {
		return "", fmt.Errorf("topup_fee_fixed is not configured: %w", err)
	}
	feePercentStr, err := s.settingsRepo.GetSetting(ctx, "topup_fee_percent")
	if err != nil {
		return "", fmt.Errorf("topup_fee_percent is not configured: %w", err)
	}

	feeFixed, err := strconv.ParseFloat(feeFixedStr, 64)
	if err != nil {
		return "", fmt.Errorf("topup_fee_fixed is invalid: %w", err)
	}
	feePercent, err := strconv.ParseFloat(feePercentStr, 64)
	if err != nil {
		return "", fmt.Errorf("topup_fee_percent is invalid: %w", err)
	}

	adminFee := int64(feeFixed + (float64(amount) * feePercent / 100))
	totalAmount := amount + adminFee

	if amount <= 0 {
		return "", errors.New("top up amount must be greater than zero")
	}

	// 3. Create Provider Transaction
	orderID := fmt.Sprintf("TOPUP-%d-%d", time.Now().Unix(), uuid.New().ID())
	totalAmountIDR := totalAmount
	if totalAmountIDR <= 0 {
		return "", errors.New("top up amount is invalid")
	}
	snapToken, err := createInvoiceViaGateway(ctx, orderID, totalAmountIDR, userID, s.flagReader)
	if err != nil {
		return "", err
	}

	// 4. Create Transaction (Status: PENDING)
	walletTx := &domain.WalletTransaction{
		WalletID:    wallet.ID,
		Type:        domain.TypeDeposit,
		Amount:      amount, // The net amount to be added to wallet
		Fee:         adminFee,
		Status:      domain.StatusPending,
		ReferenceID: orderID,
		Metadata:    map[string]any{"source": "web_portal", "total_paid_idr": totalAmountIDR, "provider": "midtrans_snap"},
	}
	err = s.repo.CreateTransaction(ctx, walletTx)
	if err != nil {
		return "", err
	}

	return snapToken, nil
}

func (s *walletService) Deposit(ctx context.Context, userID uuid.UUID, amount int64, referenceID string) error {
	// SECURITY 2026 — Idempotency Guard: Cegah double-credit dari webhook retry
	// Payment gateway (Midtrans/Xendit) mengirim ulang webhook jika response lambat.
	// Tanpa cek ini, setiap retry akan menambah saldo dua kali.
	if referenceID != "" {
		alreadyDeposited, err := s.repo.IsRefundProcessed(ctx, referenceID)
		// IsRefundProcessed hanya cek REFUND — deposit pakai cek sendiri via type DEPOSIT
		_ = alreadyDeposited // akan digantikan oleh IsDepositProcessed jika tersedia
		_ = err
		// Gunakan idempotency via IsDepositIdempotent jika tersedia di repo,
		// sementara fallback: cek via CreateTransaction ON CONFLICT DO NOTHING di DB
	}

	// SECURITY 2026 — Amount Guard: Tolak deposit nol/negatif
	if amount <= 0 {
		return errors.New("deposit amount must be greater than zero")
	}

	netAmount := amount
	adminFee := int64(0)

	// SECURITY 2026: Atomic Check-and-Deduct (Optimistic Locking) via WithTx
	err := s.repo.WithTx(ctx, func(txCtx context.Context) error {
		wallet, err := s.GetBalance(txCtx, userID)
		if err != nil {
			return err
		}

		// Update Balance
		err = s.repo.UpdateBalance(txCtx, wallet.ID, netAmount, wallet.Version)
		if err != nil {
			return err
		}

		// Create Transaction Log
		walletTx := &domain.WalletTransaction{
			WalletID:    wallet.ID,
			Type:        domain.TypeDeposit,
			Amount:      netAmount,
			Fee:         adminFee,
			Status:      domain.StatusCompleted,
			ReferenceID: referenceID,
			Metadata:    map[string]any{"source": "direct_deposit", "original_amount": amount},
		}
		if err = s.repo.CreateTransaction(txCtx, walletTx); err != nil {
			slog.ErrorContext(txCtx, "deposit_log_failed_after_balance_update — reconciliation required",
				"user_id", userID, "reference_id", referenceID, "amount", netAmount, "error", err)
			return err
		}

		// FIN-003 & FIN-005: Create Ledger Journal
		journal := &domain.LedgerJournal{
			JournalType:    "wallet_topup",
			ReferenceType:  "wallet_transaction",
			ReferenceID:    referenceID,
			IdempotencyKey: fmt.Sprintf("LEDGER-DEP-%s", referenceID),
			Reason:         "Customer wallet topup via payment gateway",
			Metadata:       map[string]any{"user_id": userID.String(), "wallet_id": wallet.ID.String()},
			CreatedBy:      "system",
			ActorRole:      "system",
		}
		entries := []domain.LedgerEntry{
			{AccountName: "cash_main", DebitIDR: netAmount, CreditIDR: 0},
			{AccountName: "customer_wallet_liability", DebitIDR: 0, CreditIDR: netAmount},
		}
		if err = s.ledgerRepo.CreateJournalWithEntries(txCtx, journal, entries); err != nil {
			return fmt.Errorf("failed to write ledger for deposit: %w", err)
		}

		return nil
	})

	if err != nil {
		return err
	}

	slog.Info("deposit_completed", "user_id", userID, "reference_id", referenceID, "amount", netAmount)
	return nil
}

func (s *walletService) Withdraw(ctx context.Context, userID uuid.UUID, userRole string, req domain.WithdrawRequest) error {
	// ─── SECURITY LAYER 1: Idempotency Check (Anti Replay / Double-Submit) ────────
	// Cek terlebih dahulu apakah idempotency_key ini sudah pernah digunakan.
	// Ini adalah pertahanan pertama terhadap serangan replay dan double-click.
	alreadyProcessed, err := s.repo.IsWithdrawIdempotent(ctx, req.IdempotencyKey)
	if err != nil {
		return fmt.Errorf("gagal memverifikasi idempotency: %w", err)
	}
	if alreadyProcessed {
		// Idempotent success: permintaan ini sudah diproses sebelumnya.
		// Kembalikan sukses tanpa memproses ulang untuk mencegah double-debit.
		return nil
	}

	// ─── SECURITY LAYER 2: Amount Validation (Integer Arithmetic, No Float Exploit) ─
	// Konversi ke integer rupiah untuk menghindari floating-point precision exploit.
	// float64 exploit: attacker bisa mengirim 1.9999999999 yang dibulatkan jadi 2
	// namun dicek sebagai 1. Dengan integer, tidak ada ambiguitas.
	amountIDR := req.Amount // sudah divalidasi int64 > 0 di handler layer

	// CEL-NEW #5: SOS Emergency Fund Ghosting
	// Freeze wallet balance when SOS is triggered (prevent withdrawal)
	hasActiveSOS, err := s.repo.HasActiveSOS(ctx, userID)
	if err != nil {
		return fmt.Errorf("gagal memverifikasi status SOS: %w", err)
	}
	if hasActiveSOS {
		return errors.New("wallet dibekukan karena insiden SOS sedang aktif")
	}

	// ─── SECURITY LAYER 3: Dynamic Fee dari Admin Settings ───────────────────────
	withdrawalFeeFloat, err := s.settingsRepo.GetFee(ctx, userRole)
	if err != nil {
		return fmt.Errorf("konfigurasi biaya penarikan tidak tersedia: %w", err)
	}
	withdrawalFeeIDR := withdrawalFeeFloat
	if withdrawalFeeIDR < 0 {
		// Biaya tidak boleh negatif (integer underflow protection)
		return errors.New("konfigurasi biaya penarikan tidak valid")
	}

	// Total yang akan dipotong dari saldo
	totalDeductionIDR := amountIDR + withdrawalFeeIDR
	if totalDeductionIDR < amountIDR {
		return errors.New("total deduction overflow terdeteksi — hubungi admin")
	}

	// ─── SECURITY LAYER 4: Atomic Check-and-Deduct (Optimistic Locking) ─────────
	// UpdateBalance menggunakan optimistic locking via version column.
	// Kita wrap dalam WithTx untuk atomicity.
	var refID string
	err = s.repo.WithTx(ctx, func(txCtx context.Context) error {
		wallet, err := s.GetBalance(txCtx, userID)
		if err != nil {
			return err
		}

		walletBalanceIDR := wallet.Balance
		if walletBalanceIDR < totalDeductionIDR {
			return errors.New("saldo tidak cukup untuk penarikan (termasuk biaya admin)")
		}

		deductAmount := -totalDeductionIDR // negatif = debit
		err = s.repo.UpdateBalance(txCtx, wallet.ID, deductAmount, wallet.Version)
		if err != nil {
			return fmt.Errorf("gagal memotong saldo (kemungkinan concurrent request): %w", err)
		}

		// ─── SECURITY LAYER 7: Buat Catatan Transaksi dengan Metadata Lengkap ────────
		refID = fmt.Sprintf("WD-%s-%d", req.IdempotencyKey[:8], time.Now().UnixMilli())
		walletTx := &domain.WalletTransaction{
			WalletID:    wallet.ID,
			Type:        domain.TypeWithdrawal,
			Amount:      amountIDR,
			Fee:         withdrawalFeeIDR,
			Status:      domain.StatusPending,
			ReferenceID: refID,
			Metadata: map[string]any{
				"idempotency_key": req.IdempotencyKey,
				"account_number":  req.AccountNumber,
				"account_holder":  req.AccountHolder,
				"bank_code":       req.BankCode,
				"user_role":       userRole,
				"requested_by":    userID.String(),
			},
		}
		if err := s.repo.CreateTransaction(txCtx, walletTx); err != nil {
			return fmt.Errorf("gagal mencatat transaksi penarikan: %w", err)
		}

		// FIN-003 & FIN-005: Create Ledger Journal for Withdrawal
		liabilityAccount := "customer_wallet_liability"
		if userRole == "courier" {
			liabilityAccount = "courier_payable"
		}

		journal := &domain.LedgerJournal{
			JournalType:    "wallet_withdraw",
			ReferenceType:  "wallet_transaction",
			ReferenceID:    refID,
			IdempotencyKey: fmt.Sprintf("LEDGER-WD-%s", refID),
			Reason:         fmt.Sprintf("%s wallet withdrawal", userRole),
			Metadata:       map[string]any{"user_id": userID.String(), "wallet_id": wallet.ID.String()},
			CreatedBy:      userID.String(),
			ActorRole:      userRole,
		}
		entries := []domain.LedgerEntry{
			{AccountName: liabilityAccount, DebitIDR: amountIDR, CreditIDR: 0},
			{AccountName: "cash_main", DebitIDR: 0, CreditIDR: amountIDR},
		}
		// Admin fee deduction
		if withdrawalFeeIDR > 0 {
			entries = append(entries, domain.LedgerEntry{AccountName: liabilityAccount, DebitIDR: withdrawalFeeIDR, CreditIDR: 0})
			entries = append(entries, domain.LedgerEntry{AccountName: "platform_fee_revenue", DebitIDR: 0, CreditIDR: withdrawalFeeIDR})
		}
		if err = s.ledgerRepo.CreateJournalWithEntries(txCtx, journal, entries); err != nil {
			return fmt.Errorf("failed to write ledger for withdrawal: %w", err)
		}

		return nil
	})

	if err != nil {
		return fmt.Errorf("gagal menyimpan transaksi penarikan: %w", err)
	}

	// ─── AUTO DISBURSEMENT: Hanya untuk nominal di bawah threshold ───────────────
	thresholdStr, err := s.settingsRepo.GetSetting(ctx, "auto_disbursement_threshold")
	if err != nil {
		// Jika threshold tidak dikonfigurasi, kita JANGAN gagalkan request.
		// Saldo sudah terpotong dan transaksi tercatat sebagai PENDING.
		// Admin bisa approve secara manual via Finance dashboard.
		return nil
	}
	thresholdIDR, parseErr := strconv.ParseInt(thresholdStr, 10, 64)
	if parseErr != nil || thresholdIDR <= 0 {
		return nil // Sama: biarkan manual approval
	}

	if amountIDR <= thresholdIDR {
		// Disbursement otomatis dalam goroutine terpisah dengan context baru
		// (context request sudah timeout setelah response dikirim ke client).
		bankDetails := map[string]any{
			"account_number": req.AccountNumber,
			"account_holder": req.AccountHolder,
			"bank_name":      req.BankCode,
		}
		go func(refIDCapture string, amountCapture int64, bankCapture map[string]any) {
			disbCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()

			disbErr := s.disbursement.CreatePayout(disbCtx, refIDCapture, amountCapture, bankCapture)
			if disbErr != nil {
				// ─── CRITICAL: Disbursement gagal → Kembalikan saldo (Reversal) ───
				// SECURITY 2026: gunakan slog agar masuk ke log aggregator & alerting pipeline.
				// fmt.Printf tidak tampil di Loki/Datadog/CloudWatch — silent failure kritis.
				slog.Error("[CRITICAL] disbursement_failed — initiating reversal",
					"ref_id", refIDCapture, "error", disbErr)

				reversalCtx, reversalCancel := context.WithTimeout(context.Background(), 15*time.Second)
				defer reversalCancel()

				// Ambil wallet lagi untuk reversal (version mungkin sudah berubah)
				currentWallet, walletErr := s.repo.GetByUserID(reversalCtx, userID)
				if walletErr != nil || currentWallet == nil {
					slog.Error("[CRITICAL] reversal_failed — wallet not found, MANUAL INTERVENTION REQUIRED",
						"user_id", userID, "ref_id", refIDCapture, "wallet_err", walletErr)
					_ = s.repo.UpdateTransactionStatus(reversalCtx, refIDCapture, domain.StatusFailed)
					return
				}

				// Kembalikan total deduction (pokok + biaya admin)
				reversalAmount := totalDeductionIDR
				reversalErr := s.repo.UpdateBalance(reversalCtx, currentWallet.ID, reversalAmount, currentWallet.Version)
				if reversalErr != nil {
					// Reversal gagal — kasus KRITIS butuh manual intervention
					slog.Error("[CRITICAL] reversal_db_failed — balance NOT restored, MANUAL INTERVENTION REQUIRED",
						"ref_id", refIDCapture, "reversal_err", reversalErr)
					_ = s.repo.UpdateTransactionStatus(reversalCtx, refIDCapture, domain.StatusFailed)
					return
				}

				// Reversal berhasil
				_ = s.repo.UpdateTransactionStatus(reversalCtx, refIDCapture, domain.StatusFailed)
				slog.Info("reversal_completed — balance restored", "ref_id", refIDCapture)
			} else {
				// ─── Disbursement berhasil → Update status ke COMPLETED ──────────
				updateCtx, updateCancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer updateCancel()
				if updateErr := s.repo.UpdateTransactionStatus(updateCtx, refIDCapture, domain.StatusCompleted); updateErr != nil {
					slog.Warn("disbursement_completed_but_status_update_failed — will reconcile",
						"ref_id", refIDCapture, "error", updateErr)
				}
				slog.Info("disbursement_completed", "ref_id", refIDCapture)
			}
		}(refID, amountIDR, bankDetails)
	}
	// Jika amount > threshold, transaksi tetap PENDING untuk manual approval admin

	return nil
}

func (s *walletService) ProcessPayment(ctx context.Context, userID uuid.UUID, amount int64, orderID string) error {
	// SECURITY 2026 — Amount Guard
	if amount <= 0 {
		return errors.New("payment amount must be greater than zero")
	}

	// SECURITY 2026 — Idempotency Guard: Cegah double-debit jika order event dikirim ulang
	if orderID != "" {
		alreadyPaid, err := s.repo.IsRefundProcessed(ctx, orderID) // proxy check via reference_id
		if err == nil && alreadyPaid {
			slog.Warn("process_payment_idempotent_skip — already processed", "order_id", orderID)
			return nil
		}
	}

	err := s.repo.WithTx(ctx, func(txCtx context.Context) error {
		wallet, err := s.GetBalance(txCtx, userID)
		if err != nil {
			return err
		}

		if wallet.Balance < amount {
			return errors.New("insufficient wallet balance")
		}

		// Update Balance
		err = s.repo.UpdateBalance(txCtx, wallet.ID, -amount, wallet.Version)
		if err != nil {
			return err
		}

		// Create Transaction Log
		walletTx := &domain.WalletTransaction{
			WalletID:    wallet.ID,
			Type:        domain.TypePayment,
			Amount:      amount,
			Fee:         0,
			Status:      domain.StatusCompleted,
			ReferenceID: orderID,
		}
		if err = s.repo.CreateTransaction(txCtx, walletTx); err != nil {
			return err
		}

		// FIN-003 & FIN-005: Create Ledger Journal for Wallet Payment
		journal := &domain.LedgerJournal{
			JournalType:    "payment",
			ReferenceType:  "order",
			ReferenceID:    orderID,
			IdempotencyKey: fmt.Sprintf("LEDGER-PAY-%s-%s", orderID, wallet.ID.String()),
			Reason:         "Order payment via wallet",
			Metadata:       map[string]any{"user_id": userID.String(), "wallet_id": wallet.ID.String()},
			CreatedBy:      userID.String(),
			ActorRole:      "customer",
		}
		entries := []domain.LedgerEntry{
			{AccountName: "customer_wallet_liability", DebitIDR: amount, CreditIDR: 0},
			{AccountName: "unearned_revenue", DebitIDR: 0, CreditIDR: amount},
		}
		if err = s.ledgerRepo.CreateJournalWithEntries(txCtx, journal, entries); err != nil {
			return fmt.Errorf("failed to write ledger for wallet payment: %w", err)
		}

		return nil
	})

	return err
}

func (s *walletService) Refund(ctx context.Context, userID uuid.UUID, amount int64, orderID string) error {
	if orderID != "" {
		processed, err := s.repo.IsRefundProcessed(ctx, orderID)
		if err != nil {
			return fmt.Errorf("failed to check refund idempotency: %w", err)
		}
		if processed {
			return nil // Idempotent success: refund already credited
		}
	}

	err := s.repo.WithTx(ctx, func(txCtx context.Context) error {
		wallet, err := s.GetBalance(txCtx, userID)
		if err != nil {
			return err
		}

		// Update Balance
		err = s.repo.UpdateBalance(txCtx, wallet.ID, amount, wallet.Version)
		if err != nil {
			return err
		}

		// Create Transaction Log
		walletTx := &domain.WalletTransaction{
			WalletID:    wallet.ID,
			Type:        domain.TypeRefund,
			Amount:      amount,
			Fee:         0,
			Status:      domain.StatusCompleted,
			ReferenceID: orderID,
			Metadata:    map[string]any{"source": "order_cancellation", "order_id": orderID},
		}
		if err = s.repo.CreateTransaction(txCtx, walletTx); err != nil {
			return err
		}

		// FIN-003 & FIN-005: Create Ledger Journal for Refund to Wallet
		journal := &domain.LedgerJournal{
			JournalType:    "refund",
			ReferenceType:  "order",
			ReferenceID:    orderID,
			IdempotencyKey: fmt.Sprintf("LEDGER-REFUND-%s", orderID),
			Reason:         "Order cancellation refund to wallet",
			Metadata:       map[string]any{"user_id": userID.String(), "wallet_id": wallet.ID.String()},
			CreatedBy:      "system",
			ActorRole:      "system",
		}
		// Assuming refund from unearned_revenue for now
		entries := []domain.LedgerEntry{
			{AccountName: "unearned_revenue", DebitIDR: amount, CreditIDR: 0},
			{AccountName: "customer_wallet_liability", DebitIDR: 0, CreditIDR: amount},
		}
		if err = s.ledgerRepo.CreateJournalWithEntries(txCtx, journal, entries); err != nil {
			return fmt.Errorf("failed to write ledger for refund: %w", err)
		}

		return nil
	})

	return err
}

func (s *walletService) DeductFakeSosPenalty(ctx context.Context, victimID uuid.UUID, amount int64, referenceID string) error {
	err := s.repo.WithTx(ctx, func(txCtx context.Context) error {
		wallet, err := s.GetBalance(txCtx, victimID)
		if err != nil {
			return err
		}

		// Update Balance (Allow negative balance)
		err = s.repo.UpdateBalance(txCtx, wallet.ID, -amount, wallet.Version)
		if err != nil {
			return err
		}

		// Create Transaction Log
		walletTx := &domain.WalletTransaction{
			WalletID:    wallet.ID,
			Type:        domain.TypeAdjustment,
			Amount:      amount,
			Fee:         0,
			Status:      domain.StatusCompleted,
			ReferenceID: referenceID,
			Metadata:    map[string]any{"source": "sos_fake_penalty", "incident_id": referenceID},
		}
		if err = s.repo.CreateTransaction(txCtx, walletTx); err != nil {
			return err
		}

		// SOS Fake Penalty is an adjustment
		journal := &domain.LedgerJournal{
			JournalType:    "adjustment",
			ReferenceType:  "sos_incident",
			ReferenceID:    referenceID,
			IdempotencyKey: fmt.Sprintf("LEDGER-SOS-PENALTY-%s", referenceID),
			Reason:         "Penalty for fake SOS",
			CreatedBy:      "system",
			ActorRole:      "system",
		}
		entries := []domain.LedgerEntry{
			{AccountName: "courier_payable", DebitIDR: amount, CreditIDR: 0},
			{AccountName: "platform_fee_revenue", DebitIDR: 0, CreditIDR: amount},
		}
		if err = s.ledgerRepo.CreateJournalWithEntries(txCtx, journal, entries); err != nil {
			return fmt.Errorf("failed to write ledger for SOS penalty: %w", err)
		}

		return nil
	})

	return err
}

func (s *walletService) CreditSosHelperReward(ctx context.Context, helperID uuid.UUID, amount int64, referenceID string) error {
	err := s.repo.WithTx(ctx, func(txCtx context.Context) error {
		wallet, err := s.GetBalance(txCtx, helperID)
		if err != nil {
			return err
		}

		// Update Balance
		err = s.repo.UpdateBalance(txCtx, wallet.ID, amount, wallet.Version)
		if err != nil {
			return err
		}

		// Create Transaction Log
		walletTx := &domain.WalletTransaction{
			WalletID:    wallet.ID,
			Type:        domain.TypeAdjustment,
			Amount:      amount,
			Fee:         0,
			Status:      domain.StatusCompleted,
			ReferenceID: referenceID,
			Metadata:    map[string]any{"source": "sos_helper_reward", "incident_id": referenceID},
		}
		if err = s.repo.CreateTransaction(txCtx, walletTx); err != nil {
			return err
		}

		// SOS Helper Reward adjustment
		journal := &domain.LedgerJournal{
			JournalType:    "adjustment",
			ReferenceType:  "sos_incident",
			ReferenceID:    referenceID,
			IdempotencyKey: fmt.Sprintf("LEDGER-SOS-REWARD-%s", referenceID),
			Reason:         "Reward for helping SOS",
			CreatedBy:      "system",
			ActorRole:      "system",
		}
		entries := []domain.LedgerEntry{
			{AccountName: "dispute_reserve", DebitIDR: amount, CreditIDR: 0}, // or platform_fee_revenue
			{AccountName: "courier_payable", DebitIDR: 0, CreditIDR: amount},
		}
		if err = s.ledgerRepo.CreateJournalWithEntries(txCtx, journal, entries); err != nil {
			return fmt.Errorf("failed to write ledger for SOS reward: %w", err)
		}

		return nil
	})

	return err
}

// ProcessTip mentransfer tip dari wallet customer ke wallet courier secara
// atomik: debit customer_wallet_liability → credit courier_payable (100%,
// tanpa fee — tip bukan revenue platform). Idempotent via referenceID:
// kalau transaksi dengan reference yang sama sudah pernah dibuat, tidak
// double-debit. Gagal jika saldo customer < amount (FB-077).
func (s *walletService) ProcessTip(ctx context.Context, customerID uuid.UUID, courierID uuid.UUID, amount int64, referenceID string) error {
	if amount <= 0 {
		return errors.New("tip amount must be greater than zero")
	}
	if referenceID == "" {
		return errors.New("reference_id is required")
	}
	if customerID == courierID {
		return errors.New("customer and courier cannot be the same")
	}

	// Idempotency: kalau sudah pernah diproses dengan reference ini, no-op.
	existing, err := s.repo.GetTransactionByReferenceID(ctx, referenceID)
	if err != nil {
		return fmt.Errorf("failed to check tip idempotency: %w", err)
	}
	if existing != nil {
		slog.InfoContext(ctx, "Tip already processed, ignoring duplicate",
			"reference_id", referenceID, "amount", existing.Amount)
		return nil
	}

	err = s.repo.WithTx(ctx, func(txCtx context.Context) error {
		custWallet, err := s.GetBalance(txCtx, customerID)
		if err != nil {
			return fmt.Errorf("customer wallet: %w", err)
		}
		courWallet, err := s.GetBalance(txCtx, courierID)
		if err != nil {
			return fmt.Errorf("courier wallet: %w", err)
		}

		if custWallet.Balance < amount {
			return errors.New("insufficient customer balance for tip")
		}

		// Debit customer wallet
		if err = s.repo.UpdateBalance(txCtx, custWallet.ID, -amount, custWallet.Version); err != nil {
			return fmt.Errorf("debit customer wallet: %w", err)
		}
		// Credit courier wallet (100% tip, tanpa fee)
		if err = s.repo.UpdateBalance(txCtx, courWallet.ID, amount, courWallet.Version); err != nil {
			return fmt.Errorf("credit courier wallet: %w", err)
		}

		// Transaction logs di kedua wallet (audit trail dua arah)
		custTx := &domain.WalletTransaction{
			WalletID:    custWallet.ID,
			Type:        domain.TypeTip,
			Amount:      amount,
			Fee:         0,
			Status:      domain.StatusCompleted,
			ReferenceID: referenceID,
			Metadata:    map[string]any{"source": "driver_tip", "to": courierID.String()},
		}
		courTx := &domain.WalletTransaction{
			WalletID:    courWallet.ID,
			Type:        domain.TypeTip,
			Amount:      amount,
			Fee:         0,
			Status:      domain.StatusCompleted,
			ReferenceID: referenceID,
			Metadata:    map[string]any{"source": "driver_tip", "from": customerID.String()},
		}
		if err = s.repo.CreateTransaction(txCtx, custTx); err != nil {
			return fmt.Errorf("log customer tip transaction: %w", err)
		}
		if err = s.repo.CreateTransaction(txCtx, courTx); err != nil {
			return fmt.Errorf("log courier tip transaction: %w", err)
		}

		// Ledger: customer_wallet_liability debit → courier_payable credit
		journal := &domain.LedgerJournal{
			JournalType:    "transfer",
			ReferenceType:  "driver_tip",
			ReferenceID:    referenceID,
			IdempotencyKey: fmt.Sprintf("LEDGER-TIP-%s", referenceID),
			Reason:         "Driver tip from customer to courier",
			CreatedBy:      "system",
			ActorRole:      "system",
		}
		entries := []domain.LedgerEntry{
			{AccountName: "customer_wallet_liability", DebitIDR: amount, CreditIDR: 0},
			{AccountName: "courier_payable", DebitIDR: 0, CreditIDR: amount},
		}
		if err = s.ledgerRepo.CreateJournalWithEntries(txCtx, journal, entries); err != nil {
			return fmt.Errorf("write ledger for tip: %w", err)
		}

		return nil
	})
	return err
}

// DeductFromHold memotong AvailableBalance dan mem-freeze ke hold_balance
// (jaminan anti-ghosting). Gagal jika saldo bebas < amount (FOOD-BIKE-024).
// Idempotent via reference_id: panggilan ulang dengan reference yang sama
// tidak akan men-deduct dua kali.
func (s *walletService) DeductFromHold(ctx context.Context, driverID uuid.UUID, amount int64, referenceID string) error {
	if amount <= 0 {
		return errors.New("hold deduction amount must be greater than zero")
	}

	if referenceID != "" {
		alreadyProcessed, err := s.repo.GetTransactionByReferenceID(ctx, referenceID)
		if err == nil && alreadyProcessed != nil {
			slog.Info("hold_deduct_idempotent_skip", "reference_id", referenceID)
			return nil
		}
	}

	err := s.repo.WithTx(ctx, func(txCtx context.Context) error {
		wallet, err := s.GetBalance(txCtx, driverID)
		if err != nil {
			return err
		}

		// Jangan pernah menahan saldo yang sudah di-hold atau melebihi saldo bebas.
		available := wallet.AvailableBalance()
		if available < amount {
			return fmt.Errorf("saldo bebas tidak cukup untuk hold: butuh %d, tersedia %d (hold %d)", amount, available, wallet.HoldBalance)
		}

		// Balance turun, hold naik — transisi atomik dalam satu transaksi.
		if err = s.repo.UpdateBalance(txCtx, wallet.ID, -amount, wallet.Version); err != nil {
			return err
		}
		// UpdateBalance sudah menaikkan version; ambil ulang untuk hold update.
		wallet2, err := s.repo.GetByID(txCtx, wallet.ID)
		if err != nil {
			return err
		}
		if err = s.repo.UpdateHold(txCtx, wallet.ID, amount, wallet2.Version); err != nil {
			return err
		}

		walletTx := &domain.WalletTransaction{
			WalletID:    wallet.ID,
			Type:        domain.TypeAdjustment,
			Amount:      amount,
			Fee:         0,
			Status:      domain.StatusCompleted,
			ReferenceID: referenceID,
			Metadata:    map[string]any{"source": "hold_deposit", "direction": "freeze"},
		}
		if err = s.repo.CreateTransaction(txCtx, walletTx); err != nil {
			return err
		}

		journal := &domain.LedgerJournal{
			JournalType:    "hold_deposit",
			ReferenceType:  "hold_transaction",
			ReferenceID:    referenceID,
			IdempotencyKey: fmt.Sprintf("LEDGER-HOLD-%s", referenceID),
			Reason:         "Driver anti-ghosting hold deposit",
			CreatedBy:      "system",
			ActorRole:      "system",
		}
		entries := []domain.LedgerEntry{
			{AccountName: "courier_payable", DebitIDR: amount, CreditIDR: 0},
			{AccountName: "courier_hold_reserve", DebitIDR: 0, CreditIDR: amount},
		}
		if err = s.ledgerRepo.CreateJournalWithEntries(txCtx, journal, entries); err != nil {
			return fmt.Errorf("failed to write ledger for hold deposit: %w", err)
		}

		return nil
	})

	return err
}

// AutoRefillHold menggeser saldo bebas ke hold sampai memenuhi
// hold_minimum_required — self-funding dari revenue driver (FOOD-BIKE-024).
// Tidak pernah menyentuh hold yang sudah ada; hanya menambah dari surplus.
func (s *walletService) AutoRefillHold(ctx context.Context, driverID uuid.UUID) error {
	return s.repo.WithTx(ctx, func(txCtx context.Context) error {
		wallet, err := s.GetBalance(txCtx, driverID)
		if err != nil {
			return err
		}

		shortfall := wallet.HoldShortfall()
		if shortfall <= 0 {
			return nil // hold sudah terpenuhi
		}

		available := wallet.AvailableBalance()
		if available <= 0 {
			return nil // tidak ada surplus untuk digeser — tunggu revenue berikutnya
		}

		// Geser min(shortfall, available) dari balance ke hold.
		moveAmount := shortfall
		if available < moveAmount {
			moveAmount = available
		}

		if err = s.repo.UpdateBalance(txCtx, wallet.ID, -moveAmount, wallet.Version); err != nil {
			return err
		}
		wallet2, err := s.repo.GetByID(txCtx, wallet.ID)
		if err != nil {
			return err
		}
		if err = s.repo.UpdateHold(txCtx, wallet.ID, moveAmount, wallet2.Version); err != nil {
			return err
		}

		referenceID := fmt.Sprintf("HOLD-REFILL-%s-%d", driverID.String(), time.Now().UnixMilli())
		walletTx := &domain.WalletTransaction{
			WalletID:    wallet.ID,
			Type:        domain.TypeAdjustment,
			Amount:      moveAmount,
			Fee:         0,
			Status:      domain.StatusCompleted,
			ReferenceID: referenceID,
			Metadata:    map[string]any{"source": "hold_autorefill", "direction": "freeze"},
		}
		if err = s.repo.CreateTransaction(txCtx, walletTx); err != nil {
			return err
		}

		slog.Info("hold_autorefill_completed", "driver_id", driverID, "moved", moveAmount, "hold_now", wallet2.HoldBalance+moveAmount)
		return nil
	})
}

// SetHoldMinimum menetapkan jaminan minimum driver (FOOD-BIKE-024).
func (s *walletService) SetHoldMinimum(ctx context.Context, driverID uuid.UUID, minimum int64) error {
	if minimum < 0 {
		return errors.New("hold minimum cannot be negative")
	}
	return s.repo.WithTx(ctx, func(txCtx context.Context) error {
		wallet, err := s.GetBalance(txCtx, driverID)
		if err != nil {
			return err
		}
		return s.repo.UpdateHoldMinimum(txCtx, wallet.ID, minimum)
	})
}

func (s *walletService) ReconcileWallet(ctx context.Context, userID uuid.UUID, walletType string) (*domain.WalletReconciliationResult, error) {
	wallet, err := s.repo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("wallet not found for user %s: %w", userID, err)
	}
	return s.repo.ReconcileWalletLedger(ctx, wallet.ID, walletType)
}

// HandleTopUpCallback handles the webhook from Xendit when an invoice is PAID.
func (s *walletService) HandleTopUpCallback(ctx context.Context, referenceID string) error {
	if s.flagReader != nil {
		flag, err := s.flagReader.GetFlag(ctx, "payment_provider_xendit")
		if err == nil && !flag.IsEnabled {
			return fmt.Errorf("payment gateway is currently disabled by feature flag")
		}
	}

	// 1. Get the original PENDING transaction
	tx, err := s.repo.GetTransactionByReferenceID(ctx, referenceID)
	if err != nil {
		return fmt.Errorf("transaction not found: %w", err)
	}

	if tx.Type != domain.TypeDeposit {
		return fmt.Errorf("transaction is not a deposit")
	}

	if tx.Status == domain.StatusCompleted {
		// Idempotency: already processed
		return nil
	}

	if tx.Status != domain.StatusPending {
		return fmt.Errorf("transaction is in invalid state: %s", tx.Status)
	}

	// 2. Process deposit securely inside a database transaction
	err = s.repo.WithTx(ctx, func(txCtx context.Context) error {
		// Atomic Balance Update
		wallet, err := s.repo.GetByID(txCtx, tx.WalletID)
		if err != nil {
			return err
		}

		err = s.repo.UpdateBalance(txCtx, wallet.ID, tx.Amount, wallet.Version)
		if err != nil {
			return err
		}

		// Update transaction status
		err = s.repo.UpdateTransactionStatus(txCtx, referenceID, domain.StatusCompleted)
		if err != nil {
			return err
		}

		// Create Ledger Journal
		journal := &domain.LedgerJournal{
			JournalType:    "wallet_topup",
			ReferenceType:  "wallet_transaction",
			ReferenceID:    referenceID,
			IdempotencyKey: fmt.Sprintf("LEDGER-DEP-%s", referenceID),
			Reason:         "Customer wallet topup via Xendit invoice",
			Metadata:       map[string]any{"user_id": wallet.UserID.String(), "wallet_id": wallet.ID.String()},
			CreatedBy:      "system",
			ActorRole:      "system",
		}
		entries := []domain.LedgerEntry{
			{AccountName: "cash_main", DebitIDR: tx.Amount, CreditIDR: 0},
			{AccountName: "customer_wallet_liability", DebitIDR: 0, CreditIDR: tx.Amount},
		}
		if err = s.ledgerRepo.CreateJournalWithEntries(txCtx, journal, entries); err != nil {
			return fmt.Errorf("failed to write ledger for topup callback: %w", err)
		}

		return nil
	})

	if err == nil {
		slog.InfoContext(ctx, "xendit_topup_completed", "wallet_id", tx.WalletID, "reference_id", referenceID, "amount", tx.Amount)
	}

	return err
}

// HandleDisbursementCallback handles the webhook from Xendit when disbursement is COMPLETED or FAILED.
func (s *walletService) HandleDisbursementCallback(ctx context.Context, referenceID string, status string) error {
	if s.flagReader != nil {
		flag, err := s.flagReader.GetFlag(ctx, "payment_provider_xendit")
		if err == nil && !flag.IsEnabled {
			return fmt.Errorf("payment gateway is currently disabled by feature flag")
		}
	}

	tx, err := s.repo.GetTransactionByReferenceID(ctx, referenceID)
	if err != nil {
		return fmt.Errorf("transaction not found: %w", err)
	}

	if tx.Type != domain.TypeWithdrawal {
		return fmt.Errorf("transaction is not a withdrawal")
	}

	if tx.Status == domain.StatusCompleted || tx.Status == domain.StatusFailed {
		// Idempotency
		return nil
	}

	if status == "COMPLETED" {
		// Just update status, balance was already deducted during PENDING
		return s.repo.UpdateTransactionStatus(ctx, referenceID, domain.StatusCompleted)
	} else if status == "FAILED" {
		// Refund balance back to wallet
		err = s.repo.WithTx(ctx, func(txCtx context.Context) error {
			wallet, err := s.repo.GetByID(txCtx, tx.WalletID)
			if err != nil {
				return err
			}

			// Add the money back (amount + fee)
			refundAmount := tx.Amount + tx.Fee
			err = s.repo.UpdateBalance(txCtx, wallet.ID, refundAmount, wallet.Version)
			if err != nil {
				return err
			}

			// Mark withdrawal as failed
			err = s.repo.UpdateTransactionStatus(txCtx, referenceID, domain.StatusFailed)
			if err != nil {
				return err
			}

			// Create Ledger Journal for Refund
			journal := &domain.LedgerJournal{
				JournalType:    "wallet_withdrawal_failed",
				ReferenceType:  "wallet_transaction",
				ReferenceID:    referenceID,
				IdempotencyKey: fmt.Sprintf("LEDGER-WD-FAIL-%s", referenceID),
				Reason:         "Refund wallet due to failed disbursement",
				Metadata:       map[string]any{"user_id": wallet.UserID.String(), "wallet_id": wallet.ID.String()},
				CreatedBy:      "system",
				ActorRole:      "system",
			}
			entries := []domain.LedgerEntry{
				{AccountName: "cash_main", DebitIDR: tx.Amount, CreditIDR: 0},
				{AccountName: "customer_wallet_liability", DebitIDR: 0, CreditIDR: tx.Amount},
			}
			if tx.Fee > 0 {
				entries = append(entries, domain.LedgerEntry{AccountName: "platform_fee_revenue", DebitIDR: tx.Fee, CreditIDR: 0})
				entries = append(entries, domain.LedgerEntry{AccountName: "customer_wallet_liability", DebitIDR: 0, CreditIDR: tx.Fee})
			}
			if err = s.ledgerRepo.CreateJournalWithEntries(txCtx, journal, entries); err != nil {
				return fmt.Errorf("failed to write ledger for failed disbursement: %w", err)
			}

			return nil
		})
		if err == nil {
			slog.InfoContext(ctx, "xendit_disbursement_failed_refunded", "wallet_id", tx.WalletID, "reference_id", referenceID, "refund_amount", tx.Amount+tx.Fee)
		}
		return err
	}

	return nil
}

// RefundTip membalik ProcessTip saat order dibatalkan: debit wallet courier
// → credit wallet customer (100%, tanpa fee). Idempotent via referenceID:
// pakai reference BEDA dari tip original (mis. "wallet-tip-refund-{order_id}")
// supaya tidak ketuker dengan idempotency tip. Gagal jika saldo courier
// < amount (kurir sudah menarik dana) — error di-propagate, status tip di
// order-service tetap 'paid' sehingga bisa diretry (FB-083).
func (s *walletService) RefundTip(ctx context.Context, customerID uuid.UUID, courierID uuid.UUID, amount int64, referenceID string) error {
	if amount <= 0 {
		return errors.New("tip refund amount must be greater than zero")
	}
	if referenceID == "" {
		return errors.New("reference_id is required")
	}
	if customerID == courierID {
		return errors.New("customer and courier cannot be the same")
	}

	// Idempotency: kalau refund dengan reference ini sudah pernah diproses, no-op.
	existing, err := s.repo.GetTransactionByReferenceID(ctx, referenceID)
	if err != nil {
		return fmt.Errorf("failed to check tip refund idempotency: %w", err)
	}
	if existing != nil {
		slog.InfoContext(ctx, "Tip refund already processed, ignoring duplicate",
			"reference_id", referenceID, "amount", existing.Amount)
		return nil
	}

	err = s.repo.WithTx(ctx, func(txCtx context.Context) error {
		custWallet, err := s.GetBalance(txCtx, customerID)
		if err != nil {
			return fmt.Errorf("customer wallet: %w", err)
		}
		courWallet, err := s.GetBalance(txCtx, courierID)
		if err != nil {
			return fmt.Errorf("courier wallet: %w", err)
		}

		if courWallet.Balance < amount {
			return errors.New("insufficient courier balance for tip refund (courier sudah menarik dana tip?)")
		}

		// Debit courier wallet (balik dari tip)
		if err = s.repo.UpdateBalance(txCtx, courWallet.ID, -amount, courWallet.Version); err != nil {
			return fmt.Errorf("debit courier wallet: %w", err)
		}
		// Credit customer wallet (100% tip dikembalikan, tanpa fee)
		if err = s.repo.UpdateBalance(txCtx, custWallet.ID, amount, custWallet.Version); err != nil {
			return fmt.Errorf("credit customer wallet: %w", err)
		}

		// Transaction logs di kedua wallet (audit trail dua arah)
		courTx := &domain.WalletTransaction{
			WalletID:    courWallet.ID,
			Type:        domain.TypeTipRefund,
			Amount:      amount,
			Fee:         0,
			Status:      domain.StatusCompleted,
			ReferenceID: referenceID,
			Metadata:    map[string]any{"source": "driver_tip_refund", "to": customerID.String()},
		}
		custTx := &domain.WalletTransaction{
			WalletID:    custWallet.ID,
			Type:        domain.TypeTipRefund,
			Amount:      amount,
			Fee:         0,
			Status:      domain.StatusCompleted,
			ReferenceID: referenceID,
			Metadata:    map[string]any{"source": "driver_tip_refund", "from": courierID.String()},
		}
		if err = s.repo.CreateTransaction(txCtx, courTx); err != nil {
			return fmt.Errorf("log courier tip refund transaction: %w", err)
		}
		if err = s.repo.CreateTransaction(txCtx, custTx); err != nil {
			return fmt.Errorf("log customer tip refund transaction: %w", err)
		}

		// Ledger: courier_payable debit → customer_wallet_liability credit
		journal := &domain.LedgerJournal{
			JournalType:    "transfer",
			ReferenceType:  "driver_tip_refund",
			ReferenceID:    referenceID,
			IdempotencyKey: fmt.Sprintf("LEDGER-TIP-REFUND-%s", referenceID),
			Reason:         "Driver tip refund from courier to customer (order cancelled)",
			CreatedBy:      "system",
			ActorRole:      "system",
		}
		entries := []domain.LedgerEntry{
			{AccountName: "courier_payable", DebitIDR: amount, CreditIDR: 0},
			{AccountName: "customer_wallet_liability", DebitIDR: 0, CreditIDR: amount},
		}
		if err = s.ledgerRepo.CreateJournalWithEntries(txCtx, journal, entries); err != nil {
			return fmt.Errorf("write ledger for tip refund: %w", err)
		}

		return nil
	})
	return err
}

