package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
	"tembus/order-service/internal/repository"
)

type CommunicationHandler struct {
	repo           *repository.CommunicationRepository
	internalAPIKey string
}

func NewCommunicationHandler(repo *repository.CommunicationRepository, key string) *CommunicationHandler {
	return &CommunicationHandler{repo: repo, internalAPIKey: key}
}
func (h *CommunicationHandler) CreateEvent(w http.ResponseWriter, r *http.Request) {
	if h.internalAPIKey != "" && r.Header.Get("X-Internal-Api-Key") != h.internalAPIKey {
		middleware.WriteError(w, 401, "ERR_UNAUTHORIZED", "internal access required", middleware.GetCorrelationID(r.Context()))
		return
	}
	var e domain.CommunicationEvent
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024)).Decode(&e) != nil || e.Validate() != nil {
		middleware.WriteError(w, 400, "ERR_BAD_REQUEST", "invalid semantic communication event", middleware.GetCorrelationID(r.Context()))
		return
	}
	created, err := h.repo.CreateEvent(r.Context(), e)
	if err != nil {
		log.Printf("communication event persistence failed event_id=%s: %v", e.EventID, err)
		middleware.WriteError(w, 500, "ERR_INTERNAL", "communication event unavailable", middleware.GetCorrelationID(r.Context()))
		return
	}
	middleware.WriteSuccess(w, 200, map[string]any{"accepted": true, "duplicate": !created, "event_id": e.EventID})
}
func (h *CommunicationHandler) Receipt(w http.ResponseWriter, r *http.Request) {
	if h.internalAPIKey != "" && r.Header.Get("X-Internal-Api-Key") != h.internalAPIKey {
		middleware.WriteError(w, 401, "ERR_UNAUTHORIZED", "internal access required", middleware.GetCorrelationID(r.Context()))
		return
	}
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		middleware.WriteError(w, 400, "ERR_BAD_REQUEST", "invalid delivery id", middleware.GetCorrelationID(r.Context()))
		return
	}
	var body struct {
		Status        string `json:"status"`
		ProviderCode  string `json:"provider_code"`
		ProviderError string `json:"provider_error"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || strings.TrimSpace(body.Status) == "" {
		middleware.WriteError(w, 400, "ERR_BAD_REQUEST", "status required", middleware.GetCorrelationID(r.Context()))
		return
	}
	if err := h.repo.Receipt(r.Context(), id, body.Status, body.ProviderCode, body.ProviderError); err != nil {
		middleware.WriteError(w, 400, "ERR_BAD_REQUEST", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}
	middleware.WriteSuccess(w, 200, map[string]string{"status": "ok"})
}

func (h *CommunicationHandler) ReplayDelivery(w http.ResponseWriter, r *http.Request) {
	if h.internalAPIKey != "" && r.Header.Get("X-Internal-Api-Key") != h.internalAPIKey {
		middleware.WriteError(w, 401, "ERR_UNAUTHORIZED", "internal access required", middleware.GetCorrelationID(r.Context()))
		return
	}
	if r.Method != http.MethodPost {
		middleware.WriteError(w, 405, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		middleware.WriteError(w, 400, "ERR_BAD_REQUEST", "invalid delivery id", middleware.GetCorrelationID(r.Context()))
		return
	}
	queued, err := h.repo.ReplayDelivery(r.Context(), id)
	if err != nil {
		middleware.WriteError(w, 500, "ERR_INTERNAL", "delivery replay unavailable", middleware.GetCorrelationID(r.Context()))
		return
	}
	middleware.WriteSuccess(w, 200, map[string]any{"queued": queued, "idempotent": true})
}

func communicationAdmin(w http.ResponseWriter, r *http.Request) bool {
	role := strings.TrimSpace(r.Header.Get("X-User-Role"))
	if role != "ops_admin" && role != "super_admin" && role != "admin" && role != "cs_agent" {
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "admin access required", middleware.GetCorrelationID(r.Context()))
		return false
	}
	return true
}

func communicationApprover(w http.ResponseWriter, r *http.Request) bool {
	role := strings.TrimSpace(r.Header.Get("X-User-Role"))
	if role != "ops_admin" && role != "super_admin" && role != "admin" {
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "template approval requires an authorized approver", middleware.GetCorrelationID(r.Context()))
		return false
	}
	return true
}

func (h *CommunicationHandler) Templates(w http.ResponseWriter, r *http.Request) {
	if !communicationAdmin(w, r) {
		return
	}
	market, locale := r.URL.Query().Get("market_code"), r.URL.Query().Get("locale")
	if market == "" {
		market = "id-jk"
	}
	if locale == "" {
		locale = "id-ID"
	}
	if r.Method == http.MethodGet {
		items, err := h.repo.ListTemplates(r.Context(), market, locale)
		if err != nil {
			middleware.WriteError(w, 500, "ERR_INTERNAL", "template list unavailable", middleware.GetCorrelationID(r.Context()))
			return
		}
		middleware.WriteSuccess(w, 200, items)
		return
	}
	if r.Method != http.MethodPost {
		middleware.WriteError(w, 405, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	var t domain.CommunicationTemplate
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024)).Decode(&t) != nil {
		middleware.WriteError(w, 400, "ERR_BAD_REQUEST", "template is invalid or missing typed variables", middleware.GetCorrelationID(r.Context()))
		return
	}
	if t.ApprovalStatus == "" {
		t.ApprovalStatus = "draft"
	}
	if t.Validate() != nil {
		middleware.WriteError(w, 400, "ERR_BAD_REQUEST", "template is invalid or missing typed variables", middleware.GetCorrelationID(r.Context()))
		return
	}
	if t.ProtectedCopy && t.ApprovalStatus == "approved" {
		middleware.WriteError(w, 400, "ERR_APPROVAL_REQUIRED", "protected copy must be approved through the separate approval endpoint", middleware.GetCorrelationID(r.Context()))
		return
	}
	actor, err := uuid.Parse(r.Header.Get("X-User-ID"))
	if err != nil {
		middleware.WriteError(w, 401, "ERR_UNAUTHORIZED", "invalid actor", middleware.GetCorrelationID(r.Context()))
		return
	}
	if err := h.repo.SaveTemplate(r.Context(), t, actor); err != nil {
		middleware.WriteError(w, 500, "ERR_INTERNAL", "template save failed", middleware.GetCorrelationID(r.Context()))
		return
	}
	middleware.WriteSuccess(w, 201, t)
}

// ApproveTemplate is a separate maker-checker step for protected copy. A
// template can be edited as draft, but it cannot be self-approved through the
// ordinary create/update endpoint.
func (h *CommunicationHandler) ApproveTemplate(w http.ResponseWriter, r *http.Request) {
	if !communicationApprover(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		middleware.WriteError(w, 405, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	var body struct {
		TemplateKey string                      `json:"template_key"`
		Version     int                         `json:"version"`
		MarketCode  string                      `json:"market_code"`
		Locale      string                      `json:"locale"`
		Channel     domain.CommunicationChannel `json:"channel"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 16*1024)).Decode(&body) != nil || strings.TrimSpace(body.TemplateKey) == "" || body.Version < 1 || strings.TrimSpace(body.MarketCode) == "" || strings.TrimSpace(body.Locale) == "" || body.Channel == "" {
		middleware.WriteError(w, 400, "ERR_BAD_REQUEST", "template identity is required", middleware.GetCorrelationID(r.Context()))
		return
	}
	actor, err := uuid.Parse(middleware.GetUserIDFromContext(r.Context()))
	if err != nil {
		middleware.WriteError(w, 401, "ERR_UNAUTHORIZED", "invalid actor", middleware.GetCorrelationID(r.Context()))
		return
	}
	if err := h.repo.ApproveTemplate(r.Context(), body.TemplateKey, body.Version, body.MarketCode, body.Locale, body.Channel, actor); err != nil {
		middleware.WriteError(w, 400, "ERR_BAD_REQUEST", "template approval failed", middleware.GetCorrelationID(r.Context()))
		return
	}
	middleware.WriteSuccess(w, http.StatusOK, map[string]string{"status": "approved"})
}

