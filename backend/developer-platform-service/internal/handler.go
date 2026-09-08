package platform

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Handler struct {
	store       *Store
	orderClient *OrderClient
	internalKey string
	environment string
	logger      *slog.Logger
}

func NewHandler(store *Store, orderClient *OrderClient, internalKey, environment string) *Handler {
	return &Handler{
		store: store, orderClient: orderClient, internalKey: internalKey,
		environment: strings.ToLower(strings.TrimSpace(environment)), logger: slog.Default(),
	}
}

type quoteRequest struct {
	PickupLat  float64  `json:"pickup_lat"`
	PickupLng  float64  `json:"pickup_lng"`
	DropoffLat float64  `json:"dropoff_lat"`
	DropoffLng float64  `json:"dropoff_lng"`
	Length     float64  `json:"length"`
	Width      float64  `json:"width"`
	Height     float64  `json:"height"`
	Weight     float64  `json:"weight"`
	Models     []string `json:"models"`
}

type clientProvisionRequest struct {
	Name           string   `json:"name"`
	OwnerUserID    string   `json:"owner_user_id"`
	Environment    string   `json:"environment"`
	Scopes         []string `json:"scopes"`
	QuotaPerMinute int      `json:"quota_per_minute"`
}

type webhookSubscriptionRequest struct {
	EndpointURL string   `json:"endpoint_url"`
	URL         string   `json:"url"`
	Events      []string `json:"events"`
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/internal/developer/clients" {
		h.handleProvisionClient(w, r)
		return
	}
	if !strings.HasPrefix(r.URL.Path, "/api/v1/developer/v1/") {
		writeError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Developer API route not found", "")
		return
	}
	client, err := h.store.Authenticate(r.Context(), r.Header.Get("Authorization"))
	if err != nil {
		writeError(w, http.StatusUnauthorized, "ERR_DEVELOPER_UNAUTHORIZED", "Valid developer credentials are required", "")
		return
	}
	allowed, _, err := h.store.AllowRate(r.Context(), client)
	if err != nil {
		h.logger.ErrorContext(r.Context(), "developer rate limit unavailable", "client_id", client.ClientID, "error", err)
		writeError(w, http.StatusServiceUnavailable, "ERR_RATE_LIMIT_UNAVAILABLE", "Developer API is temporarily unavailable", "")
		return
	}
	if !allowed {
		w.Header().Set("Retry-After", "60")
		writeError(w, http.StatusTooManyRequests, "ERR_DEVELOPER_QUOTA_EXCEEDED", "Developer client quota exceeded", "")
		return
	}
	h.dispatchPublic(w, r, client)
}

func (h *Handler) dispatchPublic(w http.ResponseWriter, r *http.Request, client Client) {
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/developer/v1/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Developer API route not found", client.ClientID)
		return
	}
	switch parts[0] {
	case "quotes":
		if r.Method == http.MethodPost && len(parts) == 1 {
			h.handleQuote(w, r, client)
			return
		}
	case "orders":
		if len(parts) == 2 && r.Method == http.MethodGet {
			h.handleGetOrder(w, r, client, parts[1])
			return
		}
		if len(parts) == 2 && r.Method == http.MethodPost {
			h.handleCreateOrder(w, r, client)
			return
		}
		if len(parts) == 3 && parts[2] == "cancel" && r.Method == http.MethodPost {
			h.handleCancelOrder(w, r, client, parts[1])
			return
		}
		if len(parts) == 3 && parts[2] == "track" && r.Method == http.MethodGet {
			h.handleTrackOrder(w, r, client, parts[1])
			return
		}
	case "webhooks":
		h.handleWebhooks(w, r, client, parts[1:])
		return
	}
	writeError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", client.ClientID)
}

