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

func (s *walletService) Withdraw(ctx context.Context, userID uuid.UUID, userRole string, amount float64, bankDetails map[string]any) error {
	// 1. Get Dynamic Fee from Admin Settings
	withdrawalFee, err := s.settingsRepo.GetFee(ctx, userRole)
	if err != nil {
		return err
	}

	totalDeduction := amount + withdrawalFee

	// 2. Start Transaction for Atomic Check-and-Deduct
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	wallet, err := s.GetBalance(ctx, userID)
	if err != nil {
		return err
	}

	// 3. SECURITY: Strict Balance Check
	if wallet.Balance < totalDeduction {
		return errors.New("saldo tidak cukup untuk penarikan (termasuk biaya admin)")
	}

	// 4. Deduct Balance
	err = s.repo.UpdateBalance(ctx, wallet.ID, -totalDeduction, wallet.Version)
	if err != nil {
		return err
	}

	// 5. Create Transaction Log
	refID := fmt.Sprintf("WD-%d-%d", time.Now().Unix(), uuid.New().ID())
	walletTx := &domain.WalletTransaction{
		WalletID:    wallet.ID,
		Type:        domain.TypeWithdrawal,
		Amount:      amount,
		Fee:         withdrawalFee,
		Status:      domain.StatusPending,
		ReferenceID: refID,
		Metadata:    bankDetails,
	}
	err = s.repo.CreateTransaction(ctx, walletTx)
	if err != nil {
		return err
	}

	// 6. Commit Transaction First to ensure persistence
	if err := tx.Commit(); err != nil {
		return err
	}

	// 7. AUTO DISBURSEMENT (Standard Enterprise Policy)
	// If amount is small, we can trigger automatic payout
	thresholdStr, err := s.settingsRepo.GetSetting(ctx, "auto_disbursement_threshold")
	if err != nil {
		return fmt.Errorf("auto_disbursement_threshold is not configured: %w", err)
	}
	threshold, err := strconv.ParseFloat(thresholdStr, 64)
	if err != nil || threshold <= 0 {
		return fmt.Errorf("auto_disbursement_threshold is invalid: %w", err)
	}

	if amount <= threshold {
		// Attempt auto payout (asynchronous or direct)
		go func() {
			err := s.disbursement.CreatePayout(context.Background(), refID, amount, bankDetails)
			if err != nil {
				fmt.Printf("[ERROR] Auto-disbursement failed for %s: %v\n", refID, err)
				// In a real system, we would mark status as FAILED or alert Admin
			} else {
				// TODO: Update transaction status to COMPLETED in database
				fmt.Printf("[SUCCESS] Auto-disbursement triggered for %s\n", refID)
			}
		}()
	}

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
	}
	err = s.repo.CreateTransaction(ctx, walletTx)
	if err != nil {
		return err
	}

	return tx.Commit()
}
