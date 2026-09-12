package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"

	"tembus/payment-service/internal/domain"
)

type ChargebackEventRequest struct {
	IntentID          uuid.UUID              `json:"intent_id"`
	Provider          string                 `json:"provider"`
	CaseReference     string                 `json:"case_reference"`
	EventID           string                 `json:"event_id"`
	AmountMinor       int64                  `json:"amount_minor"`
	Currency          string                 `json:"currency"`
	State             domain.ChargebackState `json:"state"`
	ProviderRawStatus string                 `json:"provider_raw_status"`
	EvidenceDeadline  *time.Time             `json:"evidence_deadline,omitempty"`
	LiabilityOwner    string                 `json:"liability_owner"`
	Payload           json.RawMessage        `json:"payload,omitempty"`
	OccurredAt        time.Time              `json:"occurred_at"`
}

type ChargebackHandler struct{ db *sql.DB }

func NewChargebackHandler(db *sql.DB) *ChargebackHandler { return &ChargebackHandler{db: db} }

func (h *ChargebackHandler) authorized(r *http.Request) bool {
	expected := strings.TrimSpace(os.Getenv("INTERNAL_PAYMENT_API_KEY"))
	provided := strings.TrimSpace(r.Header.Get("X-Internal-API-Key"))
	return expected != "" && provided != "" && len(expected) == len(provided) && subtleConstantTimeCompare(expected, provided)
}

func validChargebackOwner(owner string) bool {
	return owner == "MERCHANT" || owner == "PLATFORM" || owner == "SHARED"
}

