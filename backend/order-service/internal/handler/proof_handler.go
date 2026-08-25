package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

// Auto-generated split of OrderHandler methods (god-file refactor).
func (h *OrderHandler) ScanPackage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	scannedBy := middleware.GetUserIDFromContext(r.Context())
	if scannedBy == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	// Fix VULN-001: Scan Auth Bypass — hanya petugas (admin/courier/warehouse)
	// yang boleh mencatat scan; customer tidak boleh inject scan history
	// atau memaksa state transition order milik orang lain.
	role := middleware.GetRoleFromContext(r.Context())
	if role != "admin" && role != "super_admin" && role != "courier" && role != "warehouse" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya petugas yang dapat melakukan scan paket", correlationID)
		return
	}

	var req ScanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request payload", correlationID)
		return
	}

	if req.OrderID == "" || req.ScanType == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "order_id and scan_type are required", correlationID)
		return
	}

	scan := &domain.PackageScan{
		OrderID:     req.OrderID,
		ScanType:    req.ScanType,
		Latitude:    req.Latitude,
		Longitude:   req.Longitude,
		WarehouseID: req.WarehouseID,
		PhotoURL:    req.PhotoURL,
		BagNumber:   req.BagNumber,
	}

	err := h.orderSvc.ScanPackage(r.Context(), scannedBy, scan)
	if err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "success",
		"scan_id":     scan.ID,
		"scan_type":   scan.ScanType,
		"order_id":    scan.OrderID,
		"recorded_at": scan.RecordedAt,
	})
}

func (h *OrderHandler) GetPackageScans(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	orderID := r.URL.Query().Get("order_id")
	if orderID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "order_id is required", correlationID)
		return
	}

	// Fix VULN-001: Scans Auth Bypass
	userID := middleware.GetUserIDFromContext(r.Context())
	role := middleware.GetRoleFromContext(r.Context())

	if role == "customer" {
		order, err := h.orderSvc.GetOrder(r.Context(), orderID)
		if err != nil {
			correlationID := middleware.GetCorrelationID(r.Context())
			middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Order tidak ditemukan", correlationID)
			return
		}
		if order.CustomerID != userID {
			correlationID := middleware.GetCorrelationID(r.Context())
			middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Akses ditolak", correlationID)
			return
		}
	} else if role == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	scans, err := h.orderSvc.GetPackageScans(r.Context(), orderID)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(scans)
}

func (h *OrderHandler) CreateConsolidationBag(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	createdBy := middleware.GetUserIDFromContext(r.Context())
	role := middleware.GetRoleFromContext(r.Context())

	if createdBy == "" || role == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	// Fix VULN-001: Bag Auth Bypass
	if role != "admin" && role != "super_admin" && role != "courier" && role != "warehouse" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya petugas yang dapat membuat kantong", correlationID)
		return
	}

	var req CreateBagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request payload", correlationID)
		return
	}

	bag := &domain.ConsolidationBag{
		BagNumber:              req.BagNumber,
		VehiclePlate:           req.VehiclePlate,
		FlightNumber:           req.FlightNumber,
		OriginWarehouseID:      req.OriginWarehouseID,
		DestinationWarehouseID: req.DestinationWarehouseID,
	}

	err := h.orderSvc.CreateConsolidationBag(r.Context(), createdBy, bag)
	if err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(bag)
}

func (h *OrderHandler) OpenConsolidationBag(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	unbaggedBy := middleware.GetUserIDFromContext(r.Context())
	role := middleware.GetRoleFromContext(r.Context())
	if unbaggedBy == "" || role == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	// Fix VULN-001: Bag Auth Bypass
	if role != "admin" && role != "super_admin" && role != "courier" && role != "warehouse" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya petugas yang dapat membuka kantong", correlationID)
		return
	}

	var req OpenBagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request payload", correlationID)
		return
	}

	err := h.orderSvc.OpenConsolidationBag(r.Context(), unbaggedBy, req.BagNumber)
	if err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success", "bag_number": req.BagNumber, "message": "Bag opened successfully (Bag Out)"})
}

func (h *OrderHandler) GetConsolidationBag(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	bagNumber := r.URL.Query().Get("bag_number")
	if bagNumber == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "bag_number is required", correlationID)
		return
	}

	// Fix VULN-001: Bag Auth Bypass
	role := middleware.GetRoleFromContext(r.Context())
	if role != "admin" && role != "super_admin" && role != "courier" && role != "warehouse" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya petugas yang dapat mengakses data kantong", correlationID)
		return
	}

	bag, scans, err := h.orderSvc.GetConsolidationBag(r.Context(), bagNumber)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"bag":   bag,
		"scans": scans,
	})
}

