package handler

import (
	"encoding/csv"
	"net/http"
	"strconv"
	"strings"

	"tembus/merchant-service/internal/domain"
)

type MerchantAuditHandler struct {
	*MerchantHandler
	repo      domain.MerchantAuditRepository
	accessSvc domain.MerchantAccessService
}

func NewMerchantAuditHandler(mh *MerchantHandler, repo domain.MerchantAuditRepository, accessSvc domain.MerchantAccessService) *MerchantAuditHandler {
	return &MerchantAuditHandler{MerchantHandler: mh, repo: repo, accessSvc: accessSvc}
}

func (h *MerchantAuditHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	portal, err := h.accessSvc.GetPortalContext(r.Context(), userID, r.Header.Get("X-Merchant-Branch-ID"))
	if err != nil {
		h.respondError(w, http.StatusForbidden, err.Error())
		return
	}
	if portal.EffectiveRole != "owner" && portal.EffectiveRole != "manager" {
		h.respondError(w, http.StatusForbidden, "riwayat aktivitas hanya untuk owner atau manager")
		return
	}
	limit := queryInt(r, "limit", 50)
	offset := queryInt(r, "offset", 0)
	if limit < 1 || limit > 100 || offset < 0 {
		h.respondError(w, http.StatusBadRequest, "limit/offset tidak valid")
		return
	}
	entries, total, err := h.repo.List(r.Context(), portal.Merchant.ID, portal.CurrentBranchID, limit, offset)
	if err != nil {
		h.respondError(w, http.StatusInternalServerError, "riwayat aktivitas belum dapat dimuat")
		return
	}
	if strings.EqualFold(r.URL.Query().Get("format"), "csv") {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="riwayat-aktivitas-merchant.csv"`)
		writer := csv.NewWriter(w)
		_ = writer.Write([]string{"Waktu", "Aktor", "Peran", "Aksi", "Outlet", "Hasil", "Status", "Alasan"})
		for _, entry := range entries {
			_ = writer.Write([]string{entry.CreatedAt.Format("2006-01-02 15:04:05Z07:00"), entry.ActorID, entry.ActorRole, entry.Action, entry.OutletID, entry.Result, strconv.Itoa(entry.Status), entry.FailureReason})
		}
		writer.Flush()
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]any{"success": true, "data": entries, "total": total, "limit": limit, "offset": offset, "branch_id": portal.CurrentBranchID})
}

func queryInt(r *http.Request, key string, fallback int) int {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return -1
	}
	return parsed
}