func (h *Handler) handleQuote(w http.ResponseWriter, r *http.Request, client Client) {
	if err := RequireScope(client, "quotes:read"); err != nil {
		writeError(w, http.StatusForbidden, "ERR_SCOPE_REQUIRED", "quotes:read scope is required", client.ClientID)
		return
	}
	body, err := readBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ERR_INVALID_BODY", err.Error(), client.ClientID)
		return
	}
	var request quoteRequest
	if err := json.Unmarshal(body, &request); err != nil || len(request.Models) == 0 || request.Weight <= 0 {
		writeError(w, http.StatusBadRequest, "ERR_INVALID_QUOTE_REQUEST", "A valid quote request with models and weight is required", client.ClientID)
		return
	}
	h.executeIdempotent(w, r, client, "quote.create", body, func(key string) (int, []byte) {
		if client.Environment == "sandbox" {
			// Sandbox quotes are deliberately provider-free and non-financial. A
			// live credential is required to exercise canonical pricing/provider
			// behavior; sandbox must never accidentally create a real obligation.
			return http.StatusOK, mustJSON(map[string]any{
				"id": uuid.NewString(), "sandbox": true, "currency": "IDR",
				"total": 0, "estimates": []any{},
				"financial_obligation_created": false, "provider_call": false,
			})
		}
		status, response, callErr := h.orderClient.Quote(r.Context(), client.OwnerUserID, body, key)
		if callErr != nil {
			return http.StatusBadGateway, genericUpstreamError()
		}
		status, response = statusBody(status, response)
		return status, response
	})
}

func (h *Handler) handleCreateOrder(w http.ResponseWriter, r *http.Request, client Client) {
	if err := RequireScope(client, "orders:write"); err != nil {
		writeError(w, http.StatusForbidden, "ERR_SCOPE_REQUIRED", "orders:write scope is required", client.ClientID)
		return
	}
	body, err := readBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ERR_INVALID_BODY", err.Error(), client.ClientID)
		return
	}
	if err := validateCreateBody(body); err != nil {
		writeError(w, http.StatusBadRequest, "ERR_INVALID_ORDER_REQUEST", err.Error(), client.ClientID)
		return
	}
	h.executeIdempotent(w, r, client, "order.create", body, func(key string) (int, []byte) {
		if client.Environment == "sandbox" {
			id := uuid.NewString()
			payload, _ := json.Marshal(map[string]any{
				"id": id, "order_number": "SANDBOX-" + strings.ToUpper(id[:8]),
				"customer_id": client.OwnerUserID, "status": "sandbox_created",
				"estimate_id": jsonField(body, "estimate_id"), "sandbox": true,
				"financial_obligation_created": false, "provider_call": false,
			})
			if _, err := h.store.CreateSandboxOrder(r.Context(), client, id, body, payload); err != nil {
				return http.StatusServiceUnavailable, genericStoreError()
			}
			return http.StatusCreated, payload
		}
		status, response, callErr := h.orderClient.Create(r.Context(), client.OwnerUserID, body, key)
		if callErr != nil {
			return http.StatusBadGateway, genericUpstreamError()
		}
		return statusBody(status, response)
	})
}

func (h *Handler) handleGetOrder(w http.ResponseWriter, r *http.Request, client Client, orderID string) {
	if err := RequireScope(client, "orders:read"); err != nil {
		writeError(w, http.StatusForbidden, "ERR_SCOPE_REQUIRED", "orders:read scope is required", client.ClientID)
		return
	}
	if !validResourceID(orderID) {
		writeError(w, http.StatusBadRequest, "ERR_INVALID_ORDER_ID", "Order ID is invalid", client.ClientID)
		return
	}
	if client.Environment == "sandbox" {
		order, err := h.store.GetSandboxOrder(r.Context(), client, orderID)
		if err != nil {
			writeError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Order not found", client.ClientID)
			return
		}
		writeRawJSON(w, http.StatusOK, order.Payload)
		return
	}
	status, response, err := h.orderClient.Get(r.Context(), client.OwnerUserID, orderID)
	if err != nil {
		writeError(w, http.StatusBadGateway, "ERR_ORDER_SERVICE_UNAVAILABLE", "Order service is temporarily unavailable", client.ClientID)
		return
	}
	status, response = statusBody(status, response)
	writeRawJSON(w, status, response)
}

