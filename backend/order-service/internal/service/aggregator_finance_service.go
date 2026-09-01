package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
)

type aggregatorFinanceService struct {
	repo       domain.AggregatorFinanceRepository
	ledgerRepo domain.FinanceLedgerRepository
}

func terminalClaimStatus(status string) bool {
	status = strings.ToUpper(strings.TrimSpace(status))
	return status == "PAID" || status == "COMPENSATED"
}

func NewAggregatorFinanceService(repo domain.AggregatorFinanceRepository, ledgerRepo domain.FinanceLedgerRepository) domain.AggregatorFinanceService {
	return &aggregatorFinanceService{
		repo:       repo,
		ledgerRepo: ledgerRepo,
	}
}

func (s *aggregatorFinanceService) CreateInvoice(ctx context.Context, inv *domain.ProviderInvoice, items []domain.ProviderInvoiceItem) error {
	if inv.ID == uuid.Nil {
		inv.ID = uuid.New()
	}
	if inv.Status == "" {
		inv.Status = domain.ProviderInvoiceStatusPending
	}
	var totalClaimed int64
	for i := range items {
		if items[i].ID == uuid.Nil {
			items[i].ID = uuid.New()
		}
		items[i].InvoiceID = inv.ID
		if items[i].ResolutionStatus == "" {
			items[i].ResolutionStatus = "UNRESOLVED"
		}
		totalClaimed += items[i].ClaimedAmountIDR
	}
	inv.TotalClaimedIDR = totalClaimed
	return s.repo.CreateInvoice(ctx, inv, items)
}

func (s *aggregatorFinanceService) ReconcileInvoice(ctx context.Context, invoiceID uuid.UUID) (*domain.ProviderInvoice, error) {
	inv, err := s.repo.GetInvoiceByID(ctx, invoiceID)
	if err != nil {
		return nil, err
	}
	if inv == nil {
		return nil, fmt.Errorf("provider invoice %s not found", invoiceID)
	}

	var totalMatched, totalDiscrepancy int64
	for i := range inv.Items {
		item := &inv.Items[i]
		orderID, expectedNet, err := s.repo.GetOrderAndNetCostByAWB(ctx, item.AWBNumber)
		if err != nil {
			return nil, fmt.Errorf("failed looking up awb %s: %w", item.AWBNumber, err)
		}

		if orderID == nil {
			item.ExpectedNetIDR = 0
			item.DiscrepancyIDR = item.ClaimedAmountIDR
			item.DiscrepancyType = domain.DiscrepancyTypeMissingAWB
			totalDiscrepancy += item.DiscrepancyIDR
		} else {
			item.OrderID = orderID
			item.ExpectedNetIDR = expectedNet
			diff := item.ClaimedAmountIDR - expectedNet
			if diff == 0 {
				item.DiscrepancyIDR = 0
				item.DiscrepancyType = domain.DiscrepancyTypeMatched
				totalMatched += item.ClaimedAmountIDR
			} else if diff > 0 {
				item.DiscrepancyIDR = diff
				item.DiscrepancyType = domain.DiscrepancyTypeOvercharge
				totalDiscrepancy += diff
				totalMatched += expectedNet
			} else {
				item.DiscrepancyIDR = -diff
				item.DiscrepancyType = domain.DiscrepancyTypeUndercharge
				totalDiscrepancy += -diff
				totalMatched += item.ClaimedAmountIDR
			}
		}
	}

	if err := s.repo.UpdateInvoiceItems(ctx, inv.Items); err != nil {
		return nil, fmt.Errorf("failed updating invoice items: %w", err)
	}

	status := domain.ProviderInvoiceStatusReconciled
	if err := s.repo.UpdateInvoiceStatus(ctx, inv.ID, status, totalMatched, totalDiscrepancy, nil); err != nil {
		return nil, err
	}

	inv.Status = status
	inv.TotalMatchedIDR = totalMatched
	inv.TotalDiscrepancyIDR = totalDiscrepancy
	return inv, nil
}

func (s *aggregatorFinanceService) ApproveInvoice(ctx context.Context, invoiceID uuid.UUID, approverID uuid.UUID) error {
	inv, err := s.repo.GetInvoiceByID(ctx, invoiceID)
	if err != nil {
		return err
	}
	if inv == nil {
		return fmt.Errorf("invoice not found")
	}

	// Post double-entry ledger journal for approved provider payable
	if s.ledgerRepo != nil && inv.TotalMatchedIDR > 0 {
		journal := &domain.LedgerJournal{
			ID:             uuid.New(),
			JournalType:    "PROVIDER_INVOICE_APPROVAL",
			ReferenceType:  "PROVIDER_INVOICE",
			ReferenceID:    inv.InvoiceNumber,
			IdempotencyKey: fmt.Sprintf("provider_inv_%s", inv.InvoiceNumber),
			Reason:         fmt.Sprintf("Provider Payable Approval: %s (%s)", inv.InvoiceNumber, inv.ProviderName),
			CreatedBy:      approverID.String(),
			ActorRole:      "FINANCE_ADMIN",
		}
		entries := []domain.LedgerEntry{
			{
				ID:          uuid.New(),
				AccountName: "5101 - Freight Expense",
				DebitIDR:    inv.TotalMatchedIDR,
			},
			{
				ID:          uuid.New(),
				AccountName: fmt.Sprintf("2101 - Accounts Payable (%s)", inv.ProviderName),
				CreditIDR:   inv.TotalMatchedIDR,
			},
		}
		if _, err := s.ledgerRepo.CreateJournalReturningID(ctx, journal, entries); err != nil {
			return fmt.Errorf("failed posting ledger journal for provider invoice %s: %w", inv.InvoiceNumber, err)
		}
	}

	return s.repo.UpdateInvoiceStatus(ctx, inv.ID, domain.ProviderInvoiceStatusApproved, inv.TotalMatchedIDR, inv.TotalDiscrepancyIDR, &approverID)
}

