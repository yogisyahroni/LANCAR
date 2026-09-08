package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"

	"tembus/order-service/internal/domain"
)

type payoutService struct {
	repo       domain.PayoutRepository
	gateway    domain.PayoutGateway
	relayRepo  domain.RelayRepository // for courier bank info and order leg lookups
	taxRepo    domain.TaxRepository
	configRepo domain.ConfigRepository
	ledgerRepo domain.FinanceLedgerRepository
}

func NewPayoutService(
	repo domain.PayoutRepository,
	gateway domain.PayoutGateway,
	relayRepo domain.RelayRepository,
	taxRepo domain.TaxRepository,
	configRepo domain.ConfigRepository,
	ledgerRepo domain.FinanceLedgerRepository,
) domain.PayoutService {
	return &payoutService{
		repo:       repo,
		gateway:    gateway,
		relayRepo:  relayRepo,
		taxRepo:    taxRepo,
		configRepo: configRepo,
		ledgerRepo: ledgerRepo,
	}
}

// CalculateOrderLegPayout creates a payout record for a completed order leg.
// It resolves the courier_id from the order_leg record rather than using a placeholder.
func (s *payoutService) CalculateOrderLegPayout(ctx context.Context, orderLegID uuid.UUID, fee int, penalty int, idleComp int) (*domain.PayoutRecord, error) {
	// A delivery completion can be replayed by webhook/worker retry. Resolve
	// the existing leg payout first; the DB unique index below is the final
	// concurrency guard for two workers racing this read.
	existing, lookupErr := s.repo.GetByOrderLegID(ctx, orderLegID)
	if lookupErr == nil && existing != nil {
		return existing, nil
	}
	if lookupErr != nil && !errors.Is(lookupErr, domain.ErrNotFound) {
		return nil, fmt.Errorf("failed to check existing payout for order leg %s: %w", orderLegID, lookupErr)
	}

	// 1. Resolve the courier who was assigned to this leg from the DB
	courierID, err := s.relayRepo.GetCourierIDForOrderLeg(ctx, orderLegID)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve courier for order leg %s: %w", orderLegID, err)
	}
	if courierID == uuid.Nil {
		return nil, fmt.Errorf("order leg %s has no assigned courier — cannot create payout", orderLegID)
	}

	// 2. Calculate net earnings
	net := fee - penalty + idleComp
	if net < 0 {
		net = 0
	}

	pph21 := s.calculatePPh21(ctx, courierID, net)

	now := time.Now()
	batchDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	payoutID := uuid.New()
	record := &domain.PayoutRecord{
		ID:                    payoutID,
		CourierID:             courierID,
		OrderLegID:            &orderLegID,
		Type:                  domain.PayoutTypeLegFee,
		Currency:              "IDR",
		CurrencyMinorUnit:     0,
		GrossMinor:            int64(fee),
		PenaltyMinor:          int64(penalty),
		IdleCompensationMinor: int64(idleComp),
		NetMinor:              int64(net),
		PPh21Minor:            int64(pph21),
		GrossIDR:              fee,
		PenaltyIDR:            penalty,
		IdleCompensationIDR:   idleComp,
		NetIDR:                net,
		PPh21IDR:              pph21,
		DisbursementStatus:    domain.PayoutStatusPending,
		BatchDate:             &batchDate,
		CreatedAt:             now,
		UpdatedAt:             now,
	}

	if err := s.repo.CreatePayout(ctx, record); err != nil {
		// The unique leg index can win a concurrent race after both workers
		// passed the read above. Return the winner instead of surfacing a
		// duplicate-key failure to the delivery worker.
		if existing, lookupErr := s.repo.GetByOrderLegID(ctx, orderLegID); lookupErr == nil && existing != nil {
			return existing, nil
		}
		return nil, fmt.Errorf("failed to create payout record: %w", err)
	}

	if s.ledgerRepo != nil {
		entries := []domain.LedgerEntry{
			{ID: uuid.New(), AccountName: "delivery_fee_expense", Currency: "IDR", CurrencyMinorUnit: 0, DebitMinor: int64(fee), DebitIDR: int64(fee), CreatedAt: now},
		}
		if idleComp > 0 {
			entries = append(entries, domain.LedgerEntry{
				ID:                uuid.New(),
				AccountName:       "courier_idle_compensation_expense",
				Currency:          "IDR",
				CurrencyMinorUnit: 0,
				DebitMinor:        int64(idleComp),
				DebitIDR:          int64(idleComp),
				CreatedAt:         now,
			})
		}
		if penalty > 0 {
			entries = append(entries, domain.LedgerEntry{
				ID:                uuid.New(),
				AccountName:       "courier_penalty_revenue",
				Currency:          "IDR",
				CurrencyMinorUnit: 0,
				CreditMinor:       int64(penalty),
				CreditIDR:         int64(penalty),
				CreatedAt:         now,
			})
		}
		if pph21 > 0 {
			entries = append(entries, domain.LedgerEntry{
				ID:                uuid.New(),
				AccountName:       "tax_payable_pph21",
				Currency:          "IDR",
				CurrencyMinorUnit: 0,
				CreditMinor:       int64(pph21),
				CreditIDR:         int64(pph21),
				CreatedAt:         now,
			})
		}
		payableAmount := int64(net - pph21)
		if payableAmount > 0 {
			entries = append(entries, domain.LedgerEntry{
				ID:                uuid.New(),
				AccountName:       "courier_payable",
				Currency:          "IDR",
				CurrencyMinorUnit: 0,
				CreditMinor:       payableAmount,
				CreditIDR:         payableAmount,
				CreatedAt:         now,
			})
		}

		journal := &domain.LedgerJournal{
			ID:             uuid.New(),
			JournalType:    "courier_payout_accrual",
			ReferenceType:  "payout_record",
			ReferenceID:    payoutID.String(),
			IdempotencyKey: fmt.Sprintf("PAYOUT-ACCRUAL-%s", payoutID.String()),
			Reason:         "Accrual for courier payout",
			Metadata: map[string]any{
				"courier_id":   courierID.String(),
				"order_leg_id": orderLegID.String(),
			},
			CreatedBy: "system",
			ActorRole: "system",
			Currency:  "IDR", CurrencyMinorUnit: 0,
			CreatedAt: now,
		}
		_ = s.ledgerRepo.CreateJournalWithEntries(ctx, journal, entries)
	}

	return record, nil
}