func (h *Handler) handleCancelOrder(w http.ResponseWriter, r *http.Request, client Client, orderID string) {
	if err := RequireScope(client, "orders:cancel"); err != nil {
		writeError(w, http.StatusForbidden, "ERR_SCOPE_REQUIRED", "orders:cancel scope is required", client.ClientID)
		return
	}
	if !validResourceID(orderID) {
		writeError(w, http.StatusBadRequest, "ERR_INVALID_ORDER_ID", "Order ID is invalid", client.ClientID)
		return
	}
	body, err := readBody(r)
	if err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "ERR_INVALID_BODY", err.Error(), client.ClientID)
		return
	}
	reason := "cancelled by developer client"
	if len(body) > 0 {
		reasonValue := jsonField(body, "reason")
		if reasonValue != "" {
			reason = reasonValue
		}
	}
	canonicalBody, _ := json.Marshal(map[string]any{"id": orderID, "status": "cancelled", "notes": reason})
	h.executeIdempotent(w, r, client, "order.cancel", canonicalBody, func(key string) (int, []byte) {
		if client.Environment == "sandbox" {
			order, cancelErr := h.store.CancelSandboxOrder(r.Context(), client, orderID)
			if cancelErr != nil {
				return http.StatusNotFound, genericNotFound()
			}
			return http.StatusOK, order.Payload
		}
		status, response, callErr := h.orderClient.Cancel(r.Context(), client.OwnerUserID, orderID, canonicalBody, key)
		if callErr != nil {
			return http.StatusBadGateway, genericUpstreamError()
		}
		return statusBody(status, response)
	})
}

func (h *Handler) handleTrackOrder(w http.ResponseWriter, r *http.Request, client Client, orderID string) {
	if err := RequireScope(client, "tracking:read"); err != nil {
		writeError(w, http.StatusForbidden, "ERR_SCOPE_REQUIRED", "tracking:read scope is required", client.ClientID)
		return
	}
	if !validResourceID(orderID) {
		writeError(w, http.StatusBadRequest, "ERR_INVALID_ORDER_ID", "Order ID is invalid", client.ClientID)
		return
	}
	if client.Environment == "sandbox" {
		order, err := h.store.GetSandboxOrder(r.Context(), client, orderID)
		if err != nil {
			writeError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Order not found", client.ClientID)
			return
		}
		var stored map[string]any
		_ = json.Unmarshal(order.Payload, &stored)
		writeJSON(w, http.StatusOK, map[string]any{"sandbox": true, "order_id": orderID, "status": stored["status"], "events": []any{}})
		return
	}
	// The order-service tracking handler is intentionally a narrow tracking
	// projection and does not perform customer authorization itself. Resolve the
	// order first through its owner-aware handler so a developer credential can
	// never use tracking as an order-existence oracle for another customer.
	orderStatus, orderResponse, err := h.orderClient.Get(r.Context(), client.OwnerUserID, orderID)
	if err != nil {
		writeError(w, http.StatusBadGateway, "ERR_ORDER_SERVICE_UNAVAILABLE", "Order service is temporarily unavailable", client.ClientID)
		return
	}
	orderStatus, orderResponse = statusBody(orderStatus, orderResponse)
	if orderStatus < 200 || orderStatus >= 300 {
		writeRawJSON(w, orderStatus, orderResponse)
		return
	}
	status, response, err := h.orderClient.Track(r.Context(), client.OwnerUserID, orderID)
	if err != nil {
		writeError(w, http.StatusBadGateway, "ERR_ORDER_SERVICE_UNAVAILABLE", "Order service is temporarily unavailable", client.ClientID)
		return
	}
	status, response = statusBody(status, response)
	writeRawJSON(w, status, response)
}