func (h *OrderHandler) AutoDetectScanType(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Fix VULN-001: AutoDetect — hanya petugas yang boleh auto-detect scan type
	scannedBy := middleware.GetUserIDFromContext(r.Context())
	role := middleware.GetRoleFromContext(r.Context())
	if scannedBy == "" || role == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}
	if role != "admin" && role != "super_admin" && role != "courier" && role != "warehouse" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya petugas yang dapat melakukan auto-detect scan", correlationID)
		return
	}

	var req AutoDetectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request payload", correlationID)
		return
	}

	scanType, err := h.orderSvc.AutoDetectScanType(r.Context(), req.OrderID, req.WarehouseID)
	if err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"order_id":  req.OrderID,
		"scan_type": scanType,
		"status":    "success",
	})
}

func (h *OrderHandler) SubmitCourierRating(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	correlationID := middleware.GetCorrelationID(r.Context())

	// Ambil customerID dari JWT context (sudah divalidasi middleware)
	customerID := middleware.GetUserIDFromContext(r.Context())
	if customerID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Sesi tidak valid", correlationID)
		return
	}

	// Ambil orderID dari URL path: /api/v1/customer/orders/{id}/rating
	// Asumsi format: /api/v1/customer/orders/O-XYZ/rating
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 7 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Order ID tidak ditemukan di URL", correlationID)
		return
	}
	orderID := pathParts[5]
	if orderID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Order ID tidak valid", correlationID)
		return
	}

	var req domain.SubmitRatingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Format request tidak valid", correlationID)
		return
	}

	if err := h.orderSvc.SubmitRating(r.Context(), customerID, orderID, req); err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":   "success",
		"message":  "Terima kasih atas penilaian Anda!",
		"order_id": orderID,
	})
}

func (h *OrderHandler) SubmitMerchantRating(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	correlationID := middleware.GetCorrelationID(r.Context())

	customerID := middleware.GetUserIDFromContext(r.Context())
	if customerID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Sesi tidak valid", correlationID)
		return
	}

	// Path: /api/v1/customer/orders/{id}/merchant-rating
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 7 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Order ID tidak ditemukan di URL", correlationID)
		return
	}
	orderID := pathParts[5]
	if orderID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Order ID tidak valid", correlationID)
		return
	}

	var req domain.SubmitRatingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Format request tidak valid", correlationID)
		return
	}

	if err := h.orderSvc.SubmitMerchantRating(r.Context(), customerID, orderID, req); err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":   "success",
		"message":  "Terima kasih atas penilaian Anda!",
		"order_id": orderID,
	})
}

func (h *OrderHandler) GetRatingReminders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	correlationID := middleware.GetCorrelationID(r.Context())

	customerID := middleware.GetUserIDFromContext(r.Context())
	if customerID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Sesi tidak valid", correlationID)
		return
	}

	orders, err := h.orderSvc.GetOrdersNeedingRatingReminder(r.Context(), customerID)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}

	// Format response: tampilkan data kurir yang relevan untuk UI dialog rating
	type RatingReminderItem struct {
		OrderID         string `json:"order_id"`
		OrderNumber     string `json:"order_number"`
		CourierName     string `json:"courier_name"`
		CourierPhotoURL string `json:"courier_photo_url"`
		CourierPlate    string `json:"courier_plate"`
		ReminderCount   int    `json:"reminder_count"`
	}

	items := make([]RatingReminderItem, 0, len(orders))
	for _, o := range orders {
		item := RatingReminderItem{
			OrderID:       o.ID,
			OrderNumber:   o.OrderNumber,
			ReminderCount: o.RatingReminderCount,
		}
		if o.Courier != nil {
			item.CourierName = o.Courier.FullName
			item.CourierPhotoURL = o.Courier.ProfilePhotoURL
			item.CourierPlate = o.Courier.VehiclePlate
		}
		items = append(items, item)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    items,
	})
}

func (h *OrderHandler) GetCourierPerformance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	courierID := r.Context().Value("user_id").(string)

	stats, err := h.orderSvc.GetCourierPerformanceStats(r.Context(), courierID)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    stats,
	})
}
