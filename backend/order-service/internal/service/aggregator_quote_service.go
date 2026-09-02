package service

import (
	"context"
	"fmt"
	"strings"
	"tembus/order-service/internal/domain"
	"time"

	"github.com/google/uuid"
)

const aggregatorRateRuleVersion = "2026-09-02"

func normalizeAggregatorCategory(category string) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(category)), "-"))
}

func chargeableWeightKg(actual, length, width, height float64) float64 {
	chargeable := actual
	if length > 0 && width > 0 && height > 0 {
		volumetric := (length * width * height) / 6000.0
		if volumetric > chargeable {
			chargeable = volumetric
		}
	}
	return chargeable
}

// Quote obtains carrier rates and persists one immutable server-owned snapshot
// per native carrier service. The monetary values returned to callers come from
// the persisted snapshot, not from client input.
func (s *paymentLinkServiceImpl) Quote(ctx context.Context, req domain.CheckTariffRequest) (*domain.CheckTariffResponse, error) {
	if s.awbClient == nil {
		return nil, fmt.Errorf("logistics integration is not available")
	}

	req.Provider = strings.ToLower(strings.TrimSpace(req.Provider))
	req.OriginCode = strings.TrimSpace(req.OriginCode)
	req.DestinationCode = strings.TrimSpace(req.DestinationCode)
	// Provider area codes must come from the validated provider mapping selected
	// by the caller. Never substitute a global AWB config value here: doing so
	// can quote the wrong lane while appearing to succeed.
	if req.Provider == "" || req.OriginCode == "" || req.DestinationCode == "" || req.WeightKG <= 0 {
		return nil, fmt.Errorf("provider, origin, destination, and positive weight are required")
	}

	chargeableWeight := chargeableWeightKg(req.WeightKG, req.LengthCM, req.WidthCM, req.HeightCM)
	providerReq := req
	providerReq.WeightKG = chargeableWeight
	providerResp, err := s.awbClient.CheckTariff(ctx, providerReq)
	if err != nil {
		return nil, fmt.Errorf("failed to check tariff from provider: %w", err)
	}
	if providerResp == nil || len(providerResp.Services) == 0 {
		return nil, fmt.Errorf("provider returned no services")
	}

	discountPct, markupPct, configErr := s.orderRepo.GetLogisticsProviderConfig(ctx, req.Provider)
	if configErr != nil {
		discountPct, markupPct = 0, 0
	}

	ttlSeconds := s.configRepo.GetIntConfig(ctx, "aggregator_rate_quote_ttl_seconds", 300)
	if ttlSeconds <= 0 {
		ttlSeconds = 300
	}
	now := time.Now()
	expiresAt := now.Add(time.Duration(ttlSeconds) * time.Second)
	response := &domain.CheckTariffResponse{
		Provider:         req.Provider,
		Origin:           req.OriginCode,
		Dest:             req.DestinationCode,
		Weight:           req.WeightKG,
		ChargeableWeight: chargeableWeight,
		RuleVersion:      aggregatorRateRuleVersion,
		ExpiresAt:        expiresAt,
	}

	for _, carrierService := range providerResp.Services {
		if strings.TrimSpace(carrierService.ServiceCode) == "" || carrierService.TariffGross <= 0 {
			continue
		}

		tariffNet := int64(float64(carrierService.TariffGross) * (1.0 - (discountPct / 100.0)))
		customerTariff := int64(float64(tariffNet) * (1.0 + (markupPct / 100.0)))
		if tariffNet <= 0 || customerTariff <= 0 {
			continue
		}

		etaSource := ""
		if strings.TrimSpace(carrierService.ETD) != "" {
			etaSource = "provider_api"
		}
		quote := &domain.AggregatorRateQuote{
			ID:                 uuid.New().String(),
			ProviderCode:       req.Provider,
			OriginCode:         req.OriginCode,
			DestinationCode:    req.DestinationCode,
			ChargeableWeightKG: chargeableWeight,
			LengthCM:           req.LengthCM,
			WidthCM:            req.WidthCM,
			HeightCM:           req.HeightCM,
			ItemValueIDR:       req.ItemValueIDR,
			Category:           strings.TrimSpace(req.Category),
			Insurance:          req.Insurance,
			COD:                req.COD,
			ServiceCode:        carrierService.ServiceCode,
			ServiceName:        carrierService.ServiceName,
			NormalizedCategory: normalizeAggregatorCategory(req.Category),
			TariffGrossIDR:     carrierService.TariffGross,
			TariffNetIDR:       tariffNet,
			CustomerTariffIDR:  customerTariff,
			ETA:                carrierService.ETD,
			ETASource:          etaSource,
			RuleVersion:        aggregatorRateRuleVersion,
			ExpiresAt:          expiresAt,
			CreatedAt:          now,
		}
		if err := s.repo.CreateAggregatorRateQuote(ctx, quote); err != nil {
			return nil, err
		}

		response.Services = append(response.Services, domain.TariffServiceOption{
			ServiceCode:       quote.ServiceCode,
			ServiceName:       quote.ServiceName,
			TariffGross:       quote.TariffGrossIDR,
			TariffNet:         quote.TariffNetIDR,
			DiscountPct:       discountPct,
			MarkupPct:         markupPct,
			ETD:               quote.ETA,
			ETDSource:         quote.ETASource,
			QuoteID:           quote.ID,
			CustomerTariffIDR: quote.CustomerTariffIDR,
		})
	}

	if len(response.Services) == 0 {
		return nil, fmt.Errorf("provider returned no valid services")
	}
	return response, nil
}

func (s *paymentLinkServiceImpl) ValidateSelection(ctx context.Context, quoteID, providerCode, serviceCode string) (*domain.AggregatorRateQuote, error) {
	quoteID = strings.TrimSpace(quoteID)
	if quoteID == "" {
		return nil, &domain.RequoteRequiredError{Reason: "aggregator_quote_id is required"}
	}
	quote, err := s.repo.GetValidAggregatorRateQuote(ctx, quoteID, time.Now())
	if err != nil {
		return nil, err
	}
	if quote == nil {
		return nil, &domain.RequoteRequiredError{Reason: "quote expired or was not found"}
	}
	if !strings.EqualFold(strings.TrimSpace(quote.ProviderCode), strings.TrimSpace(providerCode)) ||
		!strings.EqualFold(strings.TrimSpace(quote.ServiceCode), strings.TrimSpace(serviceCode)) {
		return nil, &domain.RequoteRequiredError{Reason: "quote does not match the selected provider service"}
	}
	return quote, nil
}