func (s *aggregatorFinanceService) SubmitClaim(ctx context.Context, claim *domain.LogisticsExceptionClaim) (*domain.LogisticsExceptionClaim, error) {
	if claim == nil || claim.OrderID == uuid.Nil || strings.TrimSpace(claim.AWBNumber) == "" || strings.TrimSpace(claim.ProviderName) == "" {
		return nil, fmt.Errorf("order_id, awb_number, and provider_name are required")
	}
	claim.ExceptionType = strings.ToUpper(strings.TrimSpace(claim.ExceptionType))
	switch claim.ExceptionType {
	case "RETURN", "FAILED_DELIVERY", "LOST_CLAIM", "DAMAGED_CLAIM":
	default:
		return nil, fmt.Errorf("unsupported logistics exception type %q", claim.ExceptionType)
	}
	if (claim.ExceptionType == "LOST_CLAIM" || claim.ExceptionType == "DAMAGED_CLAIM") && len(claim.EvidenceURLs) == 0 {
		return nil, fmt.Errorf("evidence_urls is required for %s", claim.ExceptionType)
	}
	if claim.ID == uuid.Nil {
		claim.ID = uuid.New()
	}
	if claim.Status == "" {
		claim.Status = "SUBMITTED"
	}

	policy, err := s.repo.GetPolicyByTypeAndProvider(ctx, claim.ExceptionType, claim.ProviderName)
	if err != nil {
		return nil, err
	}
	if policy != nil {
		claim.FeeBorneBy = policy.FeeBorneBy
		// Calculate dynamic compensation based on policy
		baseAmt := policy.FeeAmountIDR
		if policy.FeePctOrder > 0 {
			baseAmt += int64(float64(claim.ClaimAmountIDR) * (policy.FeePctOrder / 100.0))
		}
		if policy.FeeBorneBy == "PROVIDER" {
			claim.ProviderPayoutIDR = baseAmt
			claim.MerchantCompensationIDR = baseAmt
		} else if policy.FeeBorneBy == "MERCHANT" {
			claim.MerchantCompensationIDR = 0
		}
	}

	if err := s.repo.CreateClaim(ctx, claim); err != nil {
		return nil, err
	}
	return claim, nil
}

func (s *aggregatorFinanceService) ResolveClaim(ctx context.Context, claimID uuid.UUID, status string) error {
	claim, err := s.repo.GetClaimByID(ctx, claimID)
	if err != nil {
		return err
	}
	if claim == nil {
		return fmt.Errorf("claim not found")
	}
	status = strings.ToUpper(strings.TrimSpace(status))
	if status == "" {
		return fmt.Errorf("claim status is required")
	}
	if claim.Status == status {
		return nil
	}
	if terminalClaimStatus(claim.Status) {
		return fmt.Errorf("claim %s is already terminal with status %s", claim.ID, claim.Status)
	}

	var journalID *uuid.UUID
	if s.ledgerRepo != nil && (status == "COMPENSATED" || status == "PAID") && claim.MerchantCompensationIDR > 0 {
		journal := &domain.LedgerJournal{
			ID:             uuid.New(),
			JournalType:    "EXCEPTION_CLAIM_COMPENSATION",
			ReferenceType:  "EXCEPTION_CLAIM",
			ReferenceID:    claim.AWBNumber,
			IdempotencyKey: fmt.Sprintf("claim_comp_%s", claim.ID),
			Reason:         fmt.Sprintf("Logistics Exception Compensation: %s (%s)", claim.AWBNumber, claim.ExceptionType),
			CreatedBy:      "SYSTEM",
			ActorRole:      "SYSTEM",
		}
		entries := []domain.LedgerEntry{
			{
				ID:          uuid.New(),
				AccountName: "1104 - Provider Claim Receivable",
				DebitIDR:    claim.MerchantCompensationIDR,
			},
			{
				ID:          uuid.New(),
				AccountName: "2102 - Merchant Compensation Payable",
				CreditIDR:   claim.MerchantCompensationIDR,
			},
		}
		if jid, err := s.ledgerRepo.CreateJournalReturningID(ctx, journal, entries); err == nil && jid != uuid.Nil {
			journalID = &jid
		}
	}

	return s.repo.UpdateClaimStatus(ctx, claim.ID, status, journalID)
}