// TriggerBatchPayout processes all pending payout records.
// It fetches each courier's real bank account info from the DB before disbursement.
// Records with missing bank info are skipped with a warning — not silently processed.
func (s *payoutService) TriggerBatchPayout(ctx context.Context) error {
	// 1. Get all pending payouts
	pending, err := s.repo.GetAllPendingPayouts(ctx)
	if err != nil {
		return fmt.Errorf("failed to get pending payouts: %w", err)
	}

	if len(pending) == 0 {
		log.Println("[PayoutService] No pending payouts to process.")
		return nil
	}

	// 2. Group by courier and currency. Summing records from different
	// currencies would create a financially meaningless integer.
	type payoutGroupKey struct {
		courierID uuid.UUID
		currency  string
		minorUnit int
	}
	grouped := make(map[payoutGroupKey][]domain.PayoutRecord)
	for i := range pending {
		pending[i].ApplyMoneyContract()
		key := payoutGroupKey{courierID: pending[i].CourierID, currency: pending[i].Currency, minorUnit: pending[i].CurrencyMinorUnit}
		grouped[key] = append(grouped[key], pending[i])
	}

	// 3. Process each courier's batch
	for groupKey, records := range grouped {
		courierID := groupKey.courierID
		// 3a. Fetch real bank account info from courier_profiles
		bankInfo, err := s.relayRepo.GetCourierBankInfo(ctx, courierID)
		if err != nil {
			log.Printf("[PayoutService] WARN: Cannot fetch bank info for courier %s, skipping batch: %v", courierID, err)
			continue
		}

		// 3b. Safety guard: skip if bank info is incomplete
		if bankInfo.BankCode == nil || *bankInfo.BankCode == "" ||
			bankInfo.BankAccountNumber == nil || *bankInfo.BankAccountNumber == "" ||
			bankInfo.BankAccountName == nil || *bankInfo.BankAccountName == "" {
			log.Printf("[PayoutService] WARN: Courier %s has incomplete bank info (bank_code=%v, account=%v). Skipping payout until courier completes profile.",
				courierID, bankInfo.BankCode, bankInfo.BankAccountNumber)
			continue
		}

		// 3c. Sum net payout in the explicit currency context (net minus tax).
		totalMoney, err := domain.NewMoney(groupKey.currency, 0)
		if err != nil {
			return fmt.Errorf("invalid payout currency for courier %s: %w", courierID, err)
		}
		for _, r := range records {
			line, lineErr := domain.NewMoney(groupKey.currency, r.NetMinor-r.PPh21Minor)
			if lineErr != nil {
				return fmt.Errorf("invalid payout amount for courier %s: %w", courierID, lineErr)
			}
			totalMoney, err = totalMoney.Add(line)
			if err != nil {
				return fmt.Errorf("sum payout for courier %s: %w", courierID, err)
			}
		}

		if totalMoney.AmountMinor <= 0 {
			log.Printf("[PayoutService] Courier %s has zero or negative net payout, skipping.", courierID)
			continue
		}

		// 3d. Disburse to the courier's real bank account
		description := fmt.Sprintf("TEMBUS Delivery Payout - Batch %s", time.Now().Format("2006-01-02"))
		var ref string
		var gatewayErr error
		if moneyGateway, ok := s.gateway.(domain.MoneyPayoutGateway); ok {
			ref, gatewayErr = moneyGateway.DisburseMoney(ctx, totalMoney, *bankInfo.BankCode, *bankInfo.BankAccountNumber, description)
		} else if totalMoney.Currency == "IDR" {
			ref, gatewayErr = s.gateway.Disburse(ctx, int(totalMoney.AmountMinor), *bankInfo.BankCode, *bankInfo.BankAccountNumber, description)
		} else {
			log.Printf("[PayoutService] WARN: Currency-aware payout gateway is required for %s; leaving courier %s batch pending", totalMoney.Currency, courierID)
			continue
		}

		status := domain.PayoutStatusCompleted
		var errReason *string
		if gatewayErr != nil {
			status = domain.PayoutStatusFailed
			reason := gatewayErr.Error()
			errReason = &reason
			log.Printf("[PayoutService] ERROR: Failed to disburse to courier %s (bank=%s, account=%s): %v",
				courierID, *bankInfo.BankCode, *bankInfo.BankAccountNumber, gatewayErr)
		} else {
			log.Printf("[PayoutService] SUCCESS: Disbursed %d %s minor units to courier %s (ref=%s)", totalMoney.AmountMinor, totalMoney.Currency, courierID, ref)
			if s.ledgerRepo != nil {
				now := time.Now()
				entries := []domain.LedgerEntry{
					{ID: uuid.New(), AccountName: "courier_payable", Currency: totalMoney.Currency, CurrencyMinorUnit: totalMoney.MinorUnit, DebitMinor: totalMoney.AmountMinor, DebitIDR: legacyPayoutIDR(totalMoney), CreatedAt: now},
					{ID: uuid.New(), AccountName: "bank_disbursement_account", Currency: totalMoney.Currency, CurrencyMinorUnit: totalMoney.MinorUnit, CreditMinor: totalMoney.AmountMinor, CreditIDR: legacyPayoutIDR(totalMoney), CreatedAt: now},
				}
				journal := &domain.LedgerJournal{
					ID:             uuid.New(),
					JournalType:    "courier_payout_disbursement",
					ReferenceType:  "disbursement_ref",
					ReferenceID:    ref,
					IdempotencyKey: fmt.Sprintf("PAYOUT-DISB-%s-%s", courierID.String(), time.Now().Format("20060102")),
					Reason:         "Batch courier payout disbursement",
					Metadata: map[string]any{
						"courier_id":      courierID.String(),
						"gateway_ref":     ref,
						"total_net_minor": totalMoney.AmountMinor,
						"currency":        totalMoney.Currency,
					},
					CreatedBy: "system",
					ActorRole: "system",
					Currency:  totalMoney.Currency, CurrencyMinorUnit: totalMoney.MinorUnit,
					CreatedAt: now,
				}
				_ = s.ledgerRepo.CreateJournalWithEntries(ctx, journal, entries)
			}
		}

		// 3e. Update all record statuses
		for _, r := range records {
			if updateErr := s.repo.UpdatePayoutStatus(ctx, r.ID, status, &ref, errReason); updateErr != nil {
				log.Printf("[PayoutService] ERROR: Failed to update payout status for record %s: %v", r.ID, updateErr)
			}
		}
	}

	return nil
}

