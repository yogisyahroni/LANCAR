package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

type PaymentMethodCatalogHandler struct{ db *sql.DB }

func NewPaymentMethodCatalogHandler(db *sql.DB) *PaymentMethodCatalogHandler {
	return &PaymentMethodCatalogHandler{db: db}
}

// List is the customer read contract for market- and value-eligible payment
// methods. Availability is remote data; the app must not infer a method from
// a country label or hardcoded currency assumption.
func (h *PaymentMethodCatalogHandler) List(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writePaymentIntentError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED")
		return
	}
	marketCode := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("market_code")))
	currency := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("currency")))
	amount, err := strconv.ParseInt(strings.TrimSpace(r.URL.Query().Get("amount_minor")), 10, 64)
	if marketCode == "" || len(currency) != 3 || amount <= 0 || err != nil {
		writePaymentIntentError(w, http.StatusBadRequest, "ERR_INVALID_PAYMENT_METHOD_CONTEXT")
		return
	}
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT payment_method, provider, currency, min_amount_minor,
		       max_amount_minor, risk_context, version
		  FROM payment_method_catalog
		 WHERE market_code = $1 AND currency = $2 AND enabled
		   AND (min_amount_minor IS NULL OR min_amount_minor <= $3)
		   AND (max_amount_minor IS NULL OR max_amount_minor >= $3)
		 ORDER BY payment_method, provider`, marketCode, currency, amount)
	if err != nil {
		writePaymentIntentError(w, http.StatusServiceUnavailable, "ERR_PAYMENT_METHOD_CATALOG_UNAVAILABLE")
		return
	}
	defer rows.Close()
	type method struct {
		PaymentMethod  string         `json:"payment_method"`
		Provider       string         `json:"provider"`
		Currency       string         `json:"currency"`
		MinAmountMinor *int64         `json:"min_amount_minor,omitempty"`
		MaxAmountMinor *int64         `json:"max_amount_minor,omitempty"`
		RiskContext    map[string]any `json:"risk_context"`
		Version        int64          `json:"version"`
	}
	methods := make([]method, 0)
	for rows.Next() {
		var item method
		var risk []byte
		if err := rows.Scan(&item.PaymentMethod, &item.Provider, &item.Currency, &item.MinAmountMinor, &item.MaxAmountMinor, &risk, &item.Version); err != nil {
			writePaymentIntentError(w, http.StatusServiceUnavailable, "ERR_PAYMENT_METHOD_CATALOG_UNAVAILABLE")
			return
		}
		item.RiskContext = map[string]any{}
		if len(risk) > 0 {
			if err := json.Unmarshal(risk, &item.RiskContext); err != nil {
				writePaymentIntentError(w, http.StatusServiceUnavailable, "ERR_PAYMENT_METHOD_CATALOG_UNAVAILABLE")
				return
			}
		}
		methods = append(methods, item)
	}
	if err := rows.Err(); err != nil {
		writePaymentIntentError(w, http.StatusServiceUnavailable, "ERR_PAYMENT_METHOD_CATALOG_UNAVAILABLE")
		return
	}
	w.Header().Set("Cache-Control", "private, max-age=60")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"data":    methods,
		"context": map[string]any{"market_code": marketCode, "currency": currency, "amount_minor": amount},
	})
}
