package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"tembus/merchant-service/internal/domain"

	"github.com/google/uuid"
)

// MerchantHandler — HTTP handler untuk endpoint merchant (FOOD-BIKE-018/045).
// Identity user diambil dari header X-User-ID (di-set API Gateway setelah
// verifikasi JWT) — pola sama persis dengan payment-service.
type MerchantHandler struct {
	svc domain.MerchantService
}

func NewMerchantHandler(svc domain.MerchantService) *MerchantHandler {
	return &MerchantHandler{svc: svc}
}

// parseUserID fail-closed: header wajib ada & UUID valid.
func (h *MerchantHandler) parseUserID(w http.ResponseWriter, r *http.Request) (string, bool) {
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
func (h *MerchantHandler) respondError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (h *MerchantHandler) respondJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// RegisterMerchant godoc
// @Summary Daftarkan merchant baru
// @Description Mendaftarkan merchant (status pending) + dokumen verifikasi. Wajib approved sebelum terima order.
// @Tags merchant
// @Accept json
// @Produce json
// @Param request body domain.RegisterMerchantRequest true "Pendaftaran Merchant"
// @Success 201 {object} domain.Merchant
// @Router /merchant/register [post]
func (h *MerchantHandler) RegisterMerchant(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	var req domain.RegisterMerchantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	m, err := h.svc.Register(r.Context(), userID, req)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusCreated, m)
}

// GetProfile godoc
// @Summary Profil merchant (milik user)
// @Tags merchant
// @Produce json
// @Success 200 {object} domain.Merchant
// @Router /merchant/profile [get]
func (h *MerchantHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	m, err := h.svc.GetProfile(r.Context(), userID)
	if err != nil {
		h.respondError(w, http.StatusInternalServerError, "Terjadi kesalahan")
		return
	}
	if m == nil {
		h.respondError(w, http.StatusNotFound, "Merchant belum terdaftar")
		return
	}
	h.respondJSON(w, http.StatusOK, m)
}

// UpdateProfile godoc
// @Summary Update profil merchant
// @Tags merchant
// @Accept json
// @Produce json
// @Param request body domain.UpdateMerchantRequest true "Update Profil"
// @Success 200 {object} domain.Merchant
// @Router /merchant/profile [patch]
func (h *MerchantHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	var req domain.UpdateMerchantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	m, err := h.svc.UpdateProfile(r.Context(), userID, req)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, m)
}

// ToggleOpen godoc
// @Summary Buka/tutup toko
// @Tags merchant
// @Accept json
// @Produce json
// @Param request body object true "{\"is_open\": true}"
// @Success 200 {object} domain.Merchant
// @Router /merchant/toggle-open [post]
func (h *MerchantHandler) ToggleOpen(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	var body struct {
		IsOpen bool `json:"is_open"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	m, err := h.svc.ToggleOpen(r.Context(), userID, body.IsOpen)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, m)
}

// ─────────────────────────────────────────────
// Menu CRUD (FOOD-BIKE-018)
// ─────────────────────────────────────────────

// CreateMenuItem godoc
// @Summary Tambah menu item
// @Tags merchant
// @Accept json
// @Produce json
// @Param request body domain.CreateMenuItemRequest true "Menu Item"
// @Success 201 {object} domain.MenuItem
// @Router /merchant/menu [post]
func (h *MerchantHandler) CreateMenuItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	var req domain.CreateMenuItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	item, err := h.svc.CreateMenuItem(r.Context(), userID, req)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusCreated, item)
}

// ListMenuItems godoc
// @Summary List menu item merchant
// @Tags merchant
// @Produce json
// @Param page query int false "page"
// @Param page_size query int false "page_size"
// @Success 200 {object} object
// @Router /merchant/menu [get]
func (h *MerchantHandler) ListMenuItems(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	page, pageSize := parsePagination(r)
	items, total, err := h.svc.ListMenuItems(r.Context(), userID, page, pageSize)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"items": items, "total": total, "page": page, "page_size": pageSize,
	})
}

// UpdateMenuItem godoc
// @Summary Update menu item
// @Tags merchant
// @Accept json
// @Produce json
// @Param id path string true "Menu item ID"
// @Param request body domain.UpdateMenuItemRequest true "Update"
// @Success 200 {object} domain.MenuItem
// @Router /merchant/menu/{id} [patch]
func (h *MerchantHandler) UpdateMenuItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	itemID := r.PathValue("id")
	if itemID == "" {
		h.respondError(w, http.StatusBadRequest, "id wajib diisi")
		return
	}
	var req domain.UpdateMenuItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	item, err := h.svc.UpdateMenuItem(r.Context(), userID, itemID, req)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, item)
}

// DeleteMenuItem godoc
// @Summary Hapus menu item
// @Tags merchant
// @Param id path string true "Menu item ID"
// @Success 200 {object} object
// @Router /merchant/menu/{id} [delete]
func (h *MerchantHandler) DeleteMenuItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	itemID := r.PathValue("id")
	if err := h.svc.DeleteMenuItem(r.Context(), userID, itemID); err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// SetMenuItemAvailability godoc
// @Summary Toggle ketersediaan menu
// @Tags merchant
// @Accept json
// @Produce json
// @Param id path string true "Menu item ID"
// @Param request body object true "{\"is_available\": false}"
// @Success 200 {object} domain.MenuItem
// @Router /merchant/menu/{id}/availability [patch]
func (h *MerchantHandler) SetMenuItemAvailability(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	itemID := r.PathValue("id")
	var body struct {
		IsAvailable bool `json:"is_available"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	item, err := h.svc.SetMenuItemAvailability(r.Context(), userID, itemID, body.IsAvailable)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, item)
}

// ─────────────────────────────────────────────
// Order Action (FOOD-BIKE-017/021)
// ─────────────────────────────────────────────

// AcceptOrder godoc
// @Summary Terima order food
// @Tags merchant
// @Param id path string true "Order ID"
// @Success 200 {object} object
// @Router /merchant/orders/{id}/accept [post]
func (h *MerchantHandler) AcceptOrder(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	orderID := r.PathValue("id")
	if err := h.svc.AcceptOrder(r.Context(), userID, orderID); err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// RejectOrder godoc
// @Summary Tolak order food (wajib reason)
// @Tags merchant
// @Accept json
// @Param id path string true "Order ID"
// @Param request body domain.MerchantOrderActionRequest true "reason wajib"
// @Success 200 {object} object
// @Router /merchant/orders/{id}/reject [post]
func (h *MerchantHandler) RejectOrder(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	orderID := r.PathValue("id")
	var body domain.MerchantOrderActionRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	if err := h.svc.RejectOrder(r.Context(), userID, orderID, body.Reason); err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ListOrders godoc
// @Summary List order food merchant
// @Tags merchant
// @Produce json
// @Param status query string false "filter status"
// @Param page query int false "page"
// @Param page_size query int false "page_size"
// @Success 200 {object} object
// @Router /merchant/orders [get]
func (h *MerchantHandler) ListOrders(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	status := r.URL.Query().Get("status")
	page, pageSize := parsePagination(r)
	orders, total, err := h.svc.ListOrders(r.Context(), userID, status, page, pageSize)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"orders": orders, "total": total, "page": page, "page_size": pageSize,
	})
}

func parsePagination(r *http.Request) (int, int) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 50
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize
}
