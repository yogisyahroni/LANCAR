package domain

import "errors"

type ReconciliationRecord struct {
	IntentID          string             `json:"intent_id"`
	Provider          string             `json:"provider"`
	ProviderReference string             `json:"provider_reference"`
	Currency          string             `json:"currency"`
	AmountMinor       int64              `json:"amount_minor"`
	State             PaymentIntentState `json:"state"`
	BatchDate         string             `json:"batch_date,omitempty"`
	Timezone          string             `json:"timezone,omitempty"`
}

type ReconciliationException struct {
	Type   string `json:"type"`
	Reason string `json:"reason"`
}

// CompareReconciliation is deterministic and provider-neutral. A missing,
// duplicate, amount/currency mismatch, or state mismatch becomes an exception
// for the durable payment_reconciliation_exceptions queue; it never rewrites
// the provider or internal history.
func CompareReconciliation(internal, provider, settlement *ReconciliationRecord) ([]ReconciliationException, error) {
	if internal == nil {
		return nil, errors.New("internal payment record is required")
	}
	if provider == nil {
		return []ReconciliationException{{Type: "MISSING_PROVIDER", Reason: "provider transaction is absent"}}, nil
	}
	if provider.IntentID != internal.IntentID || provider.ProviderReference == "" {
		return []ReconciliationException{{Type: "REFERENCE_MISMATCH", Reason: "provider reference does not resolve to the internal intent"}}, nil
	}
	result := make([]ReconciliationException, 0, 2)
	// Batch dates are provider metadata, not transaction truth. They are
	// deliberately carried through to the durable exception record so a
	// provider's local timezone/batch cut-off cannot be mistaken for a missing
	// payment or a history rewrite.
	if provider.AmountMinor != internal.AmountMinor {
		result = append(result, ReconciliationException{Type: "AMOUNT_MISMATCH", Reason: "provider amount differs from internal intent"})
	}
	if provider.Currency != internal.Currency {
		result = append(result, ReconciliationException{Type: "CURRENCY_MISMATCH", Reason: "provider currency differs from internal intent"})
	}
	if settlement == nil {
		result = append(result, ReconciliationException{Type: "MISSING_SETTLEMENT", Reason: "provider settlement/bank movement is absent"})
		return result, nil
	}
	if settlement.ProviderReference != provider.ProviderReference || settlement.AmountMinor != provider.AmountMinor || settlement.Currency != provider.Currency {
		result = append(result, ReconciliationException{Type: "SETTLEMENT_MISMATCH", Reason: "settlement report differs from provider transaction"})
	}
	return result, nil
}