func (h *Handler) handleWebhooks(w http.ResponseWriter, r *http.Request, client Client, parts []string) {
	if len(parts) == 0 && r.Method == http.MethodPost {
		if err := RequireScope(client, "webhooks:write"); err != nil {
			writeError(w, http.StatusForbidden, "ERR_SCOPE_REQUIRED", "webhooks:write scope is required", client.ClientID)
			return
		}
		body, err := readBody(r)
		if err != nil {
			writeError(w, http.StatusBadRequest, "ERR_INVALID_BODY", err.Error(), client.ClientID)
			return
		}
		var request webhookSubscriptionRequest
		if json.Unmarshal(body, &request) != nil {
			writeError(w, http.StatusBadRequest, "ERR_INVALID_WEBHOOK_REQUEST", "Invalid webhook subscription", client.ClientID)
			return
		}
		endpoint := strings.TrimSpace(request.EndpointURL)
		if endpoint == "" {
			endpoint = strings.TrimSpace(request.URL)
		}
		if err := validateWebhookURL(endpoint, h.environment != "production"); err != nil || !validEventTypes(request.Events) {
			writeError(w, http.StatusBadRequest, "ERR_INVALID_WEBHOOK_REQUEST", "Webhook URL or events are invalid", client.ClientID)
			return
		}
		h.executeIdempotent(w, r, client, "webhook.create", body, func(string) (int, []byte) {
			sub, secret, createErr := h.store.CreateSubscription(r.Context(), client.ID, endpoint, request.Events)
			if createErr != nil {
				return http.StatusServiceUnavailable, genericStoreError()
			}
			return http.StatusCreated, mustJSON(map[string]any{
				"id": sub.ID, "endpoint_url": sub.EndpointURL, "events": sub.Events,
				"status": sub.Status, "signing_secret": secret,
				"secret_notice": "Store this secret now; it will not be returned again.",
			})
		})
		return
	}
	if len(parts) == 0 && r.Method == http.MethodGet {
		if err := RequireScope(client, "webhooks:read"); err != nil {
			writeError(w, http.StatusForbidden, "ERR_SCOPE_REQUIRED", "webhooks:read scope is required", client.ClientID)
			return
		}
		views, err := h.store.ListSubscriptions(r.Context(), client.ID)
		if err != nil {
			writeError(w, http.StatusServiceUnavailable, "ERR_STORAGE_UNAVAILABLE", "Developer API is temporarily unavailable", client.ClientID)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": views})
		return
	}
	if len(parts) == 2 && parts[1] == "deliveries" && r.Method == http.MethodGet {
		if err := RequireScope(client, "webhooks:read"); err != nil {
			writeError(w, http.StatusForbidden, "ERR_SCOPE_REQUIRED", "webhooks:read scope is required", client.ClientID)
			return
		}
		views, err := h.store.ListDeliveries(r.Context(), client.ID, parts[0])
		if err != nil {
			writeError(w, http.StatusServiceUnavailable, "ERR_STORAGE_UNAVAILABLE", "Developer API is temporarily unavailable", client.ClientID)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": views})
		return
	}
	if len(parts) == 1 && r.Method == http.MethodDelete {
		if err := RequireScope(client, "webhooks:write"); err != nil {
			writeError(w, http.StatusForbidden, "ERR_SCOPE_REQUIRED", "webhooks:write scope is required", client.ClientID)
			return
		}
		if !validUUID(parts[0]) {
			writeError(w, http.StatusBadRequest, "ERR_INVALID_WEBHOOK_ID", "Webhook ID is invalid", client.ClientID)
			return
		}
		body := []byte(`{"webhook_id":"` + parts[0] + `"}`)
		h.executeIdempotent(w, r, client, "webhook.revoke", body, func(string) (int, []byte) {
			if err := h.store.DeleteSubscription(r.Context(), client.ID, parts[0]); err != nil {
				return http.StatusNotFound, genericNotFound()
			}
			return http.StatusOK, mustJSON(map[string]any{"id": parts[0], "status": "revoked"})
		})
		return
	}
	writeError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", client.ClientID)
}

func (h *Handler) executeIdempotent(w http.ResponseWriter, r *http.Request, client Client, operation string, body []byte, run func(string) (int, []byte)) {
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if key == "" {
		key = strings.TrimSpace(r.Header.Get("X-Idempotency-Key"))
	}
	if !validIdempotencyKey(key) {
		writeError(w, http.StatusBadRequest, "ERR_IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key must be 12-160 safe characters", client.ClientID)
		return
	}
	hash := sha256.Sum256(body)
	replay, err := h.store.ReserveIdempotency(r.Context(), client.ID, operation, key, hex.EncodeToString(hash[:]))
	if err != nil {
		switch {
		case errors.Is(err, ErrIdempotencyConflict):
			writeError(w, http.StatusConflict, "ERR_IDEMPOTENCY_CONFLICT", "Idempotency key was used with a different payload", client.ClientID)
		case errors.Is(err, ErrIdempotencyRunning):
			writeError(w, http.StatusConflict, "ERR_IDEMPOTENCY_IN_PROGRESS", "The same request is still processing", client.ClientID)
		default:
			h.logger.ErrorContext(r.Context(), "developer idempotency unavailable", "client_id", client.ClientID, "operation", operation, "error", err)
			writeError(w, http.StatusServiceUnavailable, "ERR_IDEMPOTENCY_UNAVAILABLE", "Developer API is temporarily unavailable", client.ClientID)
		}
		return
	}
	if replay.Replay {
		writeRawJSON(w, replay.Status, replay.Response)
		return
	}
	status, response := run(key)
	h.store.CompleteIdempotency(r.Context(), client.ID, operation, key, status, response)
	writeRawJSON(w, status, response)
}

func (h *Handler) handleProvisionClient(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost || h.internalKey == "" || !constantTimeEqual(r.Header.Get("X-Internal-Api-Key"), h.internalKey) {
		writeError(w, http.StatusUnauthorized, "ERR_INTERNAL_UNAUTHORIZED", "Internal authorization required", "")
		return
	}
	body, err := readBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ERR_INVALID_BODY", err.Error(), "")
		return
	}
	var request clientProvisionRequest
	if json.Unmarshal(body, &request) != nil || strings.TrimSpace(request.Name) == "" || !validUUID(request.OwnerUserID) {
		writeError(w, http.StatusBadRequest, "ERR_INVALID_CLIENT_REQUEST", "name and a valid owner_user_id are required", "")
		return
	}
	request.Environment = strings.ToLower(strings.TrimSpace(request.Environment))
	if request.Environment != "live" && request.Environment != "sandbox" {
		writeError(w, http.StatusBadRequest, "ERR_INVALID_CLIENT_REQUEST", "environment must be live or sandbox", "")
		return
	}
	if len(request.Scopes) == 0 {
		request.Scopes = []string{"quotes:read", "orders:read", "orders:write", "orders:cancel", "tracking:read"}
	}
	if !validScopes(request.Scopes) {
		writeError(w, http.StatusBadRequest, "ERR_INVALID_CLIENT_REQUEST", "one or more scopes are invalid", "")
		return
	}
	if request.QuotaPerMinute <= 0 || request.QuotaPerMinute > 10000 {
		request.QuotaPerMinute = 60
	}
	client, apiKey, err := h.store.CreateClient(r.Context(), request.Name, request.OwnerUserID, request.Environment, request.Scopes, request.QuotaPerMinute)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "ERR_STORAGE_UNAVAILABLE", "Developer API is temporarily unavailable", "")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"client_id": client.ClientID, "environment": client.Environment, "scopes": client.Scopes,
		"quota_per_minute": client.QuotaPerMinute, "api_key": apiKey,
		"secret_notice": "Store this API key now; it will not be returned again.",
	})
}

