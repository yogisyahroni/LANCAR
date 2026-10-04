package handler

import (
	"net/http"
	"strconv"
	"strings"

	"tembus/merchant-service/internal/domain"
)

type MerchantSearchHandler struct {
	*MerchantHandler
	searchSvc domain.MerchantSearchService
}

func NewMerchantSearchHandler(mh *MerchantHandler, searchSvc domain.MerchantSearchService) *MerchantSearchHandler {
	return &MerchantSearchHandler{MerchantHandler: mh, searchSvc: searchSvc}
}

func (h *MerchantSearchHandler) Search(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if _, err := domain.NormalizeMerchantSearchQuery(query); err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 20 {
		limit = 10
	}
	results, err := h.searchSvc.Search(r.Context(), userID, r.Header.Get("X-Merchant-Branch-ID"), query, limit)
	if err != nil {
		h.respondError(w, http.StatusForbidden, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]any{"success": true, "data": results})
}
