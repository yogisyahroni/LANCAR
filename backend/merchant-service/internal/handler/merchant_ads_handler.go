package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"tembus/merchant-service/internal/domain"
)

type MerchantAdsHandler struct {
	svc domain.MerchantAdsService
}

func NewMerchantAdsHandler(svc domain.MerchantAdsService) *MerchantAdsHandler {
	return &MerchantAdsHandler{svc: svc}
}

func (h *MerchantAdsHandler) parseUserID(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID := strings.TrimSpace(r.Header.Get("X-User-ID"))
	if userID == "" {
		respondAdsError(w, http.StatusUnauthorized, "Unauthorized")
		return "", false
	}
	if _, err := uuid.Parse(userID); err != nil {
		respondAdsError(w, http.StatusBadRequest, "Invalid User ID")
		return "", false
	}
	access := domain.MerchantAccessContext{
		SessionToken:       strings.TrimSpace(r.Header.Get("X-Merchant-Session-Token")),
		BranchID:           strings.TrimSpace(r.Header.Get("X-Merchant-Branch-ID")),
		DeviceID:           strings.TrimSpace(r.Header.Get("X-Device-ID")),
		RequiredPermission: domain.PermManagePromo,
	}
	*r = *r.WithContext(domain.WithMerchantAccess(r.Context(), access))
	return userID, true
}

func respondAdsError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func (h *MerchantAdsHandler) respond(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func (h *MerchantAdsHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	var req domain.CreateMerchantAdRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondAdsError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	req.IdempotencyKey = strings.TrimSpace(r.Header.Get("X-Idempotency-Key"))
	ad, err := h.svc.Create(r.Context(), userID, req)
	if err != nil {
		respondAdsError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respond(w, http.StatusCreated, ad)
}

func (h *MerchantAdsHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	items, total, err := h.svc.List(r.Context(), userID, page, pageSize)
	if err != nil {
		respondAdsError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respond(w, http.StatusOK, map[string]any{"items": items, "total": total, "page": page, "page_size": pageSize})
}

func (h *MerchantAdsHandler) SetActive(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	var req struct {
		Active bool `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondAdsError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	if err := h.svc.SetActive(r.Context(), userID, r.PathValue("id"), req.Active); err != nil {
		respondAdsError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respond(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *MerchantAdsHandler) Performance(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	performance, err := h.svc.Performance(r.Context(), userID, r.URL.Query().Get("period"))
	if err != nil {
		respondAdsError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respond(w, http.StatusOK, performance)
}
