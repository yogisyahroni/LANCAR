package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

// InternalMerchantCancel is the service-to-service boundary used by the
// merchant portal when a food order has already been accepted. The merchant
// service owns the portal session, while order-service remains the sole owner
// of the canonical lifecycle, courier release, and refund side effects.
func (h *OrderHandler) InternalMerchantCancel(w http.ResponseWriter, r *http.Request) {
	correlationID := middleware.GetCorrelationID(r.Context())
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", correlationID)
		return
	}
	if !middleware.RequireInternalAPIKey(r, os.Getenv("INTERNAL_API_KEY"), r.Header.Get("X-Internal-Api-Key"), "order.merchant_cancel") {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "internal access required", correlationID)
		return
	}

	var req struct {
		OrderID                 string `json:"order_id"`
		MerchantID              string `json:"merchant_id"`
		ActorID                 string `json:"actor_id"`
		Reason                  string `json:"reason"`
		RejectReason            string `json:"reject_reason,omitempty"`
		ChargeCancellationFeeTo string `json:"charge_cancellation_fee_to,omitempty"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16*1024)).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid JSON body", correlationID)
		return
	}
	req.OrderID = strings.TrimSpace(req.OrderID)
	req.MerchantID = strings.TrimSpace(req.MerchantID)
	req.ActorID = strings.TrimSpace(req.ActorID)
	req.Reason = strings.TrimSpace(req.Reason)
	req.RejectReason = strings.TrimSpace(req.RejectReason)
	req.ChargeCancellationFeeTo = strings.ToLower(strings.TrimSpace(req.ChargeCancellationFeeTo))
	if req.OrderID == "" || req.MerchantID == "" || req.ActorID == "" || req.Reason == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "order_id, merchant_id, actor_id, dan reason wajib diisi", correlationID)
		return
	}
	if len(req.Reason) > 500 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Alasan pembatalan terlalu panjang", correlationID)
		return
	}
	if req.ChargeCancellationFeeTo != "" && req.ChargeCancellationFeeTo != "merchant" && req.ChargeCancellationFeeTo != "customer" && req.ChargeCancellationFeeTo != "none" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "charge_cancellation_fee_to tidak valid", correlationID)
		return
	}

	order, err := h.orderSvc.GetOrder(r.Context(), req.OrderID)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}
	if order == nil {
		middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Order tidak ditemukan", correlationID)
		return
	}
	if order.ServiceSubType != "food_delivery" || order.MerchantID == nil || strings.TrimSpace(*order.MerchantID) != req.MerchantID {
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Order bukan milik merchant ini", correlationID)
		return
	}

	transitioner, ok := h.orderSvc.(interface {
		UpdateStatusWithActor(context.Context, string, domain.OrderStatus, string, domain.OrderActor, string, string) error
	})
	if !ok {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Lifecycle order belum tersedia", correlationID)
		return
	}
	idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if idempotencyKey == "" {
		idempotencyKey = "merchant-order:cancel:" + req.OrderID
	}
	if policyTransitioner, supportsPolicy := h.orderSvc.(interface {
		UpdateStatusWithActorAndPolicy(context.Context, string, domain.OrderStatus, string, domain.OrderActor, string, string, string, string) error
	}); supportsPolicy {
		if err := policyTransitioner.UpdateStatusWithActorAndPolicy(r.Context(), req.OrderID, domain.StatusCancelled, req.ActorID, domain.OrderActorMerchant, req.Reason, idempotencyKey, req.ChargeCancellationFeeTo, req.RejectReason); err != nil {
			userSafeError(w, r, err, http.StatusConflict)
			return
		}
	} else if err := transitioner.UpdateStatusWithActor(r.Context(), req.OrderID, domain.StatusCancelled, req.ActorID, domain.OrderActorMerchant, req.Reason, idempotencyKey); err != nil {
		userSafeError(w, r, err, http.StatusConflict)
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, map[string]any{
		"order_id":                   req.OrderID,
		"status":                     domain.StatusCancelled,
		"previous_status":            order.Status,
		"reason":                     req.Reason,
		"reject_reason":              req.RejectReason,
		"charge_cancellation_fee_to": req.ChargeCancellationFeeTo,
	})
}
