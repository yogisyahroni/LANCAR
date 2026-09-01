package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
)

type insuranceService struct {
	insuranceRepo domain.InsuranceRepository
	notifService  domain.NotificationService
	configRepo    domain.ConfigRepository
}

func NewInsuranceService(insuranceRepo domain.InsuranceRepository, notifService domain.NotificationService, configRepo domain.ConfigRepository) domain.InsuranceService {
	return &insuranceService{
		insuranceRepo: insuranceRepo,
		notifService:  notifService,
		configRepo:    configRepo,
	}
}

func (s *insuranceService) EnrollBPJSTK(ctx context.Context, courierID uuid.UUID) (*domain.CourierInsurance, error) {
	validFrom := time.Now()
	providerName := strings.TrimSpace(os.Getenv("BPJS_TK_PROVIDER_NAME"))
	if providerName == "" {
		providerName = "bpjs_ketenagakerjaan"
	}

	coverageIDR := s.configRepo.GetIntConfig(ctx, "bpjstk_coverage_idr", 50000000)
	premiumMonthlyIDR := s.configRepo.GetIntConfig(ctx, "bpjstk_premium_monthly_idr", 16800)
	companyShareIDR := s.configRepo.GetIntConfig(ctx, "bpjstk_company_share_idr", 10000)
	courierShareIDR := s.configRepo.GetIntConfig(ctx, "bpjstk_courier_share_idr", 6800)

	ins := &domain.CourierInsurance{
		CourierID:         courierID,
		Type:              "bpjs_tk",
		Provider:          providerName,
		PolicyNumber:      "",
		CoverageIDR:       coverageIDR,
		PremiumMonthlyIDR: premiumMonthlyIDR,
		CompanyShareIDR:   companyShareIDR,
		CourierShareIDR:   courierShareIDR,
		Status:            domain.InsuranceStatusPendingProviderActivation,
		ValidFrom:         validFrom,
		ValidUntil:        nil,
	}

	err := s.insuranceRepo.CreateCourierInsurance(ctx, ins)
	if err != nil {
		return nil, fmt.Errorf("failed to enroll BPJS TK: %w", err)
	}

	return ins, nil
}

func (s *insuranceService) CalculateOrderPremium(ctx context.Context, declaredValue int) (int, int) {
	premiumRate := s.configRepo.GetFloatConfig(ctx, "insurance_premium_rate", 0.002)
	minPremium := s.configRepo.GetIntConfig(ctx, "insurance_min_premium", 1000)

	premium := int(float64(declaredValue) * premiumRate)
	if premium < minPremium {
		premium = minPremium
	}

	maxCoverage := s.configRepo.GetIntConfig(ctx, "insurance_max_coverage_idr", 10000000)

	// Coverage limit is 100% of declared value, capped at maxCoverage
	coverageLimit := declaredValue
	if coverageLimit > maxCoverage {
		coverageLimit = maxCoverage
	}

	return premium, coverageLimit
}

func (s *insuranceService) CreateOrderInsurance(ctx context.Context, orderID uuid.UUID, declaredValue int) (*domain.OrderInsurance, error) {
	if declaredValue <= 0 {
		return nil, fmt.Errorf("%w: declared value must be positive", domain.ErrInsuranceClaimInvalid)
	}
	premium, coverageLimit := s.CalculateOrderPremium(ctx, declaredValue)

	ins := &domain.OrderInsurance{
		OrderID:       orderID,
		DeclaredValue: declaredValue,
		PremiumFee:    premium,
		CoverageLimit: coverageLimit,
		Status:        domain.InsuranceStatusPendingProviderActivation,
		Provider:      orderInsuranceProviderName(),
	}

	err := s.insuranceRepo.CreateOrderInsurance(ctx, ins)
	if err != nil {
		return nil, fmt.Errorf("failed to create order insurance: %w", err)
	}

	return ins, nil
}

