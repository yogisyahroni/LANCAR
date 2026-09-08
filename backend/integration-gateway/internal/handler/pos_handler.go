package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"tembus/integration-gateway/internal/domain"
)

type POSHandler struct {
	registry domain.POSProviderRegistry
	repo     domain.POSRepository
}

func NewPOSHandler(registry domain.POSProviderRegistry, repo domain.POSRepository) *POSHandler {
	return &POSHandler{registry: registry, repo: repo}
}

type receivePOSOrderRequest struct {
	Provider       string          `json:"provider"`
	MerchantID     string          `json:"merchant_id"`
	BranchID       string          `json:"branch_id,omitempty"`
	OrderID        string          `json:"order_id"`
	IdempotencyKey string          `json:"idempotency_key,omitempty"`
	Payload        json.RawMessage `json:"payload"`
}

type syncPOSRequest struct {
	Provider         string          `json:"provider"`
	MerchantID       string          `json:"merchant_id"`
	BranchID         string          `json:"branch_id,omitempty"`
	ResourceID       string          `json:"resource_id"`
	CanonicalVersion int64           `json:"canonical_version"`
	IdempotencyKey   string          `json:"idempotency_key,omitempty"`
	Source           string          `json:"source"`
	Payload          json.RawMessage `json:"payload"`
}

func (h *POSHandler) ReceiveOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.respondError(w, http.StatusMethodNotAllowed, "method not allowed", "ERR_METHOD_NOT_ALLOWED")
		return
	}
	var req receivePOSOrderRequest
	if err := decodeJSON(w, r, &req); err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid POS order request", "ERR_INVALID_REQUEST")
		return
	}
	req.Provider = normalizeProvider(req.Provider)
	if err := validatePOSIdentifiers(req.MerchantID, req.BranchID, req.OrderID); err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error(), "ERR_INVALID_POS_ORDER")
		return
	}
	key := requestIdempotencyKey(r, req.IdempotencyKey)
	if !validIdempotencyKey(key) {
		h.respondError(w, http.StatusBadRequest, "idempotency_key wajib 12-160 karakter", "ERR_IDEMPOTENCY_KEY_REQUIRED")
		return
	}
	if len(req.Payload) == 0 || !json.Valid(req.Payload) {
		h.respondError(w, http.StatusBadRequest, "payload POS wajib berupa JSON", "ERR_INVALID_POS_PAYLOAD")
		return
	}
	registration, ok := h.registry.Get(req.Provider)
	if !ok {
		h.respondError(w, http.StatusBadRequest, "POS provider tidak terdaftar", "ERR_POS_PROVIDER_NOT_FOUND")
		return
	}
	if registration.Order == nil {
		h.respondError(w, http.StatusNotImplemented, "POS provider tidak mendukung order receipt", "ERR_POS_CAPABILITY_UNSUPPORTED")
		return
	}
	if h.repo == nil {
		h.respondError(w, http.StatusServiceUnavailable, "POS delivery state belum tersedia", "ERR_POS_STATE_UNAVAILABLE")
		return
	}
	hash := requestHash(req.Provider, req.MerchantID, req.BranchID, req.OrderID, req.Payload)
	delivery, duplicate, inProgress, err := h.repo.BeginOrderDelivery(r.Context(), domain.POSOrderRequest{
		MerchantID: req.MerchantID, BranchID: req.BranchID, OrderID: req.OrderID,
		IdempotencyKey: key, Payload: req.Payload,
	}, req.Provider, hash)
	if err != nil {
		h.respondPersistenceError(w, err)
		return
	}
	if inProgress {
		h.writeDelivery(w, http.StatusAccepted, delivery, false, true)
		return
	}
	if duplicate && delivery.Status == "acknowledged" {
		h.writeDelivery(w, http.StatusOK, delivery, true, false)
		return
	}

	if !h.providerAvailable(r, req.Provider, registration) {
		_ = h.repo.FinishOrderDelivery(r.Context(), delivery.ID, "failed", "", "POS provider is unavailable")
		delivery.Status = "failed"
		delivery.LastError = "POS provider is unavailable"
		h.writeDelivery(w, http.StatusServiceUnavailable, delivery, false, false)
		return
	}
	receipt, callErr := registration.Order.ReceiveOrder(r.Context(), domain.POSOrderRequest{
		MerchantID: req.MerchantID, BranchID: req.BranchID, OrderID: req.OrderID,
		IdempotencyKey: key, Payload: req.Payload,
	})
	if callErr != nil || receipt == nil || !receipt.Accepted {
		message := "POS provider did not acknowledge order receipt"
		if callErr != nil {
			message = callErr.Error()
		}
		if finishErr := h.repo.FinishOrderDelivery(r.Context(), delivery.ID, "failed", "", message); finishErr != nil {
			message = "POS delivery failed and its state could not be persisted"
		}
		delivery.Status = "failed"
		delivery.LastError = message
		h.writeDelivery(w, http.StatusBadGateway, delivery, false, false)
		return
	}
	if err := h.repo.FinishOrderDelivery(r.Context(), delivery.ID, "acknowledged", receipt.ProviderReceiptID, ""); err != nil {
		h.respondError(w, http.StatusServiceUnavailable, "POS receipt persisted state unavailable", "ERR_POS_STATE_UNAVAILABLE")
		return
	}
	delivery.Status = "acknowledged"
	delivery.MerchantReceived = true
	delivery.ProviderReceiptID = receipt.ProviderReceiptID
	delivery.LastError = ""
	h.writeDelivery(w, http.StatusOK, delivery, true, false)
}