func readBody(r *http.Request) ([]byte, error) {
	body, err := io.ReadAll(io.LimitReader(r.Body, maxRequestBody+1))
	if err != nil {
		return nil, err
	}
	if len(body) > maxRequestBody {
		return nil, errors.New("request body is too large")
	}
	return body, nil
}

func validateCreateBody(body []byte) error {
	if !json.Valid(body) {
		return errors.New("request body must be valid JSON")
	}
	if strings.TrimSpace(jsonField(body, "estimate_id")) == "" || len(strings.TrimSpace(jsonField(body, "item_description"))) < 5 {
		return errors.New("estimate_id and item_description are required")
	}
	return nil
}

func jsonField(body []byte, field string) string {
	var value map[string]any
	if json.Unmarshal(body, &value) != nil {
		return ""
	}
	result, _ := value[field].(string)
	return strings.TrimSpace(result)
}

func validResourceID(value string) bool {
	if len(value) == 0 || len(value) > 80 || strings.ContainsAny(value, "/?&#") {
		return false
	}
	return true
}

func validScopes(scopes []string) bool {
	allowed := map[string]bool{"quotes:read": true, "orders:read": true, "orders:write": true, "orders:cancel": true, "tracking:read": true, "webhooks:read": true, "webhooks:write": true}
	for _, scope := range scopes {
		if !allowed[scope] {
			return false
		}
	}
	return true
}