func (h *ChargebackHandler) Ingest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writePaymentIntentError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED")
		return
	}
	if !h.authorized(r) {
		writePaymentIntentError(w, http.StatusUnauthorized, "ERR_INTERNAL_UNAUTHORIZED")
		return
	}
	var req ChargebackEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writePaymentIntentError(w, http.StatusBadRequest, "ERR_INVALID_CHARGEBACK_EVENT")
		return
	}
	req.Provider = strings.ToLower(strings.TrimSpace(req.Provider))
	req.CaseReference = strings.TrimSpace(req.CaseReference)
	req.EventID = strings.TrimSpace(req.EventID)
	req.Currency = strings.ToUpper(strings.TrimSpace(req.Currency))
	req.ProviderRawStatus = strings.TrimSpace(req.ProviderRawStatus)
	req.LiabilityOwner = strings.ToUpper(strings.TrimSpace(req.LiabilityOwner))
	if req.OccurredAt.IsZero() {
		req.OccurredAt = time.Now().UTC()
	}
	if len(req.Payload) == 0 {
		req.Payload = json.RawMessage(`{}`)
	}
	if req.IntentID == uuid.Nil || req.Provider == "" || req.CaseReference == "" || req.EventID == "" || req.AmountMinor <= 0 || len(req.Currency) != 3 || req.ProviderRawStatus == "" || !validChargebackOwner(req.LiabilityOwner) || !validChargebackState(req.State) || !json.Valid(req.Payload) {
		writePaymentIntentError(w, http.StatusBadRequest, "ERR_INVALID_CHARGEBACK_EVENT")
		return
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		writePaymentIntentError(w, http.StatusServiceUnavailable, "ERR_CHARGEBACK_UNAVAILABLE")
		return
	}
	defer func() { _ = tx.Rollback() }()

	var chargebackID uuid.UUID
	var currentState domain.ChargebackState
	err = tx.QueryRowContext(r.Context(), `
		SELECT id, state FROM payment_chargebacks
		 WHERE provider = $1 AND provider_case_reference = $2 FOR UPDATE`, req.Provider, req.CaseReference).Scan(&chargebackID, &currentState)
	if errors.Is(err, sql.ErrNoRows) {
		currentState = req.State
		err = tx.QueryRowContext(r.Context(), `
			INSERT INTO payment_chargebacks
			(intent_id, provider, provider_case_reference, amount_minor, currency, state, evidence_deadline, liability_owner, provider_raw_payload)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING id`,
			req.IntentID, req.Provider, req.CaseReference, req.AmountMinor, req.Currency, req.State, req.EvidenceDeadline, req.LiabilityOwner, string(req.Payload)).Scan(&chargebackID)
	}
	if err != nil {
		writePaymentIntentError(w, http.StatusUnprocessableEntity, "ERR_CHARGEBACK_UNAVAILABLE")
		return
	}

	var inserted string
	err = tx.QueryRowContext(r.Context(), `
		INSERT INTO payment_chargeback_events
		(chargeback_id, event_id, state, provider_raw_status, provider_raw_payload, occurred_at)
		VALUES ($1,$2,$3,$4,$5::jsonb,$6)
		ON CONFLICT (chargeback_id, event_id) DO NOTHING RETURNING event_id`,
		chargebackID, req.EventID, req.State, req.ProviderRawStatus, string(req.Payload), req.OccurredAt).Scan(&inserted)
	if errors.Is(err, sql.ErrNoRows) {
		if err = tx.Commit(); err != nil {
			writePaymentIntentError(w, http.StatusServiceUnavailable, "ERR_CHARGEBACK_UNAVAILABLE")
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "duplicate": true, "data": map[string]any{"chargeback_id": chargebackID, "state": currentState}})
		return
	}
	if err != nil {
		writePaymentIntentError(w, http.StatusUnprocessableEntity, "ERR_CHARGEBACK_UNAVAILABLE")
		return
	}
	if !domain.CanTransitionChargeback(currentState, req.State) {
		_, _ = tx.ExecContext(r.Context(), `INSERT INTO payment_reconciliation_exceptions
			(intent_id, provider, provider_reference, exception_type, expected_state, actual_state, currency, metadata)
			VALUES ($1,$2,$3,'CHARGEBACK_STATE_REGRESSION',$4,$5,$6,$7::jsonb)
			ON CONFLICT DO NOTHING`, req.IntentID, req.Provider, req.CaseReference, currentState, req.State, req.Currency, string(req.Payload))
		if err = tx.Commit(); err != nil {
			writePaymentIntentError(w, http.StatusServiceUnavailable, "ERR_CHARGEBACK_UNAVAILABLE")
			return
		}
		writePaymentIntentError(w, http.StatusConflict, "ERR_CHARGEBACK_STATE_REGRESSION")
		return
	}
	_, err = tx.ExecContext(r.Context(), `UPDATE payment_chargebacks
		SET state=$2, amount_minor=$3, currency=$4, evidence_deadline=$5, liability_owner=$6,
		    provider_raw_payload=$7::jsonb, updated_at=NOW() WHERE id=$1`,
		chargebackID, req.State, req.AmountMinor, req.Currency, req.EvidenceDeadline, req.LiabilityOwner, string(req.Payload))
	if err == nil && req.State == domain.ChargebackLost {
		_, err = tx.ExecContext(r.Context(), `UPDATE payment_intents
			SET state='CHARGEBACK', provider_raw_status=$2, provider_reference=COALESCE(provider_reference,$3), version=version+1, updated_at=$4
			WHERE id=$1 AND state IN ('PAID','CAPTURED','SETTLED','PARTIALLY_REFUNDED')`, req.IntentID, req.ProviderRawStatus, req.CaseReference, req.OccurredAt)
	}
	if err != nil {
		writePaymentIntentError(w, http.StatusUnprocessableEntity, "ERR_CHARGEBACK_UNAVAILABLE")
		return
	}
	if err = tx.Commit(); err != nil {
		writePaymentIntentError(w, http.StatusServiceUnavailable, "ERR_CHARGEBACK_UNAVAILABLE")
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "duplicate": false, "data": map[string]any{"chargeback_id": chargebackID, "state": req.State, "liability_owner": req.LiabilityOwner}})
}

func validChargebackState(state domain.ChargebackState) bool {
	return state == domain.ChargebackReceived || state == domain.ChargebackUnderReview || state == domain.ChargebackEvidenceSubmitted || state == domain.ChargebackWon || state == domain.ChargebackLost || state == domain.ChargebackClosed
}

func subtleConstantTimeCompare(left, right string) bool {
	if len(left) != len(right) {
		return false
	}
	var diff byte
	for i := range left {
		diff |= left[i] ^ right[i]
	}
	return diff == 0
}