func (h *POSHandler) SyncCatalog(w http.ResponseWriter, r *http.Request) {
	h.sync(w, r, "catalog")
}

func (h *POSHandler) SyncInventory(w http.ResponseWriter, r *http.Request) {
	h.sync(w, r, "inventory")
}

func (h *POSHandler) sync(w http.ResponseWriter, r *http.Request, resourceType string) {
	if r.Method != http.MethodPost {
		h.respondError(w, http.StatusMethodNotAllowed, "method not allowed", "ERR_METHOD_NOT_ALLOWED")
		return
	}
	var req syncPOSRequest
	if err := decodeJSON(w, r, &req); err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid POS sync request", "ERR_INVALID_REQUEST")
		return
	}
	req.Provider = normalizeProvider(req.Provider)
	if err := validatePOSIdentifiers(req.MerchantID, req.BranchID, ""); err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error(), "ERR_INVALID_POS_SYNC")
		return
	}
	if strings.TrimSpace(req.ResourceID) == "" || len(req.ResourceID) > 160 || req.CanonicalVersion < 1 {
		h.respondError(w, http.StatusBadRequest, "resource_id dan canonical_version wajib valid", "ERR_INVALID_POS_SYNC")
		return
	}
	if err := domain.ValidatePOSMutationSource(strings.ToLower(strings.TrimSpace(req.Source))); err != nil {
		h.respondError(w, http.StatusConflict, err.Error(), "ERR_CANONICAL_OWNERSHIP_CONFLICT")
		return
	}
	key := requestIdempotencyKey(r, req.IdempotencyKey)
	if !validIdempotencyKey(key) {
		h.respondError(w, http.StatusBadRequest, "idempotency_key wajib 12-160 karakter", "ERR_IDEMPOTENCY_KEY_REQUIRED")
		return
	}
	if len(req.Payload) == 0 || !json.Valid(req.Payload) {
		h.respondError(w, http.StatusBadRequest, "payload POS wajib berupa JSON", "ERR_INVALID_POS_PAYLOAD")
		return
	}
	registration, ok := h.registry.Get(req.Provider)
	if !ok {
		h.respondError(w, http.StatusBadRequest, "POS provider tidak terdaftar", "ERR_POS_PROVIDER_NOT_FOUND")
		return
	}
	var syncer domain.POSCatalogSyncer
	if resourceType == "catalog" {
		syncer = registration.Catalog
	} else if registration.Inventory != nil {
		// Inventory uses the same provider-neutral envelope shape; the
		// registration remains capability-specific at the adapter boundary.
		// The concrete request is converted below.
	}
	if resourceType == "catalog" && syncer == nil {
		h.respondError(w, http.StatusNotImplemented, "POS provider tidak mendukung catalog sync", "ERR_POS_CAPABILITY_UNSUPPORTED")
		return
	}
	if resourceType == "inventory" && registration.Inventory == nil {
		h.respondError(w, http.StatusNotImplemented, "POS provider tidak mendukung inventory sync", "ERR_POS_CAPABILITY_UNSUPPORTED")
		return
	}
	if h.repo == nil {
		h.respondError(w, http.StatusServiceUnavailable, "POS sync state belum tersedia", "ERR_POS_STATE_UNAVAILABLE")
		return
	}
	canonicalReq := domain.POSCatalogSyncRequest{
		MerchantID: req.MerchantID, BranchID: req.BranchID, ResourceID: req.ResourceID,
		CanonicalVersion: req.CanonicalVersion, IdempotencyKey: key, Payload: req.Payload,
	}
	op, duplicate, inProgress, err := h.repo.BeginSyncOperation(r.Context(), resourceType, canonicalReq, req.Provider,
		requestHash(req.Provider, req.MerchantID, req.BranchID, req.ResourceID, req.Payload))
	if err != nil {
		h.respondPersistenceError(w, err)
		return
	}
	if inProgress {
		h.respondJSON(w, http.StatusAccepted, map[string]any{"success": false, "status": "pending", "operation": op, "retryable": true})
		return
	}
	if duplicate && op.Status == "acknowledged" {
		h.respondJSON(w, http.StatusOK, map[string]any{"success": true, "status": "acknowledged", "operation": op, "server_authoritative": true})
		return
	}
	if !h.providerAvailable(r, req.Provider, registration) {
		_ = h.repo.FinishSyncOperation(r.Context(), op.ID, "failed", "", "POS provider is unavailable")
		op.Status, op.LastError = "failed", "POS provider is unavailable"
		h.respondJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "status": op.Status, "operation": op, "retryable": true})
		return
	}
	var receipt *domain.POSSynchronizationReceipt
	if resourceType == "catalog" {
		receipt, err = registration.Catalog.SyncCatalog(r.Context(), canonicalReq)
	} else {
		receipt, err = registration.Inventory.SyncInventory(r.Context(), domain.POSInventorySyncRequest{
			MerchantID: req.MerchantID, BranchID: req.BranchID, ResourceID: req.ResourceID,
			CanonicalVersion: req.CanonicalVersion, IdempotencyKey: key, Payload: req.Payload,
		})
	}
	if err != nil || receipt == nil || !receipt.Accepted {
		message := "POS provider did not acknowledge sync"
		if err != nil {
			message = err.Error()
		}
		_ = h.repo.FinishSyncOperation(r.Context(), op.ID, "failed", "", message)
		op.Status, op.LastError = "failed", message
		h.respondJSON(w, http.StatusBadGateway, map[string]any{"success": false, "status": op.Status, "operation": op, "retryable": true})
		return
	}
	if err := h.repo.FinishSyncOperation(r.Context(), op.ID, "acknowledged", receipt.ProviderReceiptID, ""); err != nil {
		h.respondError(w, http.StatusServiceUnavailable, "POS sync receipt persisted state unavailable", "ERR_POS_STATE_UNAVAILABLE")
		return
	}
	op.Status, op.ProviderReceiptID, op.LastError = "acknowledged", receipt.ProviderReceiptID, ""
	h.respondJSON(w, http.StatusOK, map[string]any{
		"success": true, "status": op.Status, "operation": op,
		"canonical_owner": domain.POSCanonicalOwner, "server_authoritative": true,
	})
}

