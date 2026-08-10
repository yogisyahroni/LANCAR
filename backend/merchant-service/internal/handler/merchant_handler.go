package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"tembus/merchant-service/internal/domain"
	"tembus/merchant-service/internal/service"

	"github.com/google/uuid"
)

// MerchantHandler — HTTP handler untuk endpoint merchant (FOOD-BIKE-018/045).
// Identity user diambil dari header X-User-ID (di-set API Gateway setelah
// verifikasi JWT) — pola sama persis dengan payment-service.
type MerchantHandler struct {
	svc      domain.MerchantService
	uploadSvc *service.MenuPhotoStorage
}

func NewMerchantHandler(svc domain.MerchantService, uploadSvc *service.MenuPhotoStorage) *MerchantHandler {
	return &MerchantHandler{svc: svc, uploadSvc: uploadSvc}
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

// Pause godoc
// @Summary Pause sementara (FB-107): merchant tidak terima order baru
// sampai waktu tertentu. Tidak mengubah is_open / jam operasional.
// @Tags merchant
// @Accept json
// @Produce json
// @Param body body object true "{\"duration_minutes\": 15}"
// @Success 200 {object} domain.Merchant
// @Router /merchant/pause [post]
func (h *MerchantHandler) Pause(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	var body struct {
		DurationMinutes int `json:"duration_minutes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	if body.DurationMinutes <= 0 || body.DurationMinutes > 180 {
		h.respondError(w, http.StatusBadRequest, "duration_minutes harus 1-180")
		return
	}
	until := time.Now().Add(time.Duration(body.DurationMinutes) * time.Minute)
	m, err := h.svc.Pause(r.Context(), userID, until)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, m)
}

// Resume godoc
// @Summary Resume (FB-107): batalkan pause sementara lebih awal.
// @Tags merchant
// @Produce json
// @Success 200 {object} domain.Merchant
// @Router /merchant/resume [post]
func (h *MerchantHandler) Resume(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	m, err := h.svc.Resume(r.Context(), userID)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, m)
}

// UpdateFoodDocs godoc
// @Summary Update dokumen pangan (FB-092): sertifikat halal BPJPH, SPP-IRT,
// izin edar BPOM + masa berlaku. Patch: hanya field yang diisi yang diperbarui.
// @Tags merchant
// @Accept json
// @Produce json
// @Param request body domain.UpdateFoodDocsRequest true "Dokumen pangan"
// @Success 200 {object} domain.Merchant
// @Router /merchant/food-docs [put]
func (h *MerchantHandler) UpdateFoodDocs(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	var req domain.UpdateFoodDocsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	m, err := h.svc.UpdateFoodDocs(r.Context(), userID, req)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, m)
}

// ─────────────────────────────────────────────
// UploadMenuItemPhoto — FB-110: upload foto menu dari galeri (bukan cuma URL).
// @Summary Upload menu item photo
// @Description Multipart field "file" (JPG/PNG/WebP, maks 2MB) → return URL publik.
// @Tags merchant menu
// @Accept multipart/form-data
// @Produce json
// @Param file formData file true "Foto menu"
// @Success 201 {object} map[string]string
// @Router /api/v1/merchant/menu/upload [post]
func (h *MerchantHandler) UploadMenuItemPhoto(w http.ResponseWriter, r *http.Request) {
	if h.uploadSvc == nil {
		h.respondError(w, http.StatusServiceUnavailable, "Upload tidak tersedia")
		return
	}
	if _, ok := h.parseUserID(w, r); !ok {
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 2*1024*1024+4096)
	if err := r.ParseMultipartForm(2 * 1024 * 1024); err != nil {
		h.respondError(w, http.StatusRequestEntityTooLarge, "File terlalu besar (maks 2MB)")
		return
	}
	defer r.MultipartForm.RemoveAll()

	file, header, err := r.FormFile("file")
	if err != nil {
		h.respondError(w, http.StatusBadRequest, "Field 'file' wajib diisi")
		return
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		h.respondError(w, http.StatusInternalServerError, "Gagal membaca file")
		return
	}

	url, err := h.uploadSvc.Save(r.Context(), header.Filename, content)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, service.ErrMenuPhotoTooLarge) {
			status = http.StatusRequestEntityTooLarge
		}
		h.respondError(w, status, err.Error())
		return
	}

	h.respondJSON(w, http.StatusCreated, map[string]string{"url": url})
}

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

// GetMenuItemVariants godoc
// @Summary Ambil varian menu item
// @Description FB-108: grup varian + opsi (Ukuran, Level Pedas, Tambahan...).
// @Tags merchant
// @Param id path string true "Menu item ID"
// @Success 200 {array} domain.MenuItemVariant
// @Router /merchant/menu/{id}/variants [get]
func (h *MerchantHandler) GetMenuItemVariants(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	itemID := r.PathValue("id")
	variants, err := h.svc.GetMenuItemVariants(r.Context(), userID, itemID)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, variants)
}

// ReplaceMenuItemVariants godoc
// @Summary Replace semua varian menu item
// @Description FB-108: replace atomik (hapus lama + insert baru). Array
// kosong = hapus semua varian (kembali single-variant).
// @Tags merchant
// @Param id path string true "Menu item ID"
// @Param request body domain.ReplaceMenuItemVariantsRequest true "Varian"
// @Success 200 {array} domain.MenuItemVariant
// @Router /merchant/menu/{id}/variants [put]
func (h *MerchantHandler) ReplaceMenuItemVariants(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	itemID := r.PathValue("id")
	var req domain.ReplaceMenuItemVariantsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	variants, err := h.svc.ReplaceMenuItemVariants(r.Context(), userID, itemID, req)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, variants)
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

// UpdateBankAccount godoc
// @Summary Update rekening bank merchant
// @Description Update rekening bank untuk payout settlement (FB-114).
// @Tags merchant
// @Accept json
// @Param request body domain.UpdateBankAccountRequest true "rekening baru"
// @Success 200 {object} domain.Merchant
// @Router /merchant/bank-account [put]
func (h *MerchantHandler) UpdateBankAccount(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	var body domain.UpdateBankAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	merchant, err := h.svc.UpdateBankAccount(r.Context(), userID, body)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, merchant)
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
	if err := h.svc.RejectOrder(r.Context(), userID, orderID, body.Reason, body.RejectReason); err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// GetStruk godoc
// @Summary Struk pembelian order food
// @Description Ambil data struk pembelian + QR code (berisi handover token) untuk dicetak merchant. Hanya order milik merchant yang approved.
// @Tags merchant
// @Produce json
// @Param id path string true "Order ID"
// @Success 200 {object} domain.StrukData
// @Failure 400 {object} map[string]string
// @Router /merchant/orders/{id}/struk [get]
func (h *MerchantHandler) GetStruk(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	orderID := r.PathValue("id")
	if orderID == "" {
		h.respondError(w, http.StatusBadRequest, "order id wajib diisi")
		return
	}
	struk, err := h.svc.GetStruk(r.Context(), userID, orderID)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, struk)
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

// ─────────────────────────────────────────────
// Report Penjualan (FB-086)
// ─────────────────────────────────────────────

// GetSalesReport godoc
// @Summary Rekap penjualan merchant
// @Description Rekap order + GMV + item terlaris periode daily (hari ini) / weekly (7 hari terakhir).
// @Tags merchant
// @Produce json
// @Param period query string false "daily | weekly (default daily)"
// @Success 200 {object} domain.SalesReportSummary
// @Router /merchant/reports [get]
func (h *MerchantHandler) GetSalesReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	summary, err := h.svc.GetSalesReport(r.Context(), userID, r.URL.Query().Get("period"))
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, summary)
}

// ExportSalesReport godoc
// @Summary Export CSV transaksi penjualan
// @Description Download CSV baris transaksi periode (order delivered).
// @Tags merchant
// @Produce text/csv
// @Param period query string false "daily | weekly (default daily)"
// @Success 200 {string} string "CSV"
// @Router /merchant/reports/export [get]
func (h *MerchantHandler) ExportSalesReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	period := r.URL.Query().Get("period")
	csvData, err := h.svc.ExportSalesReportCSV(r.Context(), userID, period)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=merchant-sales-"+period+".csv")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(csvData))
}

// GetSettlements godoc
// @Summary Riwayat pencairan/payout merchant
// @Description Daftar settlement (status, nominal, referensi) + total cair & ditahan.
// @Tags merchant
// @Produce json
// @Success 200 {object} domain.SettlementSummary
// @Router /merchant/settlements [get]
func (h *MerchantHandler) GetSettlements(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	summary, err := h.svc.ListSettlements(r.Context(), userID)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, summary)
}

// GetOrderEdit godoc
// @Summary Ambil data order untuk edit item (FB-087)
// @Description Return items + harga lama order food status pending_merchant milik merchant.
// @Tags merchant
// @Produce json
// @Param id path string true "Order ID"
// @Success 200 {object} domain.OrderEditData
// @Router /merchant/orders/{id}/items [get]
func (h *MerchantHandler) GetOrderEdit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	orderID := r.PathValue("id")
	if orderID == "" {
		h.respondError(w, http.StatusBadRequest, "order id wajib diisi")
		return
	}
	data, err := h.svc.GetOrderEdit(r.Context(), userID, orderID)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, data)
}

// EditOrderItems godoc
// @Summary Edit item order food sebelum konfirmasi
// @Description Merchant ganti/tambah/hapus item saat status pending_merchant. Nilai baru tidak boleh melebihi nilai order awal. Customer di-notif via push.
// @Tags merchant
// @Accept json
// @Produce json
// @Param id path string true "Order ID"
// @Param request body domain.EditOrderItemsRequest true "Items baru"
// @Success 200 {object} domain.EditOrderResult
// @Router /merchant/orders/{id}/items [put]
func (h *MerchantHandler) EditOrderItems(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	orderID := r.PathValue("id")
	if orderID == "" {
		h.respondError(w, http.StatusBadRequest, "order id wajib diisi")
		return
	}
	var req domain.EditOrderItemsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	result, err := h.svc.EditOrderItems(r.Context(), userID, orderID, req)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, result)
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