func (s *insuranceService) SubmitOrderInsuranceClaim(ctx context.Context, orderID, claimantID uuid.UUID, reason string, claimedAmount int, evidenceURLs json.RawMessage) (*domain.OrderInsuranceClaim, error) {
	if orderID == uuid.Nil || claimantID == uuid.Nil || strings.TrimSpace(reason) == "" || claimedAmount <= 0 {
		return nil, fmt.Errorf("%w: order, claimant, reason, and positive claimed amount are required", domain.ErrInsuranceClaimInvalid)
	}

	insurance, err := s.insuranceRepo.GetOrderInsuranceForCustomer(ctx, orderID, claimantID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrOrderInsuranceNotFound
		}
		return nil, fmt.Errorf("failed to load order insurance: %w", err)
	}
	if insurance == nil {
		return nil, domain.ErrOrderInsuranceNotFound
	}
	if insurance.Status != domain.InsuranceStatusActive && insurance.Status != domain.InsuranceStatusPendingProviderActivation {
		return nil, fmt.Errorf("%w: insurance status %q cannot accept a claim", domain.ErrInsuranceClaimInvalid, insurance.Status)
	}
	if claimedAmount > insurance.CoverageLimit {
		return nil, fmt.Errorf("%w: claimed amount exceeds coverage limit", domain.ErrInsuranceClaimInvalid)
	}
	if len(evidenceURLs) == 0 {
		evidenceURLs = json.RawMessage("[]")
	}

	claim := &domain.OrderInsuranceClaim{
		ID:               uuid.New(),
		OrderInsuranceID: insurance.ID,
		OrderID:          orderID,
		ClaimantID:       claimantID,
		Reason:           strings.TrimSpace(reason),
		ClaimedAmount:    claimedAmount,
		EvidenceURLs:     evidenceURLs,
		Status:           domain.InsuranceClaimStatusSubmitted,
	}
	if err := s.insuranceRepo.CreateOrderInsuranceClaim(ctx, claim); err != nil {
		if errors.Is(err, domain.ErrInsuranceClaimExists) {
			return nil, err
		}
		return nil, fmt.Errorf("failed to submit insurance claim: %w", err)
	}
	return claim, nil
}

func (s *insuranceService) GetOrderInsuranceClaim(ctx context.Context, orderID, claimantID uuid.UUID) (*domain.OrderInsuranceClaim, error) {
	claim, err := s.insuranceRepo.GetOrderInsuranceClaim(ctx, orderID, claimantID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrInsuranceClaimNotFound
		}
		return nil, fmt.Errorf("failed to get insurance claim: %w", err)
	}
	return claim, nil
}

func ValidateInsuranceEvidenceURLs(evidenceURLs []string) (json.RawMessage, error) {
	if len(evidenceURLs) > 5 {
		return nil, fmt.Errorf("%w: at most five evidence URLs are allowed", domain.ErrInsuranceClaimInvalid)
	}
	clean := make([]string, 0, len(evidenceURLs))
	for _, raw := range evidenceURLs {
		value := strings.TrimSpace(raw)
		u, err := url.Parse(value)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return nil, fmt.Errorf("%w: evidence URLs must be absolute http(s) URLs", domain.ErrInsuranceClaimInvalid)
		}
		clean = append(clean, value)
	}
	encoded, err := json.Marshal(clean)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid evidence URLs", domain.ErrInsuranceClaimInvalid)
	}
	return encoded, nil
}

func orderInsuranceProviderName() string {
	providerName := strings.TrimSpace(os.Getenv("ORDER_INSURANCE_PROVIDER_NAME"))
	if providerName == "" {
		return "pending_provider_activation"
	}
	return providerName
}

func (s *insuranceService) ProcessInsuranceReminders(ctx context.Context) error {
	// Check for insurances expiring in 30, 14, and 7 days
	reminderDays := []int{30, 14, 7}

	for _, days := range reminderDays {
		expiring, err := s.insuranceRepo.GetExpiringCourierInsurances(ctx, days)
		if err != nil {
			return fmt.Errorf("failed to get expiring insurances for %d days: %w", days, err)
		}

		for _, ins := range expiring {
			msg := fmt.Sprintf("Asuransi %s Anda akan kedaluwarsa dalam %d hari. Pastikan saldo cukup untuk perpanjangan otomatis.", ins.Provider, days)

			// Send notification
			_ = s.notifService.Send(ctx, domain.NotificationRequest{
				UserID:  ins.CourierID.String(),
				Title:   "Reminder Perpanjangan Asuransi",
				Message: msg,
				Channel: domain.ChannelPush,
			})
		}
	}

	return nil
}