func (h *POSHandler) Health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		h.respondError(w, http.StatusMethodNotAllowed, "method not allowed", "ERR_METHOD_NOT_ALLOWED")
		return
	}
	runtimeHealth := h.registry.Health(r.Context())
	persistError := ""
	if h.repo != nil {
		for _, health := range runtimeHealth {
			if err := h.repo.RecordHealth(r.Context(), health); err != nil {
				persistError = "POS health state could not be persisted"
				break
			}
		}
	}
	if persistError != "" {
		h.respondJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "runtime": runtimeHealth, "error": persistError})
		return
	}
	var durable []domain.POSHealth
	if h.repo != nil {
		var err error
		durable, err = h.repo.ListHealth(r.Context(), strings.TrimSpace(r.URL.Query().Get("merchant_id")))
		if err != nil {
			h.respondJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "runtime": runtimeHealth, "error": "POS health state could not be loaded"})
			return
		}
	}
	h.respondJSON(w, http.StatusOK, map[string]any{"success": true, "runtime": runtimeHealth, "data": durable})
}

func (h *POSHandler) Reconciliation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		h.respondError(w, http.StatusMethodNotAllowed, "method not allowed", "ERR_METHOD_NOT_ALLOWED")
		return
	}
	if h.repo == nil {
		h.respondError(w, http.StatusServiceUnavailable, "POS reconciliation state belum tersedia", "ERR_POS_STATE_UNAVAILABLE")
		return
	}
	merchantID := strings.TrimSpace(r.URL.Query().Get("merchant_id"))
	if merchantID != "" {
		if _, err := uuid.Parse(merchantID); err != nil {
			h.respondError(w, http.StatusBadRequest, "merchant_id tidak valid", "ERR_INVALID_MERCHANT_ID")
			return
		}
	}
	items, err := h.repo.ListReconciliation(r.Context(), merchantID, 100)
	if err != nil {
		h.respondJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "error": "POS reconciliation state could not be loaded"})
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]any{"success": true, "data": items, "server_authoritative": true})
}

