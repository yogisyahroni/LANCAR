package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"

	"github.com/google/uuid"
)

// HandoffHandler implements CORE-2026-006 proof/PIN/QR/signature endpoints.
type HandoffHandler struct {
	svc HandoffService
}

// HandoffService is the interface the handler depends on.
type HandoffService interface {
	IssueProofToken(ctx context.Context, req domain.IssueProofTokenRequest, actorID, actorRole string) (*domain.ProofVerificationToken, string, error)
	VerifyProofToken(ctx context.Context, req domain.VerifyProofTokenRequest) (*domain.ProofVerificationResult, error)
	GetProofRequirements(ctx context.Context, serviceCategory, stage string) ([]domain.ProofRequirement, error)
}

// NewHandoffHandler constructs the proof chain-of-custody handler.
func NewHandoffHandler(svc HandoffService) *HandoffHandler {
	return &HandoffHandler{svc: svc}
}

// IssueProofToken issues a one-time OTP/PIN/QR token bound to order+stage+actor.
// POST /api/v1/orders/{id}/proof/token
func (h *HandoffHandler) IssueProofToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	orderID := strings.TrimPrefix(r.URL.Path, "/api/v1/orders/")
	orderID = strings.TrimSuffix(orderID, "/proof/token")

	actorID := middleware.GetUserIDFromContext(r.Context())
	actorRole := middleware.GetRoleFromContext(r.Context())
	if actorID == "" {
		cid := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", cid)
		return
	}

	if actorRole != "courier" && actorRole != "warehouse" && actorRole != "admin" && actorRole != "super_admin" {
		cid := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Only courier/warehouse/admin can issue proof tokens", cid)
		return
	}

	var body struct {
		Stage       string             `json:"stage"`
		TokenFormat domain.TokenFormat `json:"token_format"`
		MaxAttempts *int               `json:"max_attempts,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		cid := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid payload: "+err.Error(), cid)
		return
	}
	if body.Stage == "" {
		cid := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "stage is required", cid)
		return
	}

	stage, err := domain.ParseProofStage(body.Stage)
	if err != nil {
		cid := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", err.Error(), cid)
		return
	}

	maxAttempts := domain.DefaultMaxAttempts
	if body.MaxAttempts != nil && *body.MaxAttempts > 0 {
		maxAttempts = *body.MaxAttempts
	}

	token, plaintext, err := h.svc.IssueProofToken(r.Context(), domain.IssueProofTokenRequest{
		OrderID:       orderID,
		Stage:         stage,
		TokenFormat:   body.TokenFormat,
		ExpiresAt:     time.Now().Add(10 * time.Minute).UTC(),
		MaxAttempts:   maxAttempts,
	}, actorID, actorRole)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "already finalized") || strings.Contains(err.Error(), "already has proof") {
			status = http.StatusConflict
		} else if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		http.Error(w, err.Error(), status)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":       "success",
		"token_id":     token.ID,
		"plaintext":    plaintext,
		"token_format": token.TokenFormat,
		"expires_at":   token.ExpiresAt,
		"max_attempts": token.MaxAttempts,
		"stage":        token.Stage,
	})
}

// VerifyProofToken consumes a one-time token, enforcing single-use, expiry,
// max attempts, and actor/order binding.
// POST /api/v1/orders/{id}/proof/verify
func (h *HandoffHandler) VerifyProofToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	orderID := strings.TrimPrefix(r.URL.Path, "/api/v1/orders/")
	orderID = strings.TrimSuffix(orderID, "/proof/verify")

	actorID := middleware.GetUserIDFromContext(r.Context())
	actorRole := middleware.GetRoleFromContext(r.Context())
	if actorID == "" {
		cid := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", cid)
		return
	}
	_ = orderID

	var body struct {
		TokenID    string  `json:"token_id"`
		ProofValue string  `json:"proof_value"`
		PhotoURL   *string `json:"photo_url,omitempty"`
		Signature  *string `json:"signature,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		cid := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid payload: "+err.Error(), cid)
		return
	}
	if body.TokenID == "" || body.ProofValue == "" {
		cid := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "token_id and proof_value are required", cid)
		return
	}

	if _, err := uuid.Parse(body.TokenID); err != nil {
		cid := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "token_id must be a valid UUID", cid)
		return
	}

	result, err := h.svc.VerifyProofToken(r.Context(), domain.VerifyProofTokenRequest{
		TokenID:    body.TokenID,
		ActorID:    actorID,
		ActorRole:  actorRole,
		ProofValue: body.ProofValue,
		PhotoURL:   body.PhotoURL,
		Signature:  body.Signature,
	})
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "expired") {
			status = http.StatusForbidden
		} else if strings.Contains(err.Error(), "exhausted") {
			status = http.StatusTooManyRequests
		} else if strings.Contains(err.Error(), "used") {
			status = http.StatusConflict
		}
		http.Error(w, err.Error(), status)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":           "success",
		"consumed":         result.Consumed,
		"order_id":         result.OrderID,
		"stage":            result.Stage,
		"service_category": result.ServiceCategory,
	})
}

// GetProofRequirements returns the proof requirement matrix for a service+stage.
// GET /api/v1/proofs/requirements?service_category=food&stage=delivering
func (h *HandoffHandler) GetProofRequirements(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	serviceCategory := r.URL.Query().Get("service_category")
	stage := r.URL.Query().Get("stage")
	if serviceCategory == "" || stage == "" {
		cid := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "service_category and stage are required", cid)
		return
	}

	requirements, err := h.svc.GetProofRequirements(r.Context(), serviceCategory, stage)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "success",
		"requirements": requirements,
	})
}
