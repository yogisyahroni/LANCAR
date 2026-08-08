package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"tembus/merchant-service/internal/domain"
	"tembus/merchant-service/internal/service"
)

// PromoHandler — endpoint CRUD promo merchant (FB-099), self-serve tanpa admin.
type PromoHandler struct {
	svc *service.MerchantPromoService
}

// NewPromoHandler buat handler promo.
func NewPromoHandler(svc *service.MerchantPromoService) *PromoHandler {
	return &PromoHandler{svc: svc}
}

// parseUserID fail-closed: header wajib ada & UUID valid (pola MerchantHandler).
func (h *PromoHandler) parseUserID(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		h.respondError(w, http.StatusUnauthorized, "Unauthorized")
		return "", false
	}
	if _, err := uuid.Parse(userID); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid User ID")
		return "", false
	}
	return userID, true
}

// respondError mengirim JSON error {error: message}.
func (h *PromoHandler) respondError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (h *PromoHandler) respondJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (h *PromoHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	var req domain.CreateMerchantPromoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	p, err := h.svc.Create(r.Context(), userID, req)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusCreated, p)
}

func (h *PromoHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	items, total, err := h.svc.List(r.Context(), userID, page, pageSize)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"items": items, "total": total, "page": page, "page_size": pageSize,
	})
}

func (h *PromoHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	promoID := r.PathValue("id")
	var req domain.UpdateMerchantPromoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	p, err := h.svc.Update(r.Context(), userID, promoID, req)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, p)
}

func (h *PromoHandler) SetActive(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	promoID := r.PathValue("id")
	var req struct {
		Active bool `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	if err := h.svc.SetActive(r.Context(), userID, promoID, req.Active); err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *PromoHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	promoID := r.PathValue("id")
	if err := h.svc.Delete(r.Context(), userID, promoID); err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}