// CreateProtectedDraft is the maker step for legal/financial/safety copy.
// The draft is deliberately not publishable and must be approved separately.
func (h *CommunicationHandler) CreateProtectedDraft(w http.ResponseWriter, r *http.Request) {
	if !communicationAdmin(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		middleware.WriteError(w, 405, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	var t domain.CommunicationTemplate
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024)).Decode(&t) != nil || !t.ProtectedCopy {
		middleware.WriteError(w, 400, "ERR_BAD_REQUEST", "protected draft is required", middleware.GetCorrelationID(r.Context()))
		return
	}
	t.ApprovalStatus = "draft"
	validationCopy := t
	validationCopy.ProtectedCopy = false
	if validationCopy.Validate() != nil {
		middleware.WriteError(w, 400, "ERR_BAD_REQUEST", "template is invalid or missing typed variables", middleware.GetCorrelationID(r.Context()))
		return
	}
	actor, err := uuid.Parse(middleware.GetUserIDFromContext(r.Context()))
	if err != nil {
		middleware.WriteError(w, 401, "ERR_UNAUTHORIZED", "invalid actor", middleware.GetCorrelationID(r.Context()))
		return
	}
	if err := h.repo.SaveTemplate(r.Context(), t, actor); err != nil {
		log.Printf("protected communication template persistence failed template_key=%s: %v", t.TemplateKey, err)
		middleware.WriteError(w, 500, "ERR_INTERNAL", "protected template draft save failed", middleware.GetCorrelationID(r.Context()))
		return
	}
	middleware.WriteSuccess(w, http.StatusCreated, t)
}

