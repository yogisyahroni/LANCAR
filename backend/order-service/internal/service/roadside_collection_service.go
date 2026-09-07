package service

import (
	"context"
	"fmt"
	"strings"

	"tembus/order-service/internal/domain"
)

type roadsideCollectionService struct {
	repo    domain.RoadsideCollectionRepository
	gateway domain.PaymentGateway
	tax     domain.TaxService
	config  domain.ConfigRepository
}

func NewRoadsideCollectionService(repo domain.RoadsideCollectionRepository, gateway domain.PaymentGateway, tax domain.TaxService, config domain.ConfigRepository) domain.RoadsideCollectionService {
	return &roadsideCollectionService{repo: repo, gateway: gateway, tax: tax, config: config}
}
func (s *roadsideCollectionService) Start(ctx context.Context, adjustmentID, customerID string) (*domain.Payment, error) {
	if s.repo == nil || s.gateway == nil || s.tax == nil || s.config == nil {
		return nil, fmt.Errorf("roadside collection dependencies unavailable")
	}
	p, created, err := s.repo.ReserveRoadsideAdjustmentPayment(ctx, strings.TrimSpace(adjustmentID), strings.TrimSpace(customerID))
	if err != nil {
		return nil, err
	}
	if !created {
		if p.Status == domain.PaymentStatusPending && p.QRCodeURL == nil {
			return nil, fmt.Errorf("%w: payment intent is being initialized or requires provider reconciliation", domain.ErrServiceAdjustmentConflict)
		}
		return p, nil
	}
	// The reserved payment number is stable across retries. No second charge
	// intent is created if the provider times out after accepting the first one.
	mdr, err := domain.RoadsidePercent(int64(p.AmountIDR), s.config.GetFloatConfig(ctx, "payment_mdr_rate", 0.007)*100)
	if err != nil {
		return nil, err
	}
	taxSnapshot, err := s.tax.CalculatePaymentMDRTax(ctx, mdr)
	if err != nil {
		return nil, err
	}
	ppn := taxSnapshot.PPNIDR
	if ppn < 0 || mdr+ppn > int64(p.AmountIDR) {
		return nil, domain.ErrServiceAdjustmentConflict
	}
	response, err := s.gateway.GenerateQRIS(ctx, domain.PaymentGatewayRequest{OrderID: p.OrderID, PaymentNumber: p.PaymentNumber, AmountIDR: p.AmountIDR})
	if err != nil {
		return nil, fmt.Errorf("provider intent %s requires reconciliation; no replacement payment was created: %w", p.PaymentNumber, err)
	}
	return s.repo.SaveRoadsideGatewayResult(ctx, p.ID, response, mdr, ppn)
}
func (s *roadsideCollectionService) ApplyVerifiedWebhook(ctx context.Context, number string, status domain.PaymentStatus, amount int64, providerRef string, payload []byte) error {
	if s.repo == nil {
		return fmt.Errorf("roadside collection repository unavailable")
	}
	return s.repo.ApplyRoadsideAdjustmentWebhook(ctx, number, status, amount, providerRef, payload)
}
