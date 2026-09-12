package handler

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"

	"tembus/payment-service/internal/domain"
)

type PaymentIntentHandler struct {
	repo domain.PaymentIntentRepository
}

func NewPaymentIntentHandler(repo domain.PaymentIntentRepository) *PaymentIntentHandler {
	return &PaymentIntentHandler{repo: repo}
}

func (h *PaymentIntentHandler) userID(r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(strings.TrimSpace(r.Header.Get("X-User-ID")))
	return id, err == nil && id != uuid.Nil
}

func writePaymentIntentError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": false,
		"error": map[string]string{
			"code":    code,
			"message": "Payment intent request could not be completed",
		},
	})
}

func (h *PaymentIntentHandler) internalAuthorized(r *http.Request) bool {
	expected := strings.TrimSpace(os.Getenv("INTERNAL_PAYMENT_API_KEY"))
	provided := strings.TrimSpace(r.Header.Get("X-Internal-API-Key"))
	return expected != "" && provided != "" && subtle.ConstantTimeCompare([]byte(expected), []byte(provided)) == 1
}

func (h *PaymentIntentHandler) Create(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writePaymentIntentError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED")
		return
	}
	userID, ok := h.userID(r)
	if !ok {
		writePaymentIntentError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED")
		return
	}
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writePaymentIntentError(w, http.StatusBadRequest, "ERR_INVALID_BODY")
		return
	}
	if _, supplied := raw["paid"]; supplied {
		writePaymentIntentError(w, http.StatusBadRequest, "ERR_CLIENT_CANNOT_SET_PAYMENT_STATE")
		return
	}
	var req struct {
		OrderID       string `json:"order_id"`
		MarketCode    string `json:"market_code"`
		Currency      string `json:"currency"`
		AmountMinor   int64  `json:"amount_minor"`
		PaymentMethod string `json:"payment_method"`
	}
	body, _ := json.Marshal(raw)
	if err := json.Unmarshal(body, &req); err != nil {
		writePaymentIntentError(w, http.StatusBadRequest, "ERR_INVALID_BODY")
		return
	}
	orderID, err := uuid.Parse(req.OrderID)
	if err != nil || orderID == uuid.Nil || req.AmountMinor <= 0 || len(req.Currency) != 3 || strings.TrimSpace(req.MarketCode) == "" || strings.TrimSpace(req.PaymentMethod) == "" {
		writePaymentIntentError(w, http.StatusBadRequest, "ERR_INVALID_PAYMENT_INTENT")
		return
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if key == "" {
		writePaymentIntentError(w, http.StatusBadRequest, "ERR_IDEMPOTENCY_REQUIRED")
		return
	}
	now := time.Now().UTC()
	requestHash := sha256.Sum256(body)
	intent, err := h.repo.Create(r.Context(), &domain.PaymentIntent{ID: uuid.New(), OrderID: orderID, CustomerID: userID, MarketCode: strings.ToLower(req.MarketCode), Currency: strings.ToUpper(req.Currency), AmountMinor: req.AmountMinor, Provider: "unassigned", PaymentMethod: strings.ToLower(req.PaymentMethod), State: domain.PaymentIntentCreated, RoutingRuleVersion: "unassigned-2026-09-12", IdempotencyKey: key, RequestHash: fmt.Sprintf("%x", requestHash[:]), ExpiresAt: now.Add(30 * time.Minute), CreatedAt: now, UpdatedAt: now})
	if err != nil {
		writePaymentIntentError(w, http.StatusUnprocessableEntity, "ERR_PAYMENT_INTENT_UNAVAILABLE")
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": intent})
}

func (h *PaymentIntentHandler) Get(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writePaymentIntentError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED")
		return
	}
	userID, ok := h.userID(r)
	if !ok {
		writePaymentIntentError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED")
		return
	}
	id, err := uuid.Parse(strings.TrimPrefix(r.URL.Path, "/api/v1/payment-intents/"))
	if err != nil || id == uuid.Nil {
		writePaymentIntentError(w, http.StatusBadRequest, "ERR_INVALID_ID")
		return
	}
	intent, err := h.repo.GetByID(r.Context(), id, userID)
	if err != nil {
		writePaymentIntentError(w, http.StatusNotFound, "ERR_PAYMENT_INTENT_NOT_FOUND")
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": intent})
}

func (h *PaymentIntentHandler) ApplyInternalEvent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writePaymentIntentError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED")
		return
	}
	if !h.internalAuthorized(r) {
		writePaymentIntentError(w, http.StatusUnauthorized, "ERR_INTERNAL_UNAUTHORIZED")
		return
	}
	var req domain.PaymentIntentEvent
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IntentID == uuid.Nil || strings.TrimSpace(req.EventID) == "" || strings.TrimSpace(req.Source) == "" {
		writePaymentIntentError(w, http.StatusBadRequest, "ERR_INVALID_PAYMENT_EVENT")
		return
	}
	if req.OccurredAt.IsZero() {
		req.OccurredAt = time.Now().UTC()
	}
	intent, err := h.repo.ApplyEvent(r.Context(), req)
	if err != nil {
		if errors.Is(err, domain.ErrPaymentIntentTerminal) {
			writePaymentIntentError(w, http.StatusConflict, "ERR_PAYMENT_INTENT_TERMINAL")
			return
		}
		writePaymentIntentError(w, http.StatusUnprocessableEntity, "ERR_PAYMENT_INTENT_TRANSITION")
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": intent})
}