func (h *POSHandler) providerAvailable(r *http.Request, code string, registration domain.POSProviderRegistration) bool {
	if registration.Health == nil {
		return true
	}
	health := registration.Health.CheckHealth(r.Context())
	if h.repo != nil {
		_ = h.repo.RecordHealth(r.Context(), health)
	}
	return health.State == "healthy" || health.State == "degraded"
}

func validatePOSIdentifiers(merchantID, branchID, orderID string) error {
	if _, err := uuid.Parse(strings.TrimSpace(merchantID)); err != nil {
		return errors.New("merchant_id tidak valid")
	}
	if strings.TrimSpace(branchID) != "" {
		if _, err := uuid.Parse(strings.TrimSpace(branchID)); err != nil {
			return errors.New("branch_id tidak valid")
		}
	}
	if strings.TrimSpace(orderID) != "" {
		if _, err := uuid.Parse(strings.TrimSpace(orderID)); err != nil {
			return errors.New("order_id tidak valid")
		}
	}
	return nil
}

func requestIdempotencyKey(r *http.Request, bodyKey string) string {
	key := strings.TrimSpace(r.Header.Get("X-Idempotency-Key"))
	if key == "" {
		key = strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	}
	if key == "" {
		key = strings.TrimSpace(bodyKey)
	}
	return key
}

func validIdempotencyKey(key string) bool {
	return len(key) >= 12 && len(key) <= 160
}

func normalizeProvider(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func requestHash(values ...any) string {
	payload, _ := json.Marshal(values)
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 2*1024*1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}

func (h *POSHandler) writeDelivery(w http.ResponseWriter, status int, delivery *domain.POSOrderDelivery, success, retryable bool) {
	if delivery == nil {
		h.respondError(w, http.StatusServiceUnavailable, "POS delivery state unavailable", "ERR_POS_STATE_UNAVAILABLE")
		return
	}
	// A POS receipt means only "merchant system received the order". The customer order remains pending_merchant until the merchant acceptance transition runs in order-service.
	h.respondJSON(w, status, map[string]any{
		"success": success, "status": delivery.Status, "delivery": delivery,
		"merchant_received":     delivery.MerchantReceived,
		"customer_order_status": "pending_merchant",
		"customer_safe":         true, "retryable": retryable,
	})
}

func (h *POSHandler) respondPersistenceError(w http.ResponseWriter, err error) {
	if errors.Is(err, domain.ErrPOSIdempotencyConflict) {
		h.respondError(w, http.StatusConflict, "idempotency_key digunakan untuk payload berbeda", "ERR_IDEMPOTENCY_CONFLICT")
		return
	}
	if errors.Is(err, domain.ErrPOSDeliveryInProgress) {
		h.respondError(w, http.StatusAccepted, "POS delivery sedang diproses", "ERR_POS_DELIVERY_IN_PROGRESS")
		return
	}
	h.respondError(w, http.StatusServiceUnavailable, "POS delivery state unavailable", "ERR_POS_STATE_UNAVAILABLE")
}

func (h *POSHandler) respondError(w http.ResponseWriter, status int, message, code string) {
	h.respondJSON(w, status, map[string]any{"success": false, "error": message, "code": code})
}

func (h *POSHandler) respondJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
