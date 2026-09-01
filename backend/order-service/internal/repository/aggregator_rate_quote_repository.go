package repository

import (
	"context"
	"database/sql"
	"fmt"
	"tembus/order-service/internal/domain"
	"time"
)

type aggregatorRateQuoteRepository struct {
	db *sql.DB
}

func NewAggregatorRateQuoteRepository(db *sql.DB) domain.AggregatorRateQuoteRepository {
	return &aggregatorRateQuoteRepository{db: db}
}

func (r *aggregatorRateQuoteRepository) Create(ctx context.Context, quote *domain.AggregatorRateQuote) error {
	const query = `
		INSERT INTO aggregator_rate_quotes (
			id, provider_code, origin_code, destination_code, chargeable_weight_kg,
			length_cm, width_cm, height_cm, item_value_idr, category, insurance, cod,
			service_code, service_name, normalized_category, tariff_gross_idr,
			tariff_net_idr, customer_tariff_idr, eta, eta_source, rule_version,
			expires_at, created_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
			$13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
		)`
	_, err := r.db.ExecContext(ctx, query,
		quote.ID, quote.ProviderCode, quote.OriginCode, quote.DestinationCode,
		quote.ChargeableWeightKG, quote.LengthCM, quote.WidthCM, quote.HeightCM,
		quote.ItemValueIDR, quote.Category, quote.Insurance, quote.COD,
		quote.ServiceCode, quote.ServiceName, quote.NormalizedCategory,
		quote.TariffGrossIDR, quote.TariffNetIDR, quote.CustomerTariffIDR,
		quote.ETA, quote.ETASource, quote.RuleVersion, quote.ExpiresAt, quote.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("create aggregator rate quote: %w", err)
	}
	return nil
}

func (r *aggregatorRateQuoteRepository) GetValid(ctx context.Context, id string, now time.Time) (*domain.AggregatorRateQuote, error) {
	const query = `
		SELECT id, provider_code, origin_code, destination_code, chargeable_weight_kg,
		       length_cm, width_cm, height_cm, item_value_idr, category, insurance, cod,
		       service_code, service_name, normalized_category, tariff_gross_idr,
		       tariff_net_idr, customer_tariff_idr, eta, eta_source, rule_version,
		       expires_at, created_at
		FROM aggregator_rate_quotes
		WHERE id = $1 AND expires_at > $2`
	var quote domain.AggregatorRateQuote
	err := r.db.QueryRowContext(ctx, query, id, now).Scan(
		&quote.ID, &quote.ProviderCode, &quote.OriginCode, &quote.DestinationCode,
		&quote.ChargeableWeightKG, &quote.LengthCM, &quote.WidthCM, &quote.HeightCM,
		&quote.ItemValueIDR, &quote.Category, &quote.Insurance, &quote.COD,
		&quote.ServiceCode, &quote.ServiceName, &quote.NormalizedCategory,
		&quote.TariffGrossIDR, &quote.TariffNetIDR, &quote.CustomerTariffIDR,
		&quote.ETA, &quote.ETASource, &quote.RuleVersion, &quote.ExpiresAt, &quote.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get valid aggregator rate quote: %w", err)
	}
	return &quote, nil
}