func mustJSON(value any) []byte {
	encoded, _ := json.Marshal(value)
	return encoded
}

func genericUpstreamError() []byte {
	return mustJSON(map[string]any{"status": "error", "code": "ERR_ORDER_SERVICE_UNAVAILABLE", "message": "Order service is temporarily unavailable", "retryable": true})
}

func genericStoreError() []byte {
	return mustJSON(map[string]any{"status": "error", "code": "ERR_STORAGE_UNAVAILABLE", "message": "Developer API is temporarily unavailable", "retryable": true})
}

func genericNotFound() []byte {
	return mustJSON(map[string]any{"status": "error", "code": "ERR_NOT_FOUND", "message": "Resource not found"})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	writeRawJSON(w, status, mustJSON(value))
}

func writeRawJSON(w http.ResponseWriter, status int, body []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = io.Copy(w, bytes.NewReader(body))
}

func writeError(w http.ResponseWriter, status int, code, message, clientID string) {
	writeJSON(w, status, map[string]any{"status": "error", "code": code, "message": message})
}

func (h *Handler) RunWorkers(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = 5 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		if err := h.store.SyncOutboxEvents(ctx); err != nil {
			h.logger.ErrorContext(ctx, "developer outbox sync failed", "error", err)
		}
		for i := 0; i < 10; i++ {
			if err := h.deliverOne(ctx); err != nil {
				h.logger.ErrorContext(ctx, "developer webhook delivery failed", "error", err)
				break
			}
		}
		h.store.CleanupRateWindows(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (h *Handler) deliverOne(ctx context.Context) error {
	delivery, err := h.store.ClaimDelivery(ctx)
	if err != nil || delivery == nil {
		return err
	}
	secret, err := h.store.SecretForDelivery(*delivery)
	if err != nil {
		return h.store.MarkDeliveryFailure(ctx, *delivery, 0, "webhook signing secret unavailable")
	}
	now := time.Now().UTC()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, delivery.EndpointURL, bytes.NewReader(delivery.Payload))
	if err != nil {
		return h.store.MarkDeliveryFailure(ctx, *delivery, 0, "invalid webhook endpoint")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Lancar-Developer-Webhooks/1.0")
	req.Header.Set("X-Lancar-Delivery-ID", delivery.ID)
	req.Header.Set("X-Lancar-Event-ID", jsonField(delivery.Payload, "id"))
	req.Header.Set("X-Lancar-Timestamp", fmt.Sprintf("%d", now.Unix()))
	req.Header.Set("X-Lancar-Signature", SignWebhook(secret, now, delivery.Payload))
	response, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return h.store.MarkDeliveryFailure(ctx, *delivery, 0, "webhook request failed")
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
	if response.StatusCode >= 200 && response.StatusCode < 300 {
		return h.store.MarkDeliverySuccess(ctx, delivery.ID, response.StatusCode)
	}
	return h.store.MarkDeliveryFailure(ctx, *delivery, response.StatusCode, "webhook endpoint returned non-success status")
}
