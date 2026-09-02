package handler

import (
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type PaymentLinkHandler struct {
	svc        domain.PaymentLinkService
	configRepo domain.ConfigRepository
}

func NewPaymentLinkHandler(svc domain.PaymentLinkService, configRepo domain.ConfigRepository) *PaymentLinkHandler {
	return &PaymentLinkHandler{svc: svc, configRepo: configRepo}
}

func writeRequoteRequired(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusConflict)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":          false,
		"code":             "REQUOTE_REQUIRED",
		"message":          "Quote perlu dihitung ulang sebelum order dapat dibuat.",
		"requires_requote": true,
		"correlation_id":   middleware.GetCorrelationID(r.Context()),
		"action":           "Tinjau harga terbaru lalu lanjutkan kembali.",
		"retryable":        false,
	})
}

func (h *PaymentLinkHandler) CreateLink(w http.ResponseWriter, r *http.Request) {
	merchantID := r.Header.Get("X-User-ID")
	if merchantID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req domain.CreatePaymentLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.ItemName == "" || req.DropoffAddress == "" || req.ItemImageURL == "" {
		http.Error(w, "Missing required fields", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	if strings.TrimSpace(req.LogisticsProvider) != "" {
		quoteSvc, ok := h.svc.(domain.AggregatorRateQuoteService)
		if !ok {
			http.Error(w, "authoritative carrier quote service is unavailable", http.StatusServiceUnavailable)
			return
		}
		quote, err := quoteSvc.ValidateSelection(ctx, req.AggregatorQuoteID, req.LogisticsProvider, req.LogisticsServiceType)
		if err != nil {
			var requoteErr *domain.RequoteRequiredError
			if errors.As(err, &requoteErr) {
				writeRequoteRequired(w, r)
				return
			}
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		ctx = domain.WithAggregatorQuoteID(ctx, quote.ID)
	}

	link, err := h.svc.CreateLink(ctx, merchantID, req)
	if err != nil {
		var requoteErr *domain.RequoteRequiredError
		if errors.As(err, &requoteErr) {
			writeRequoteRequired(w, r)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    link,
	})
}

func (h *PaymentLinkHandler) GetLink(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	id := parts[len(parts)-1]

	if id == "" || id == "payment-links" {
		http.Error(w, "Missing link ID", http.StatusBadRequest)
		return
	}

	link, err := h.svc.GetLink(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    link,
	})
}

func (h *PaymentLinkHandler) ListLinks(w http.ResponseWriter, r *http.Request) {
	merchantID := r.Header.Get("X-User-ID")
	if merchantID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit, _ := strconv.Atoi(limitStr)
	if limit <= 0 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}
	offset, _ := strconv.Atoi(offsetStr)

	links, err := h.svc.ListLinks(r.Context(), merchantID, limit, offset)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    links,
	})
}

func (h *PaymentLinkHandler) CheckoutLink(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 2 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}
	id := parts[len(parts)-2]

	if id == "" {
		http.Error(w, "Missing link ID", http.StatusBadRequest)
		return
	}

	resp, err := h.svc.CheckoutLink(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    resp,
	})
}

func (h *PaymentLinkHandler) HandleRequest(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		if strings.HasSuffix(r.URL.Path, "/checkout") {
			h.CheckoutLink(w, r)
		} else {
			h.CreateLink(w, r)
		}
		return
	}

	if r.Method == http.MethodGet {
		if strings.HasSuffix(r.URL.Path, "/payment-links") || strings.HasSuffix(r.URL.Path, "/payment-links/") {
			h.ListLinks(w, r)
		} else {
			h.GetLink(w, r)
		}
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func (h *PaymentLinkHandler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	var data map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
		return
	}

	orderID, _ := data["order_id"].(string)
	transactionStatus, _ := data["transaction_status"].(string)
	statusCode, _ := data["status_code"].(string)
	grossAmount, _ := data["gross_amount"].(string)
	signatureKey, _ := data["signature_key"].(string)

	if orderID == "" || transactionStatus == "" || signatureKey == "" {
		http.Error(w, "Missing required fields", http.StatusBadRequest)
		return
	}

	serverKey := h.configRepo.GetStringConfig(r.Context(), "midtrans_server_key", os.Getenv("MIDTRANS_SERVER_KEY"))

	hash := sha512.New()
	hash.Write([]byte(orderID + statusCode + grossAmount + serverKey))
	expectedSignature := hex.EncodeToString(hash.Sum(nil))

	if signatureKey != expectedSignature {
		http.Error(w, "Invalid signature", http.StatusUnauthorized)
		return
	}

	if err := h.svc.HandleWebhook(r.Context(), orderID, transactionStatus); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("OK"))
}

func (h *PaymentLinkHandler) CheckTariff(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	provider := r.URL.Query().Get("provider")
	if provider == "" {
		http.Error(w, "provider parameter is required", http.StatusBadRequest)
		return
	}

	weight, _ := strconv.ParseFloat(r.URL.Query().Get("weight_kg"), 64)
	if weight <= 0 {
		weight = 1.0
	}
	length, _ := strconv.ParseFloat(r.URL.Query().Get("length_cm"), 64)
	width, _ := strconv.ParseFloat(r.URL.Query().Get("width_cm"), 64)
	height, _ := strconv.ParseFloat(r.URL.Query().Get("height_cm"), 64)
	itemValue, _ := strconv.ParseInt(r.URL.Query().Get("item_value_idr"), 10, 64)
	insurance, _ := strconv.ParseBool(r.URL.Query().Get("insurance"))
	cod, _ := strconv.ParseBool(r.URL.Query().Get("cod"))

	quoteSvc, ok := h.svc.(domain.AggregatorRateQuoteService)
	if !ok {
		http.Error(w, "authoritative carrier quote service is unavailable", http.StatusServiceUnavailable)
		return
	}
	resp, err := quoteSvc.Quote(r.Context(), domain.CheckTariffRequest{
		Provider:        provider,
		OriginCode:      r.URL.Query().Get("origin_code"),
		DestinationCode: r.URL.Query().Get("destination_code"),
		WeightKG:        weight,
		LengthCM:        length,
		WidthCM:         width,
		HeightCM:        height,
		ItemValueIDR:    itemValue,
		Category:        r.URL.Query().Get("category"),
		Insurance:       insurance,
		COD:             cod,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    resp,
	})
}
