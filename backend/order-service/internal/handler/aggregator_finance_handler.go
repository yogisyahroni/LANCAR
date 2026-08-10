package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
)

func extractUUIDFromPath(path string) (uuid.UUID, error) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 {
		return uuid.Nil, fmt.Errorf("missing uuid in path")
	}
	return uuid.Parse(parts[len(parts)-1])
}

type AggregatorFinanceHandler struct {
	svc  domain.AggregatorFinanceService
	repo domain.AggregatorFinanceRepository
}

func NewAggregatorFinanceHandler(svc domain.AggregatorFinanceService, repo domain.AggregatorFinanceRepository) *AggregatorFinanceHandler {
	return &AggregatorFinanceHandler{svc: svc, repo: repo}
}

type CreateInvoiceRequest struct {
	InvoiceNumber      string                       `json:"invoice_number"`
	ProviderName       string                       `json:"provider_name"`
	BillingPeriodStart string                       `json:"billing_period_start"`
	BillingPeriodEnd   string                       `json:"billing_period_end"`
	Notes              string                       `json:"notes"`
	Items              []domain.ProviderInvoiceItem `json:"items"`
}

func (h *AggregatorFinanceHandler) ImportInvoice(w http.ResponseWriter, r *http.Request) {
	var req CreateInvoiceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	start, _ := time.Parse("2006-01-02", req.BillingPeriodStart)
	if start.IsZero() {
		start, _ = time.Parse(time.RFC3339, req.BillingPeriodStart)
	}
	end, _ := time.Parse("2006-01-02", req.BillingPeriodEnd)
	if end.IsZero() {
		end, _ = time.Parse(time.RFC3339, req.BillingPeriodEnd)
	}

	inv := &domain.ProviderInvoice{
		InvoiceNumber:      req.InvoiceNumber,
		ProviderName:       req.ProviderName,
		BillingPeriodStart: start,
		BillingPeriodEnd:   end,
		Notes:              req.Notes,
	}

	if err := h.svc.CreateInvoice(r.Context(), inv, req.Items); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(inv)
}

func (h *AggregatorFinanceHandler) ListInvoices(w http.ResponseWriter, r *http.Request) {
	providerName := r.URL.Query().Get("provider_name")
	status := r.URL.Query().Get("status")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 {
		limit = 50
	}

	invoices, err := h.repo.ListInvoices(r.Context(), providerName, status, limit, offset)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"invoices": invoices})
}

func (h *AggregatorFinanceHandler) ReconcileInvoice(w http.ResponseWriter, r *http.Request) {
	id, err := extractUUIDFromPath(r.URL.Path)
	if err != nil {
		http.Error(w, "invalid invoice id", http.StatusBadRequest)
		return
	}

	res, err := h.svc.ReconcileInvoice(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(res)
}

func (h *AggregatorFinanceHandler) ApproveInvoice(w http.ResponseWriter, r *http.Request) {
	id, err := extractUUIDFromPath(r.URL.Path)
	if err != nil {
		http.Error(w, "invalid invoice id", http.StatusBadRequest)
		return
	}

	var body struct {
		ApproverID string `json:"approver_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	approverUID, _ := uuid.Parse(body.ApproverID)

	if err := h.svc.ApproveInvoice(r.Context(), id, approverUID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"status": "APPROVED"})
}

func (h *AggregatorFinanceHandler) ListPolicies(w http.ResponseWriter, r *http.Request) {
	policies, err := h.repo.ListPolicies(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"policies": policies})
}

func (h *AggregatorFinanceHandler) UpdatePolicy(w http.ResponseWriter, r *http.Request) {
	var pol domain.LogisticsExceptionPolicy
	if err := json.NewDecoder(r.Body).Decode(&pol); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.repo.CreateOrUpdatePolicy(r.Context(), &pol); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(pol)
}

func (h *AggregatorFinanceHandler) SubmitClaim(w http.ResponseWriter, r *http.Request) {
	var claim domain.LogisticsExceptionClaim
	if err := json.NewDecoder(r.Body).Decode(&claim); err != nil {
		http.Error(w, "invalid claim payload", http.StatusBadRequest)
		return
	}

	res, err := h.svc.SubmitClaim(r.Context(), &claim)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(res)
}

func (h *AggregatorFinanceHandler) ListClaims(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 {
		limit = 50
	}

	claims, err := h.repo.ListClaims(r.Context(), status, limit, offset)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"claims": claims})
}

func (h *AggregatorFinanceHandler) ResolveClaim(w http.ResponseWriter, r *http.Request) {
	id, err := extractUUIDFromPath(r.URL.Path)
	if err != nil {
		http.Error(w, "invalid claim id", http.StatusBadRequest)
		return
	}

	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Status == "" {
		http.Error(w, "invalid status", http.StatusBadRequest)
		return
	}

	if err := h.svc.ResolveClaim(r.Context(), id, body.Status); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"id": id, "status": body.Status})
}
