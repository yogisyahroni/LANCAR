package handler

import (
	"encoding/json"
	"net/http"
	"tembus/payment-service/internal/domain"
	"tembus/payment-service/internal/middleware"

	"github.com/google/uuid"
)

type WalletHandler struct {
	svc domain.WalletService
}

func NewWalletHandler(svc domain.WalletService) *WalletHandler {
	return &WalletHandler{svc: svc}
}

// parseUserID validates and parses the X-User-ID header set by the API Gateway
// after JWT verification. It returns (uuid, correlationID, ok).
//
// Fix S2-PS-01: Eliminates the silent uuid.Parse() discard that produced uuid.Nil
// when the header was missing or malformed, allowing financial mutations on a
// ghost wallet with a zero UUID. Now every handler fails-closed on bad identity.
func (h *WalletHandler) parseUserID(w http.ResponseWriter, r *http.Request) (uuid.UUID, string, bool) {
	correlationID := middleware.GetCorrelationID(r.Context())
	userIDStr := r.Header.Get("X-User-ID") // Set by API Gateway after JWT validation

	if userIDStr == "" {
		middleware.LogJSON("warn", "wallet_missing_user_id", map[string]interface{}{
			"correlation_id": correlationID,
			"path":           r.URL.Path,
			"method":         r.Method,
		})
		h.respondError(w, "Unauthorized", http.StatusUnauthorized)
		return uuid.Nil, correlationID, false
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil || userID == uuid.Nil {
		middleware.LogJSON("warn", "wallet_invalid_user_id", map[string]interface{}{
			"correlation_id": correlationID,
			"path":           r.URL.Path,
		})
		h.respondError(w, "Invalid User ID", http.StatusBadRequest)
		return uuid.Nil, correlationID, false
	}

	return userID, correlationID, true
}

// safeError logs the real error internally and returns a safe generic message
// to the caller — preventing database errors and internal stack traces from
// leaking to clients.
//
// Fix S2-PS-02: Replaces all err.Error() responses throughout wallet_handler.
func (h *WalletHandler) safeError(w http.ResponseWriter, r *http.Request, err error, correlationID string, operation string) {
	middleware.LogJSON("error", "wallet_operation_failed", map[string]interface{}{
		"correlation_id": correlationID,
		"operation":      operation,
		"path":           r.URL.Path,
		"error":          err.Error(), // logged only — not sent to client
	})
	h.respondError(w, "Terjadi kesalahan. Silakan coba lagi.", http.StatusInternalServerError)
}

func (h *WalletHandler) GetBalance(w http.ResponseWriter, r *http.Request) {
	userID, correlationID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}

	wallet, err := h.svc.GetBalance(r.Context(), userID)
	if err != nil {
		h.safeError(w, r, err, correlationID, "get_balance")
		return
	}

	h.respondJSON(w, wallet, http.StatusOK)
}

func (h *WalletHandler) TopUp(w http.ResponseWriter, r *http.Request) {
	userID, correlationID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}

	var req struct {
		Amount int64 `json:"amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate amount is positive — zero or negative amounts must never reach
	// the service layer as they could corrupt wallet ledgers
	if req.Amount <= 0 {
		h.respondError(w, "Jumlah top-up harus lebih dari nol", http.StatusBadRequest)
		return
	}

	snapToken, err := h.svc.CreateTopUp(r.Context(), userID, req.Amount)
	if err != nil {
		h.safeError(w, r, err, correlationID, "create_top_up")
		return
	}

	h.respondJSON(w, map[string]string{"snap_token": snapToken}, http.StatusOK)
}

func (h *WalletHandler) Deposit(w http.ResponseWriter, r *http.Request) {
	userID, correlationID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}

	var req struct {
		Amount      int64  `json:"amount"`
		ReferenceID string `json:"reference_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Amount <= 0 {
		h.respondError(w, "Amount must be positive", http.StatusBadRequest)
		return
	}

	if req.ReferenceID == "" {
		h.respondError(w, "reference_id wajib diisi", http.StatusBadRequest)
		return
	}

	err := h.svc.Deposit(r.Context(), userID, req.Amount, req.ReferenceID)
	if err != nil {
		h.safeError(w, r, err, correlationID, "deposit")
		return
	}

	h.respondJSON(w, map[string]string{"message": "Deposit successful"}, http.StatusOK)
}

