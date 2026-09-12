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
)

type RefundEventRequest struct {
	RefundID          uuid.UUID       `json:"refund_id"`
	EventID           string          `json:"event_id"`
	ProviderRawStatus string          `json:"provider_raw_status"`
	NormalizedStatus  string          `json:"normalized_status"`
	ProviderReference string          `json:"provider_reference"`
	Payload           json.RawMessage `json:"payload,omitempty"`
	OccurredAt        time.Time       `json:"occurred_at"`
}

type RefundEventHandler struct{ db *sql.DB }

func NewRefundEventHandler(db *sql.DB) *RefundEventHandler { return &RefundEventHandler{db: db} }

func (h *RefundEventHandler) authorized(r *http.Request) bool {
	expected := strings.TrimSpace(os.Getenv("INTERNAL_PAYMENT_API_KEY"))
	provided := strings.TrimSpace(r.Header.Get("X-Internal-API-Key"))
	return expected != "" && provided != "" && subtleConstantTimeCompare(expected, provided)
}

func validRefundStatus(status string) bool {
	switch status {
	case "REQUESTED", "PROCESSING", "SUCCEEDED", "FAILED", "UNKNOWN":
		return true
	default:
		return false
	}
}

func canTransitionRefund(from, to string) bool {
	if from == to {
		return true
	}
	switch from {
	case "REQUESTED":
		return to == "PROCESSING" || to == "SUCCEEDED" || to == "FAILED" || to == "UNKNOWN"
	case "PROCESSING", "UNKNOWN":
		return to == "PROCESSING" || to == "SUCCEEDED" || to == "FAILED" || to == "UNKNOWN"
	default:
		return false
	}
}

