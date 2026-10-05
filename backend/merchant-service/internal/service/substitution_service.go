package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"tembus/merchant-service/internal/domain"
)

// ProposeFoodSubstitution keeps the merchant portal as a thin authenticated
// edge. The order-service owns the canonical proposal, menu ownership check,
// price snapshot, customer decision, and notification side effects.
func (s *merchantServiceImpl) ProposeFoodSubstitution(ctx context.Context, userID, orderID string, input domain.ProposeMerchantSubstitutionRequest) (*domain.MerchantSubstitutionProposal, error) {
	m, err := s.requireMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if m == nil || m.VerificationStatus != "approved" {
		return nil, errors.New("merchant belum terdaftar atau belum disetujui")
	}
	orderID = strings.TrimSpace(orderID)
	input.OriginalMenuItemID = strings.TrimSpace(input.OriginalMenuItemID)
	input.ReplacementMenuItemID = strings.TrimSpace(input.ReplacementMenuItemID)
	input.Reason = strings.TrimSpace(input.Reason)
	if orderID == "" || input.OriginalMenuItemID == "" || input.ReplacementMenuItemID == "" {
		return nil, errors.New("order dan item asli/pengganti wajib diisi")
	}
	if input.OriginalMenuItemID == input.ReplacementMenuItemID {
		return nil, errors.New("item pengganti harus berbeda dari item asli")
	}

	baseURL := strings.TrimSpace(os.Getenv("ORDER_SERVICE_URL"))
	if baseURL == "" || strings.Contains(baseURL, "localhost") || strings.Contains(baseURL, "127.0.0.1") {
		baseURL = "http://order-service:8083"
	}
	payload, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("encode substitution proposal: %w", err)
	}
	callCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, baseURL+"/api/v1/internal/food/orders/"+orderID+"/substitution", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("create substitution request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Api-Key", os.Getenv("INTERNAL_API_KEY"))
	req.Header.Set("X-Merchant-ID", m.ID)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("order-service substitution unavailable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("substitution proposal ditolak order-service (status %d)", resp.StatusCode)
	}
	var proposal domain.MerchantSubstitutionProposal
	if err := json.NewDecoder(resp.Body).Decode(&proposal); err != nil {
		return nil, fmt.Errorf("decode substitution proposal: %w", err)
	}
	if proposal.ID == "" || proposal.OrderID == "" {
		return nil, errors.New("order-service mengembalikan proposal tanpa identitas")
	}
	return &proposal, nil
}