func (h *CommunicationHandler) DeliveryHealth(w http.ResponseWriter, r *http.Request) {
	if !communicationAdmin(w, r) {
		return
	}
	items, err := h.repo.DeliveryHealth(r.Context())
	if err != nil {
		middleware.WriteError(w, 500, "ERR_INTERNAL", "delivery health unavailable", middleware.GetCorrelationID(r.Context()))
		return
	}
	middleware.WriteSuccess(w, 200, map[string]any{"window": "24h", "items": items})
}

func (h *CommunicationHandler) Preference(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(middleware.GetUserIDFromContext(r.Context()))
	if err != nil {
		middleware.WriteError(w, 401, "ERR_UNAUTHORIZED", "invalid user", middleware.GetCorrelationID(r.Context()))
		return
	}
	category, channel := r.URL.Query().Get("category"), r.URL.Query().Get("channel")
	if category == "" {
		category = "marketing"
	}
	if channel == "" {
		channel = "push"
	}
	if r.Method == http.MethodGet {
		p, e := h.repo.GetPreference(r.Context(), id, category, channel)
		if e != nil {
			middleware.WriteError(w, 500, "ERR_INTERNAL", "preference unavailable", middleware.GetCorrelationID(r.Context()))
			return
		}
		middleware.WriteSuccess(w, 200, p)
		return
	}
	if r.Method != http.MethodPatch {
		middleware.WriteError(w, 405, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	var p domain.CommunicationPreference
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 32*1024)).Decode(&p) != nil {
		middleware.WriteError(w, 400, "ERR_BAD_REQUEST", "invalid preference", middleware.GetCorrelationID(r.Context()))
		return
	}
	p.UserID = id
	if p.Category == "" {
		p.Category = domain.CommunicationCategory(category)
	}
	if p.Channel == "" {
		p.Channel = domain.CommunicationChannel(channel)
	}
	if p.ConsentSource == "" {
		p.ConsentSource = "market-compliance"
	}
	if err := h.repo.SetPreference(r.Context(), p, id); err != nil {
		middleware.WriteError(w, 400, "ERR_BAD_REQUEST", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}
	middleware.WriteSuccess(w, 200, p)
}
