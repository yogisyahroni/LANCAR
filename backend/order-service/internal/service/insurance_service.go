package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"lancar/order-service/internal/domain"
)

type insuranceService struct {
	insuranceRepo domain.InsuranceRepository
	notifService  domain.NotificationService
}

func NewInsuranceService(insuranceRepo domain.InsuranceRepository, notifService domain.NotificationService) domain.InsuranceService {
	return &insuranceService{
		insuranceRepo: insuranceRepo,
		notifService:  notifService,
	}
}

func (s *insuranceService) EnrollBPJSTK(ctx context.Context, courierID uuid.UUID) (*domain.CourierInsurance, error) {
	// Mock BPJS API enrollment
	policyNumber := fmt.Sprintf("BPJS-TK-%s", uuid.New().String()[:8])
	
	validFrom := time.Now()
	validUntil := validFrom.AddDate(1, 0, 0) // 1 year

	ins := &domain.CourierInsurance{
		CourierID:         courierID,
		Type:              "bpjs_tk",
		Provider:          "bpjs_ketenagakerjaan",
		PolicyNumber:      policyNumber,
		CoverageIDR:       50000000, // 50jt accident coverage
		PremiumMonthlyIDR: 16800,
		CompanyShareIDR:   10000,
		CourierShareIDR:   6800,
		Status:            domain.InsuranceStatusActive,
		ValidFrom:         validFrom,
		ValidUntil:        &validUntil,
	}

	err := s.insuranceRepo.CreateCourierInsurance(ctx, ins)
	if err != nil {
		return nil, fmt.Errorf("failed to enroll BPJS TK: %w", err)
	}

	return ins, nil
}

func (s *insuranceService) CalculateOrderPremium(ctx context.Context, declaredValue int) (int, int) {
	// Rule: Premium is 0.2% of declared value, minimum premium Rp 1.000
	premium := int(float64(declaredValue) * 0.002)
	if premium < 1000 {
		premium = 1000
	}
	
	// Coverage limit is 100% of declared value, capped at Rp 10.000.000
	coverageLimit := declaredValue
	if coverageLimit > 10000000 {
		coverageLimit = 10000000
	}

	return premium, coverageLimit
}

func (s *insuranceService) CreateOrderInsurance(ctx context.Context, orderID uuid.UUID, declaredValue int) (*domain.OrderInsurance, error) {
	premium, coverageLimit := s.CalculateOrderPremium(ctx, declaredValue)

	ins := &domain.OrderInsurance{
		OrderID:       orderID,
		DeclaredValue: declaredValue,
		PremiumFee:    premium,
		CoverageLimit: coverageLimit,
		Status:        domain.InsuranceStatusActive,
		Provider:      "pasarpolis",
	}

	err := s.insuranceRepo.CreateOrderInsurance(ctx, ins)
	if err != nil {
		return nil, fmt.Errorf("failed to create order insurance: %w", err)
	}

	return ins, nil
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
			s.notifService.Send(ctx, domain.NotificationRequest{
				UserID:  ins.CourierID.String(),
				Title:   "Reminder Perpanjangan Asuransi",
				Message: msg,
				Channel: domain.ChannelPush,
			})
		}
	}

	return nil
}
