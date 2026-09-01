package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"tembus/merchant-service/internal/domain"
)

// PartialRejectOrder implements the merchant item-unavailable flow. Ownership
// and quantities are checked against the merchant's server-side order snapshot;
// price is never accepted from the Android/web client.
func (s *merchantServiceImpl) PartialRejectOrder(ctx context.Context, userID, orderID string, req domain.PartialRejectOrderRequest) (*domain.PartialRejectResult, error) {
	m, err := s.merchantRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if m == nil || m.VerificationStatus != "approved" {
		return nil, errors.New("merchant belum terdaftar atau belum disetujui")
	}
	if len(req.Items) == 0 {
		return nil, errors.New("minimal satu item tidak tersedia wajib dipilih")
	}

	order, err := s.orderRepo.GetOrderForStruk(ctx, m.ID, orderID)
	if err != nil {
		return nil, err
	}
	if order.Status != "pending_merchant" && order.Status != "preparing" {
		return nil, fmt.Errorf("item hanya dapat dikembalikan saat order baru atau sedang diproses (status %s)", order.Status)
	}

	available := make(map[string]int, len(order.Items))
	for _, item := range order.Items {
		available[item.MenuItemID] += item.Quantity
	}
	seen := make(map[string]bool, len(req.Items))
	refundItems := make([]map[string]any, 0, len(req.Items))
	for _, item := range req.Items {
		id := strings.TrimSpace(item.MenuItemID)
		if id == "" || item.Quantity < 1 {
			return nil, errors.New("menu_item_id dan quantity valid wajib diisi")
		}
		if seen[id] {
			return nil, fmt.Errorf("item %s dipilih lebih dari sekali", id)
		}
		seen[id] = true
		if item.Quantity > available[id] {
			return nil, fmt.Errorf("quantity item %s melebihi pesanan", id)
		}
		reason := strings.TrimSpace(item.Reason)
		if reason == "" {
			reason = strings.TrimSpace(req.Reason)
		}
		if reason == "" {
			reason = "Item tidak tersedia"
		}
		refundItems = append(refundItems, map[string]any{
			"menu_item_id": id,
			"quantity":     item.Quantity,
			"reason":       reason,
		})
	}

	payload, err := json.Marshal(map[string]any{
		"order_id":             orderID,
		"items":                refundItems,
		"include_delivery_fee": false,
		"reason":               strings.TrimSpace(req.Reason),
	})
	if err != nil {
		return nil, fmt.Errorf("encode partial refund: %w", err)
	}
	baseURL := strings.TrimSpace(os.Getenv("ORDER_SERVICE_URL"))
	if baseURL == "" {
		baseURL = "http://order-service:8083"
	}
	callCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	httpReq, err := http.NewRequestWithContext(callCtx, http.MethodPost, baseURL+"/api/v1/internal/refunds/items", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("create partial refund request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Internal-Api-Key", os.Getenv("INTERNAL_API_KEY"))
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("order-service partial refund unavailable: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("partial refund gagal (status %d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var envelope struct {
		Data struct {
			ID               string `json:"id"`
			OrderID          string `json:"order_id"`
			AmountIDR        int64  `json:"amount_idr"`
			RefundPercentage int    `json:"refund_percentage"`
			Status           string `json:"status"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, fmt.Errorf("decode partial refund response: %w", err)
	}
	if envelope.Data.ID == "" || envelope.Data.OrderID == "" {
		return nil, errors.New("order-service mengembalikan partial refund tanpa record")
	}

	description := fmt.Sprintf("%d item tidak tersedia; refund Rp %d", len(refundItems), envelope.Data.AmountIDR)
	if eventErr := s.orderRepo.RecordOrderEvent(ctx, orderID, "item_unavailable_refunded", description); eventErr != nil {
		// The refund is already committed by order-service. Do not return an
		// error that would make the client retry and risk a duplicate payout.
		log.Printf("[MerchantService] PartialRejectOrder: refund %s berhasil, event gagal dicatat: %v", envelope.Data.ID, eventErr)
	}
	go s.notifyCustomerOrderUpdated(orderID, "Sebagian item pesanan tidak tersedia. Refund sedang diproses.")
	return &domain.PartialRejectResult{
		OrderID:          envelope.Data.OrderID,
		RefundID:         envelope.Data.ID,
		AmountIDR:        envelope.Data.AmountIDR,
		RefundPercentage: envelope.Data.RefundPercentage,
		Status:           envelope.Data.Status,
	}, nil
}