// GetCourierEarnings returns summarized earnings for a courier over a given period.
func (s *payoutService) GetCourierEarnings(ctx context.Context, courierID uuid.UUID, period string) (*domain.CourierEarningsSummary, error) {
	now := time.Now()
	var from time.Time

	switch period {
	case "today":
		from = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	case "this_week":
		weekday := int(now.Weekday())
		if weekday == 0 {
			weekday = 7 // treat Sunday as day 7
		}
		from = now.AddDate(0, 0, -(weekday - 1))
		from = time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, from.Location())
	case "this_month":
		from = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	default:
		// Default to current month
		from = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	}

	return s.repo.GetEarningsSummary(ctx, courierID, from, now)
}

// calculatePPh21 applies Indonesian income tax (PPh 21) to courier earnings.
func (s *payoutService) calculatePPh21(ctx context.Context, courierID uuid.UUID, amount int) int {
	hasNPWP, err := s.taxRepo.HasNPWP(ctx, courierID.String())
	if err != nil {
		log.Printf("[PayoutService] WARN: Failed to check NPWP for courier %s, assuming NO NPWP: %v", courierID, err)
		hasNPWP = false
	}

	var ratePct float64
	if hasNPWP {
		ratePct = s.configRepo.GetFloatConfig(ctx, "PPH21_COURIER_RATE_NPWP", 2.5)
	} else {
		ratePct = s.configRepo.GetFloatConfig(ctx, "PPH21_COURIER_RATE_NON_NPWP", 3.0)
	}

	tax, err := domain.LegacyIDR(int64(amount)).MultiplyPercent(ratePct)
	if err != nil {
		log.Printf("[PayoutService] WARN: Failed to calculate exact PPh21 for courier %s: %v", courierID, err)
		return 0
	}
	return int(tax.AmountMinor)
}

func legacyPayoutIDR(money domain.Money) int64 {
	if money.Currency == "IDR" {
		return money.AmountMinor
	}
	return 0
}
