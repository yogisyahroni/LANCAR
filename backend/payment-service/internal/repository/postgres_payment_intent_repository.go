package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"tembus/payment-service/internal/domain"
)

type PostgresPaymentIntentRepository struct{ db *sql.DB }

func NewPostgresPaymentIntentRepository(db *sql.DB) *PostgresPaymentIntentRepository {
	return &PostgresPaymentIntentRepository{db: db}
}

const paymentIntentColumns = `id, order_id, customer_id, market_code, currency, amount_minor, provider, payment_method, state, COALESCE(provider_raw_status, ''), COALESCE(provider_reference, ''), routing_rule_version, version, expires_at, created_at, updated_at`

func scanPaymentIntent(scanner interface{ Scan(...any) error }) (*domain.PaymentIntent, error) {
	intent := &domain.PaymentIntent{}
	if err := scanner.Scan(&intent.ID, &intent.OrderID, &intent.CustomerID, &intent.MarketCode, &intent.Currency, &intent.AmountMinor, &intent.Provider, &intent.PaymentMethod, &intent.State, &intent.ProviderRawStatus, &intent.ProviderReference, &intent.RoutingRuleVersion, &intent.Version, &intent.ExpiresAt, &intent.CreatedAt, &intent.UpdatedAt); err != nil {
		return nil, err
	}
	return intent, nil
}

func (r *PostgresPaymentIntentRepository) Create(ctx context.Context, intent *domain.PaymentIntent) (*domain.PaymentIntent, error) {
	if intent == nil || intent.ID == uuid.Nil || intent.OrderID == uuid.Nil || intent.CustomerID == uuid.Nil {
		return nil, errors.New("payment intent identity is required")
	}
	if intent.AmountMinor <= 0 || intent.Currency == "" || intent.MarketCode == "" || intent.PaymentMethod == "" || intent.RoutingRuleVersion == "" {
		return nil, errors.New("payment intent financial and routing fields are required")
	}
	if intent.IdempotencyKey == "" || intent.RequestHash == "" {
		return nil, errors.New("payment intent idempotency and request hash are required")
	}
	const query = `INSERT INTO payment_intents
      (id, order_id, customer_id, market_code, currency, amount_minor, provider, payment_method, state, routing_rule_version, idempotency_key, request_hash, version, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'CREATED',$9,$10,$11,1,$12)
      ON CONFLICT (idempotency_key) DO UPDATE SET id = payment_intents.id
      WHERE payment_intents.request_hash = EXCLUDED.request_hash
      RETURNING ` + paymentIntentColumns
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin payment intent: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	created, err := scanPaymentIntent(tx.QueryRowContext(ctx, query, intent.ID, intent.OrderID, intent.CustomerID, intent.MarketCode, intent.Currency, intent.AmountMinor, intent.Provider, intent.PaymentMethod, intent.RoutingRuleVersion, intent.IdempotencyKey, intent.RequestHash, intent.ExpiresAt))
	if err != nil {
		return nil, fmt.Errorf("create payment intent: %w", err)
	}
	if _, err = tx.ExecContext(ctx, `UPDATE payments SET payment_intent_id = $1, updated_at = NOW() WHERE order_id = $2 AND payment_intent_id IS NULL`, created.ID, created.OrderID); err != nil {
		return nil, fmt.Errorf("link payment intent to order payment: %w", err)
	}
	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit payment intent: %w", err)
	}
	return created, nil
}

func (r *PostgresPaymentIntentRepository) GetByID(ctx context.Context, id, customerID uuid.UUID) (*domain.PaymentIntent, error) {
	return scanPaymentIntent(r.db.QueryRowContext(ctx, `SELECT `+paymentIntentColumns+` FROM payment_intents WHERE id = $1 AND customer_id = $2`, id, customerID))
}

func (r *PostgresPaymentIntentRepository) ApplyEvent(ctx context.Context, event domain.PaymentIntentEvent) (*domain.PaymentIntent, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	intent, err := scanPaymentIntent(tx.QueryRowContext(ctx, `SELECT `+paymentIntentColumns+` FROM payment_intents WHERE id = $1 FOR UPDATE`, event.IntentID))
	if err != nil {
		return nil, fmt.Errorf("load payment intent: %w", err)
	}
	var inserted string
	err = tx.QueryRowContext(ctx, `INSERT INTO payment_intent_events (intent_id,event_id,source,provider_raw_status,normalized_state,provider_reference,payload,occurred_at) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::jsonb,'{}'::jsonb),$8) ON CONFLICT (intent_id,event_id) DO NOTHING RETURNING event_id`, event.IntentID, event.EventID, event.Source, event.ProviderRawStatus, event.NormalizedState, event.ProviderReference, nullableJSON(event.Payload), event.OccurredAt).Scan(&inserted)
	if errors.Is(err, sql.ErrNoRows) {
		if commitErr := tx.Commit(); commitErr != nil {
			return nil, commitErr
		}
		return intent, nil
	}
	if err != nil {
		return nil, fmt.Errorf("record payment intent event: %w", err)
	}
	if err = intent.ApplyEvent(event); err != nil {
		if errors.Is(err, domain.ErrPaymentIntentTerminal) {
			// Preserve the provider evidence and make the late callback visible to
			// reconciliation. The terminal intent itself remains authoritative.
			_, exceptionErr := tx.ExecContext(ctx, `INSERT INTO payment_reconciliation_exceptions
				(intent_id, provider, provider_reference, exception_type, expected_state, actual_state, expected_amount_minor, actual_amount_minor, currency, metadata)
				VALUES ($1,$2,$3,'LATE_TERMINAL_CALLBACK',$4,$5,$6,$7,$8,COALESCE($9::jsonb,'{}'::jsonb))
				ON CONFLICT DO NOTHING`, intent.ID, intent.Provider, event.ProviderReference, intent.State, event.NormalizedState, intent.AmountMinor, intent.AmountMinor, intent.Currency, nullableJSON(event.Payload))
			if exceptionErr != nil {
				return nil, fmt.Errorf("record late payment callback exception: %w", exceptionErr)
			}
			if commitErr := tx.Commit(); commitErr != nil {
				return nil, commitErr
			}
		}
		return nil, err
	}
	_, err = tx.ExecContext(ctx, `UPDATE payment_intents SET state=$2, provider_raw_status=$3, provider_reference=NULLIF($4,''), version=$5, updated_at=$6 WHERE id=$1`, intent.ID, intent.State, intent.ProviderRawStatus, intent.ProviderReference, intent.Version, intent.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update payment intent: %w", err)
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return intent, nil
}

func nullableJSON(payload []byte) any {
	if len(payload) == 0 {
		return nil
	}
	return string(payload)
}
