package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"time"
	"lancar/payment-service/internal/domain"


	"github.com/google/uuid"
)

type walletService struct {
	repo         domain.WalletRepository
	settingsRepo domain.SettingsRepository
	disbursement *DisbursementService
	db           *sql.DB
}

func NewWalletService(repo domain.WalletRepository, settingsRepo domain.SettingsRepository, db *sql.DB) domain.WalletService {
	return &walletService{
		repo:         repo,
		settingsRepo: settingsRepo,
		disbursement: NewDisbursementService(),
		db:           db,
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
	feeFixedStr, _ := s.settingsRepo.GetSetting(ctx, "topup_fee_fixed")
	feePercentStr, _ := s.settingsRepo.GetSetting(ctx, "topup_fee_percent")
	
	feeFixed, _ := strconv.ParseFloat(feeFixedStr, 64)
	feePercent, _ := strconv.ParseFloat(feePercentStr, 64)
	
	adminFee := feeFixed + (amount * feePercent / 100)
	totalAmount := amount + adminFee

	// 3. Create Transaction (Status: PENDING)
	orderID := fmt.Sprintf("TOPUP-%d-%d", time.Now().Unix(), uuid.New().ID())
	walletTx := &domain.WalletTransaction{
		WalletID:    wallet.ID,
		Type:        domain.TypeDeposit,
		Amount:      amount, // The net amount to be added to wallet
		Fee:         adminFee,
		Status:      domain.StatusPending,
		ReferenceID: orderID,
		Metadata:    map[string]any{"source": "web_portal", "total_paid": totalAmount},
	}
	err = s.repo.CreateTransaction(ctx, walletTx)
	if err != nil {
		return "", err
	}

	// 4. TODO: Call Midtrans Snap API with `totalAmount`
	// The snap_token should be for the total amount including fees.
	snapToken := fmt.Sprintf("mock_snap_token_%s", orderID)
	
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
		withdrawalFee = 5000.0 // Default fallback
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
	thresholdStr, _ := s.settingsRepo.GetSetting(ctx, "auto_disbursement_threshold")
	threshold, _ := strconv.ParseFloat(thresholdStr, 64)
	if threshold == 0 {
		threshold = 1000000 // Default 1jt
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