func (h *WalletHandler) Refund(w http.ResponseWriter, r *http.Request) {
	userID, correlationID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}

	var req struct {
		Amount      int64  `json:"amount"`
		OrderID     string `json:"order_id"`
		ReferenceID string `json:"reference_id"`
		Reason      string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.OrderID == "" && req.ReferenceID != "" {
		req.OrderID = req.ReferenceID
	}

	if req.Amount <= 0 {
		h.respondError(w, "Amount must be positive", http.StatusBadRequest)
		return
	}

	if req.OrderID == "" {
		h.respondError(w, "order_id atau reference_id wajib diisi", http.StatusBadRequest)
		return
	}

	err := h.svc.Refund(r.Context(), userID, req.Amount, req.OrderID)
	if err != nil {
		h.safeError(w, r, err, correlationID, "refund")
		return
	}

	h.respondJSON(w, map[string]string{"message": "Refund successful"}, http.StatusOK)
}

func (h *WalletHandler) SosPenalty(w http.ResponseWriter, r *http.Request) {
	var req struct {
		VictimID    uuid.UUID `json:"victim_id"`
		Amount      int64     `json:"amount"`
		ReferenceID string    `json:"reference_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Amount <= 0 {
		h.respondError(w, "Amount must be positive", http.StatusBadRequest)
		return
	}

	err := h.svc.DeductFakeSosPenalty(r.Context(), req.VictimID, req.Amount, req.ReferenceID)
	if err != nil {
		h.respondError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	h.respondJSON(w, map[string]string{"message": "Penalty deducted"}, http.StatusOK)
}

func (h *WalletHandler) SosReward(w http.ResponseWriter, r *http.Request) {
	var req struct {
		HelperID    uuid.UUID `json:"helper_id"`
		Amount      int64     `json:"amount"`
		ReferenceID string    `json:"reference_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Amount <= 0 {
		h.respondError(w, "Amount must be positive", http.StatusBadRequest)
		return
	}

	err := h.svc.CreditSosHelperReward(r.Context(), req.HelperID, req.Amount, req.ReferenceID)
	if err != nil {
		h.respondError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	h.respondJSON(w, map[string]string{"message": "Reward credited"}, http.StatusOK)
}

// HoldDeduct — internal endpoint: mem-freeze saldo driver ke hold_balance
// (jaminan anti-ghosting). Dipanggil order-service saat order food di-assign
// (FOOD-BIKE-024). Idempotent via reference_id.
func (h *WalletHandler) HoldDeduct(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DriverID    uuid.UUID `json:"driver_id"`
		Amount      int64     `json:"amount"`
		ReferenceID string    `json:"reference_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Amount <= 0 {
		h.respondError(w, "Amount must be positive", http.StatusBadRequest)
		return
	}

	err := h.svc.DeductFromHold(r.Context(), req.DriverID, req.Amount, req.ReferenceID)
	if err != nil {
		h.respondError(w, err.Error(), http.StatusBadRequest)
		return
	}

	h.respondJSON(w, map[string]string{"message": "Hold deducted"}, http.StatusOK)
}

// HoldAutoRefill — internal endpoint: geser saldo ke hold sampai memenuhi
// minimum (self-funding dari revenue). Dipanggil berkala oleh worker atau
// setelah deposit/earning driver (FOOD-BIKE-024).
func (h *WalletHandler) HoldAutoRefill(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DriverID uuid.UUID `json:"driver_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	err := h.svc.AutoRefillHold(r.Context(), req.DriverID)
	if err != nil {
		h.respondError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	h.respondJSON(w, map[string]string{"message": "Hold refilled"}, http.StatusOK)
}

// SetHoldMinimum — internal endpoint: tetapkan jaminan minimum driver.
func (h *WalletHandler) SetHoldMinimum(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DriverID uuid.UUID `json:"driver_id"`
		Minimum  int64     `json:"minimum"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	err := h.svc.SetHoldMinimum(r.Context(), req.DriverID, req.Minimum)
	if err != nil {
		h.respondError(w, err.Error(), http.StatusBadRequest)
		return
	}

	h.respondJSON(w, map[string]string{"message": "Hold minimum set"}, http.StatusOK)
}

func (h *WalletHandler) Withdraw(w http.ResponseWriter, r *http.Request) {
	// ─── ZERO TRUST: Identity Verification ───────────────────────────────────────
	userID, correlationID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}

	userRole := r.Header.Get("X-User-Role")
	if userRole == "" {
		h.respondError(w, "Unauthorized: role tidak ditemukan", http.StatusUnauthorized)
		return
	}
	// Hanya customer dan courier yang boleh melakukan penarikan
	if userRole != "customer" && userRole != "courier" {
		h.respondError(w, "Unauthorized: role tidak diizinkan melakukan penarikan", http.StatusForbidden)
		return
	}

	// ─── INPUT PARSING ────────────────────────────────────────────────────────────
	// Gunakan struct strict dengan int64 untuk amount — bukan float64!
	// float64 exploit: attacker bisa kirim "100.9999999999" yang bisa dibulatkan
	// berbeda di client vs server. int64 (rupiah penuh) tidak ada ambiguitas.
	var raw struct {
		Amount         int64  `json:"amount"`
		AccountNumber  string `json:"account_number"`
		AccountHolder  string `json:"account_holder"`
		BankCode       string `json:"bank_code"`
		IdempotencyKey string `json:"idempotency_key"`
	}

	// Limit body size: 4KB cukup untuk request ini (anti DoS via body size)
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		h.respondError(w, "Format permintaan tidak valid", http.StatusBadRequest)
		return
	}

	// ─── SECURITY LAYER 1: Amount Validation ────────────────────────────────────
	// 1a. Cegah negative amount exploit (balance = balance - (-1000) = balance + 1000)
	if raw.Amount <= 0 {
		h.respondError(w, "Jumlah tarik dana harus lebih dari nol", http.StatusBadRequest)
		return
	}
	// 1b. Cegah integer overflow: amount tidak boleh melebihi batas maksimum transaksi
	if raw.Amount < domain.WithdrawMinAmount {
		h.respondError(w, "Jumlah minimum penarikan adalah Rp 10.000", http.StatusBadRequest)
		return
	}
	if raw.Amount > domain.WithdrawMaxAmount {
		h.respondError(w, "Jumlah maksimum penarikan per transaksi adalah Rp 50.000.000", http.StatusBadRequest)
		return
	}

	// ─── SECURITY LAYER 2: Account Number Validation ─────────────────────────────
	// Standar Bank Indonesia (SKNBI/BI-FAST): nomor rekening hanya digit, 10-18 karakter
	// WAJIB: hanya angka, tidak boleh ada simbol, spasi, huruf, atau karakter apapun.
	// Ini mencegah: SQL injection via account number, XSS, command injection.
	if len(raw.AccountNumber) < domain.AccountNumberMinLen || len(raw.AccountNumber) > domain.AccountNumberMaxLen {
		h.respondError(w, "Nomor rekening harus terdiri dari 10 hingga 18 digit angka", http.StatusBadRequest)
		return
	}
	for _, c := range raw.AccountNumber {
		if c < '0' || c > '9' {
			// Tolak SEMUA karakter selain digit: huruf, simbol, spasi, unicode
			h.respondError(w, "Nomor rekening hanya boleh mengandung angka (0-9)", http.StatusBadRequest)
			return
		}
	}

	// ─── SECURITY LAYER 3: Account Holder Name Validation ───────────────────────
	// Nama pemilik rekening: hanya huruf (A-Z, a-z), spasi, titik, dan apostrof
	// Mencegah: XSS injection, HTML injection, script tag, SQL injection
	rawHolder := trimAndNormalizeSpace(raw.AccountHolder)
	if len(rawHolder) < 2 || len(rawHolder) > 100 {
		h.respondError(w, "Nama pemilik rekening tidak valid (2-100 karakter)", http.StatusBadRequest)
		return
	}
	for _, c := range rawHolder {
		if !isValidNameChar(c) {
			h.respondError(w, "Nama pemilik rekening hanya boleh mengandung huruf, spasi, titik, dan apostrof", http.StatusBadRequest)
			return
		}
	}

	// ─── SECURITY LAYER 4: Bank Code Validation ──────────────────────────────────
	// Bank code: hanya huruf besar A-Z, 2-20 karakter
	// Whitelist approach — tolak semua yang tidak dikenal
	rawBankCode := raw.BankCode
	if len(rawBankCode) < 2 || len(rawBankCode) > 20 {
		h.respondError(w, "Kode bank tidak valid", http.StatusBadRequest)
		return
	}
	for _, c := range rawBankCode {
		if !((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')) {
			h.respondError(w, "Kode bank hanya boleh mengandung huruf", http.StatusBadRequest)
			return
		}
	}

	// ─── SECURITY LAYER 5: Idempotency Key Validation ───────────────────────────
	// Client WAJIB mengirimkan UUID v4 sebagai idempotency key.
	// Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
	// Ini mencegah: double-submit, replay attack, network retry exploit.
	if raw.IdempotencyKey == "" {
		h.respondError(w, "idempotency_key wajib diisi untuk mencegah double-submit", http.StatusBadRequest)
		return
	}
	idempotencyUUID, uuidErr := uuid.Parse(raw.IdempotencyKey)
	if uuidErr != nil || idempotencyUUID == uuid.Nil {
		h.respondError(w, "idempotency_key harus berupa UUID v4 yang valid", http.StatusBadRequest)
		return
	}
	// Pastikan UUID version 4 (randomly generated) — bukan v1 (timestamp-based)
	// UUID v4 bit 12-15 dari time_hi_and_version harus = 0100 (binary) = 4
	if idempotencyUUID.Version() != 4 {
		h.respondError(w, "idempotency_key harus berupa UUID versi 4", http.StatusBadRequest)
		return
	}

	// ─── ASSEMBLE VALIDATED REQUEST ──────────────────────────────────────────────
	withdrawReq := domain.WithdrawRequest{
		Amount:         raw.Amount,
		AccountNumber:  raw.AccountNumber,                         // numerik murni
		AccountHolder:  rawHolder,                                 // sudah di-trim dan divalidasi
		BankCode:       toUpperCase(rawBankCode),                  // normalisasi ke huruf besar
		IdempotencyKey: idempotencyUUID.String(),                  // canonical UUID string
	}

	// ─── DELEGATE KE SERVICE LAYER ───────────────────────────────────────────────
	if err := h.svc.Withdraw(r.Context(), userID, userRole, withdrawReq); err != nil {
		h.safeError(w, r, err, correlationID, "withdraw")
		return
	}

	h.respondJSON(w, map[string]string{
		"message": "Permintaan penarikan dana berhasil diterima",
		"status":  "pending",
	}, http.StatusAccepted)
}

// trimAndNormalizeSpace menghapus leading/trailing whitespace dan
// mengganti multiple spaces menjadi satu spasi tunggal.
func trimAndNormalizeSpace(s string) string {
	result := make([]rune, 0, len(s))
	prevSpace := false
	for i, r := range s {
		if r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			if i > 0 && !prevSpace {
				result = append(result, ' ')
			}
			prevSpace = true
		} else {
			result = append(result, r)
			prevSpace = false
		}
	}
	// Trim trailing space
	for len(result) > 0 && result[len(result)-1] == ' ' {
		result = result[:len(result)-1]
	}
	return string(result)
}

// isValidNameChar memeriksa apakah rune adalah karakter yang valid untuk
// nama pemilik rekening bank: huruf unicode, spasi, titik, atau apostrof.
// Pendekatan whitelist — tolak semua karakter selain yang secara eksplisit diizinkan.
func isValidNameChar(c rune) bool {
	// Huruf (unicode — mencakup nama internasional seperti "João" atau "Müller")
	if (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') {
		return true
	}
	// Karakter nama yang diizinkan
	if c == ' ' || c == '.' || c == '\'' {
		return true
	}
	return false
}

// toUpperCase mengkonversi string ke huruf besar (ASCII only — untuk bank code)
func toUpperCase(s string) string {
	result := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		if s[i] >= 'a' && s[i] <= 'z' {
			result[i] = s[i] - 32
		} else {
			result[i] = s[i]
		}
	}
	return string(result)
}


func (h *WalletHandler) respondJSON(w http.ResponseWriter, data any, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (h *WalletHandler) respondError(w http.ResponseWriter, message string, status int) {
	h.respondJSON(w, map[string]string{"error": message}, status)
}
