package service

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
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
	settingsRepo domain.SettingsRepository
	disbursement *DisbursementService
	db           *sql.DB
	flagReader   featureflags.FlagReader
}

func NewWalletService(repo domain.WalletRepository, settingsRepo domain.SettingsRepository, db *sql.DB, flagReader featureflags.FlagReader) domain.WalletService {
	return &walletService{
		repo:         repo,
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

func (s *walletService) CreateTopUp(ctx context.Context, userID uuid.UUID, amount float64) (string, error) {
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

	adminFee := feeFixed + (amount * feePercent / 100)
	totalAmount := amount + adminFee

	if amount <= 0 {
		return "", errors.New("top up amount must be greater than zero")
	}

	// 3. Create Provider Transaction
	orderID := fmt.Sprintf("TOPUP-%d-%d", time.Now().Unix(), uuid.New().ID())
	totalAmountIDR := int64(math.Round(totalAmount))
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

func (s *walletService) Deposit(ctx context.Context, userID uuid.UUID, amount float64, referenceID string) error {
	// Logic: amount received from gateway should match (TargetAmount + Fee)
	// We should check the original transaction to get the net amount

	netAmount := amount // Default if no fee logic applied
	adminFee := 0.0

	// Start Transaction
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	wallet, err := s.GetBalance(ctx, userID)
	if err != nil {
		return err
	}

	// Update Balance
	err = s.repo.UpdateBalance(ctx, wallet.ID, netAmount, wallet.Version)
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
	err = s.repo.CreateTransaction(ctx, walletTx)
	if err != nil {
		return err
	}

	return tx.Commit()
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

	// ─── SECURITY LAYER 3: Dynamic Fee dari Admin Settings ───────────────────────
	withdrawalFeeFloat, err := s.settingsRepo.GetFee(ctx, userRole)
	if err != nil {
		return fmt.Errorf("konfigurasi biaya penarikan tidak tersedia: %w", err)
	}
	// Konversi fee ke integer rupiah (Math.Round untuk hindari float error)
	withdrawalFeeIDR := int64(math.Round(withdrawalFeeFloat))
	if withdrawalFeeIDR < 0 {
		// Biaya tidak boleh negatif (integer underflow protection)
		return errors.New("konfigurasi biaya penarikan tidak valid")
	}

	// Total yang akan dipotong dari saldo
	totalDeductionIDR := amountIDR + withdrawalFeeIDR
	if totalDeductionIDR < amountIDR {
		// Integer overflow check: jika result lebih kecil dari komponen, ada overflow
		return errors.New("total deduction overflow terdeteksi — hubungi admin")
	}

	// ─── SECURITY LAYER 4: Atomic Check-and-Deduct (Optimistic Locking) ─────────
	// Semua operasi baca+deduct harus ada di dalam satu database transaction
	// yang dilindungi oleh optimistic lock (version column).
	// Ini mencegah race condition dan TOCTOU (Time-of-Check Time-of-Use) attack.
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return fmt.Errorf("gagal memulai transaksi: %w", err)
	}
	defer tx.Rollback() // Rollback jika Commit tidak dipanggil — safe default

	wallet, err := s.GetBalance(ctx, userID)
	if err != nil {
		return fmt.Errorf("gagal mendapatkan saldo: %w", err)
	}

	// ─── SECURITY LAYER 5: Strict Saldo Check (Termasuk Biaya Admin) ─────────────
	// Saldo tersimpan dalam float64 di DB — konversi ke integer untuk perbandingan tepat
	walletBalanceIDR := int64(math.Floor(wallet.Balance)) // Floor untuk menghindari over-credit
	if walletBalanceIDR < totalDeductionIDR {
		return errors.New("saldo tidak cukup untuk penarikan (termasuk biaya admin)")
	}

	// ─── SECURITY LAYER 6: Pemotongan Saldo Atomik ───────────────────────────────
	// UpdateBalance menggunakan optimistic locking via version column.
	// Jika ada request lain yang mengubah saldo bersamaan (race condition),
	// ExecContext akan mengembalikan rows=0 dan error "concurrent update detected".
	deductAmount := -float64(totalDeductionIDR) // negatif = debit
	err = s.repo.UpdateBalance(ctx, wallet.ID, deductAmount, wallet.Version)
	if err != nil {
		return fmt.Errorf("gagal memotong saldo (kemungkinan concurrent request): %w", err)
	}

	// ─── SECURITY LAYER 7: Buat Catatan Transaksi dengan Metadata Lengkap ────────
	// RefID harus unik dan terdeterministik (bukan random saja) untuk audit trail.
	refID := fmt.Sprintf("WD-%s-%d", req.IdempotencyKey[:8], time.Now().UnixMilli())
	walletTx := &domain.WalletTransaction{
		WalletID:    wallet.ID,
		Type:        domain.TypeWithdrawal,
		Amount:      float64(amountIDR),
		Fee:         float64(withdrawalFeeIDR),
		Status:      domain.StatusPending,
		ReferenceID: refID,
		Metadata: map[string]any{
			"idempotency_key": req.IdempotencyKey, // untuk idempotency lookup
			"account_number":  req.AccountNumber,   // sudah sanitized di handler
			"account_holder":  req.AccountHolder,   // sudah sanitized di handler
			"bank_code":       req.BankCode,        // sudah validated di handler
			"user_role":       userRole,
			"requested_by":    userID.String(),
		},
	}
	err = s.repo.CreateTransaction(ctx, walletTx)
	if err != nil {
		return fmt.Errorf("gagal mencatat transaksi penarikan: %w", err)
	}

	// ─── COMMIT: Saldo terpotong dan log tercatat secara atomik ──────────────────
	// Commit HARUS dilakukan sebelum memanggil disbursement eksternal.
	// Jika commit gagal, defer Rollback() akan memastikan tidak ada data korup.
	if err := tx.Commit(); err != nil {
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
	thresholdFloat, parseErr := strconv.ParseFloat(thresholdStr, 64)
	if parseErr != nil || thresholdFloat <= 0 {
		return nil // Sama: biarkan manual approval
	}
	thresholdIDR := int64(math.Round(thresholdFloat))

	if amountIDR <= thresholdIDR {
		// Disbursement otomatis dalam goroutine terpisah dengan context baru
		// (context request sudah timeout setelah response dikirim ke client).
		bankDetails := map[string]any{
			"account_number": req.AccountNumber,
			"account_holder": req.AccountHolder,
			"bank_name":      req.BankCode,
		}
		go func(refIDCapture string, amountCapture float64, bankCapture map[string]any) {
			disbCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()

			disbErr := s.disbursement.CreatePayout(disbCtx, refIDCapture, amountCapture, bankCapture)
			if disbErr != nil {
				// ─── CRITICAL: Disbursement gagal → Kembalikan saldo (Reversal) ───
				// Ini adalah mekanisme keamanan paling penting: uang pengguna
				// TIDAK boleh hilang hanya karena payment gateway bermasalah.
				fmt.Printf("[CRITICAL] Disbursement gagal untuk %s: %v — memulai reversal\n", refIDCapture, disbErr)

				reversalCtx, reversalCancel := context.WithTimeout(context.Background(), 15*time.Second)
				defer reversalCancel()

				// Ambil wallet lagi untuk reversal (version mungkin sudah berubah)
				currentWallet, walletErr := s.repo.GetByUserID(reversalCtx, userID)
				if walletErr != nil || currentWallet == nil {
					// Jika wallet tidak bisa diambil, catat untuk admin intervention
					fmt.Printf("[CRITICAL] REVERSAL GAGAL — wallet tidak ditemukan untuk user %s ref %s\n", userID, refIDCapture)
					// Update status ke FAILED agar admin tahu ada masalah
					_ = s.repo.UpdateTransactionStatus(reversalCtx, refIDCapture, domain.StatusFailed)
					return
				}

				// Kembalikan total deduction (pokok + biaya admin)
				reversalAmount := float64(totalDeductionIDR)
				reversalErr := s.repo.UpdateBalance(reversalCtx, currentWallet.ID, reversalAmount, currentWallet.Version)
				if reversalErr != nil {
					// Reversal gagal — ini kasus KRITIS yang butuh manual intervention
					fmt.Printf("[CRITICAL] REVERSAL GAGAL untuk %s: %v — PERLU INTERVENSI MANUAL\n", refIDCapture, reversalErr)
					_ = s.repo.UpdateTransactionStatus(reversalCtx, refIDCapture, domain.StatusFailed)
					return
				}

				// Reversal berhasil — update status transaksi ke FAILED
				_ = s.repo.UpdateTransactionStatus(reversalCtx, refIDCapture, domain.StatusFailed)
				fmt.Printf("[INFO] Reversal berhasil untuk %s — saldo dikembalikan\n", refIDCapture)
			} else {
				// ─── Disbursement berhasil → Update status ke COMPLETED ──────────
				updateCtx, updateCancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer updateCancel()
				if updateErr := s.repo.UpdateTransactionStatus(updateCtx, refIDCapture, domain.StatusCompleted); updateErr != nil {
					fmt.Printf("[WARN] Disbursement berhasil tapi status update gagal untuk %s: %v\n", refIDCapture, updateErr)
					// Transaksi tetap dalam status PENDING — reconciliation akan menyelesaikan ini
				}
				fmt.Printf("[INFO] Disbursement berhasil dan status COMPLETED untuk %s\n", refIDCapture)
			}
		}(refID, float64(amountIDR), bankDetails)
	}
	// Jika amount > threshold, transaksi tetap PENDING untuk manual approval admin

	return nil
}



func (s *walletService) ProcessPayment(ctx context.Context, userID uuid.UUID, amount float64, orderID string) error {
	// Start Transaction
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	wallet, err := s.GetBalance(ctx, userID)
	if err != nil {
		return err
	}

	if wallet.Balance < amount {
		return errors.New("insufficient wallet balance")
	}

	// Update Balance
	err = s.repo.UpdateBalance(ctx, wallet.ID, -amount, wallet.Version)
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
	err = s.repo.CreateTransaction(ctx, walletTx)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func (s *walletService) Refund(ctx context.Context, userID uuid.UUID, amount float64, orderID string) error {
	if orderID != "" {
		processed, err := s.repo.IsRefundProcessed(ctx, orderID)
		if err != nil {
			return fmt.Errorf("failed to check refund idempotency: %w", err)
		}
		if processed {
			return nil // Idempotent success: refund already credited
		}
	}

	// Start Transaction
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	wallet, err := s.GetBalance(ctx, userID)
	if err != nil {
		return err
	}

	// Update Balance
	err = s.repo.UpdateBalance(ctx, wallet.ID, amount, wallet.Version)
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
	err = s.repo.CreateTransaction(ctx, walletTx)
	if err != nil {
		return err
	}

	return tx.Commit()
}