// Ingest persists provider refund evidence first, then updates the mutable
// projection and the immutable refund ledger in one transaction. A callback
// cannot turn a refund into a second credit or revive a terminal projection.
func (h *RefundEventHandler) Ingest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writePaymentIntentError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED")
		return
	}
	if !h.authorized(r) {
		writePaymentIntentError(w, http.StatusUnauthorized, "ERR_INTERNAL_UNAUTHORIZED")
		return
	}
	var req RefundEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writePaymentIntentError(w, http.StatusBadRequest, "ERR_INVALID_REFUND_EVENT")
		return
	}
	req.EventID = strings.TrimSpace(req.EventID)
	req.ProviderRawStatus = strings.TrimSpace(req.ProviderRawStatus)
	req.NormalizedStatus = strings.ToUpper(strings.TrimSpace(req.NormalizedStatus))
	req.ProviderReference = strings.TrimSpace(req.ProviderReference)
	if len(req.Payload) == 0 {
		req.Payload = json.RawMessage(`{}`)
	}
	if req.OccurredAt.IsZero() {
		req.OccurredAt = time.Now().UTC()
	}
	if req.RefundID == uuid.Nil || req.EventID == "" || req.ProviderRawStatus == "" || !validRefundStatus(req.NormalizedStatus) || !json.Valid(req.Payload) {
		writePaymentIntentError(w, http.StatusBadRequest, "ERR_INVALID_REFUND_EVENT")
		return
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		writePaymentIntentError(w, http.StatusServiceUnavailable, "ERR_REFUND_UNAVAILABLE")
		return
	}
	defer func() { _ = tx.Rollback() }()

	var intentID uuid.UUID
	var currentStatus, currency string
	var amount int64
	var providerReference sql.NullString
	err = tx.QueryRowContext(r.Context(), `
		SELECT intent_id, status, currency, amount_minor, provider_reference
		  FROM payment_refunds WHERE id = $1 FOR UPDATE`, req.RefundID).
		Scan(&intentID, &currentStatus, &currency, &amount, &providerReference)
	if errors.Is(err, sql.ErrNoRows) {
		writePaymentIntentError(w, http.StatusNotFound, "ERR_REFUND_NOT_FOUND")
		return
	}
	if err != nil {
		writePaymentIntentError(w, http.StatusServiceUnavailable, "ERR_REFUND_UNAVAILABLE")
		return
	}

	var inserted string
	err = tx.QueryRowContext(r.Context(), `
		INSERT INTO payment_refund_events
		(refund_id, event_id, provider_raw_status, normalized_status, provider_reference, payload, occurred_at)
		VALUES ($1,$2,$3,$4,NULLIF($5,''),$6::jsonb,$7)
		ON CONFLICT (refund_id, event_id) DO NOTHING RETURNING event_id`,
		req.RefundID, req.EventID, req.ProviderRawStatus, req.NormalizedStatus, req.ProviderReference, string(req.Payload), req.OccurredAt).Scan(&inserted)
	if errors.Is(err, sql.ErrNoRows) {
		if err = tx.Commit(); err != nil {
			writePaymentIntentError(w, http.StatusServiceUnavailable, "ERR_REFUND_UNAVAILABLE")
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "duplicate": true, "data": map[string]any{"refund_id": req.RefundID, "status": currentStatus}})
		return
	}
	if err != nil {
		writePaymentIntentError(w, http.StatusUnprocessableEntity, "ERR_REFUND_UNAVAILABLE")
		return
	}

	if !canTransitionRefund(currentStatus, req.NormalizedStatus) {
		_, _ = tx.ExecContext(r.Context(), `INSERT INTO payment_reconciliation_exceptions
			(intent_id, provider, provider_reference, exception_type, expected_state, actual_state, expected_amount_minor, actual_amount_minor, currency, metadata)
			SELECT $1, COALESCE(pi.provider, 'unknown'), $2, 'REFUND_STATE_REGRESSION', $3, $4, $5, $5, $6, $7::jsonb
			FROM payment_intents pi WHERE pi.id = $1 ON CONFLICT DO NOTHING`, intentID, req.ProviderReference, currentStatus, req.NormalizedStatus, amount, currency, string(req.Payload))
		if err = tx.Commit(); err != nil {
			writePaymentIntentError(w, http.StatusServiceUnavailable, "ERR_REFUND_UNAVAILABLE")
			return
		}
		writePaymentIntentError(w, http.StatusConflict, "ERR_REFUND_STATE_REGRESSION")
		return
	}

	if req.NormalizedStatus == "SUCCEEDED" {
		ref := req.ProviderReference
		if ref == "" && providerReference.Valid {
			ref = providerReference.String
		}
		if ref == "" {
			writePaymentIntentError(w, http.StatusBadRequest, "ERR_REFUND_REFERENCE_REQUIRED")
			return
		}
		_, err = tx.ExecContext(r.Context(), `INSERT INTO payment_refund_ledger_entries
			(refund_id, intent_id, entry_type, provider_reference, amount_minor, currency, idempotency_key)
			VALUES ($1,$2,'REFUND',$3,$4,$5,$6) ON CONFLICT (refund_id, entry_type) DO NOTHING`, req.RefundID, intentID, ref, amount, currency, "refund-ledger:"+req.RefundID.String())
		if err != nil {
			writePaymentIntentError(w, http.StatusUnprocessableEntity, "ERR_REFUND_LEDGER_UNAVAILABLE")
			return
		}
	}
	_, err = tx.ExecContext(r.Context(), `UPDATE payment_refunds SET status=$2, provider_reference=COALESCE(NULLIF($3,''), provider_reference), provider_raw_status=$4, updated_at=NOW() WHERE id=$1`, req.RefundID, req.NormalizedStatus, req.ProviderReference, req.ProviderRawStatus)
	if err != nil {
		writePaymentIntentError(w, http.StatusUnprocessableEntity, "ERR_REFUND_UNAVAILABLE")
		return
	}
	if req.NormalizedStatus == "SUCCEEDED" {
		_, err = tx.ExecContext(r.Context(), `UPDATE payment_intents pi SET state = CASE WHEN COALESCE((SELECT SUM(amount_minor) FROM payment_refunds WHERE intent_id = pi.id AND status = 'SUCCEEDED'),0) >= pi.amount_minor THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END, version=pi.version+1, updated_at=NOW() WHERE pi.id=$1 AND pi.state IN ('AUTHORIZED','PAID','CAPTURED','SETTLED','PARTIALLY_REFUNDED')`, intentID)
		if err != nil {
			writePaymentIntentError(w, http.StatusUnprocessableEntity, "ERR_REFUND_UNAVAILABLE")
			return
		}
	}
	if err = tx.Commit(); err != nil {
		writePaymentIntentError(w, http.StatusServiceUnavailable, "ERR_REFUND_UNAVAILABLE")
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "duplicate": false, "data": map[string]any{"refund_id": req.RefundID, "status": req.NormalizedStatus, "ledger_recorded": req.NormalizedStatus == "SUCCEEDED"}})
}
