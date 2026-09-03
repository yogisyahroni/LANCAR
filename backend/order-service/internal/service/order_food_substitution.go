package service

import (
	"context"
	"fmt"
	"tembus/order-service/internal/domain"
)

// ── FOOD-2026-007: Item unavailable + substitution flow ──────────

// ReportFoodItemUnavailableService — merchant laporkan item tidak tersedia
// di tengah proses (status preparing). Order tetap berjalan; item ditandai
// unavailable. Merchant wajib propose substitution atau customer bisa cancel.
func (s *orderServiceImpl) ReportFoodItemUnavailable(ctx context.Context, merchantID, orderID string, req domain.ReportFoodItemUnavailableRequest) error {
	if s.foodRepo == nil {
		return fmt.Errorf("food repository not wired")
	}
	// Validasi kepemilikan + status: harus preparing (merchant sedang masak).
	o, err := s.foodRepo.GetFoodOrderForMerchant(ctx, orderID, merchantID)
	if err != nil {
		return err
	}
	if o.Status != domain.StatusPreparing {
		return fmt.Errorf("order %s tidak dalam status preparing (status: %s) — item unavailable hanya bisa dilaporkan saat sedang disiapkan", orderID, o.Status)
	}
	// Validasi item memang ada di order ini (zero-trust).
	items, err := s.foodRepo.GetFoodOrderItems(ctx, orderID)
	if err != nil {
		return fmt.Errorf("ambil item order: %w", err)
	}
	found := false
	for _, it := range items {
		if it.MenuItemID == req.MenuItemID {
			if req.Quantity > it.Quantity {
				return fmt.Errorf("quantity tidak tersedia: diminta %d, tersedia %d", req.Quantity, it.Quantity)
			}
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("menu item %s tidak ada di order %s", req.MenuItemID, orderID)
	}
	return s.foodRepo.ReportFoodItemUnavailable(ctx, domain.FoodItemUnavailable{
		OrderID:    orderID,
		MenuItemID: req.MenuItemID,
		Quantity:   req.Quantity,
		Reason:     req.Reason,
		ReportedBy: "merchant",
	})
}

// ProposeFoodSubstitution — merchant propose pengganti untuk item unavailable.
// Price delta dihitung server-side (snapshot order price vs live replacement price).
// Hanya bisa untuk item belum ada proposal pending-nya, di order preparing.
func (s *orderServiceImpl) ProposeFoodSubstitution(ctx context.Context, merchantID, orderID string, req domain.ProposeFoodSubstitutionRequest) (*domain.FoodSubstitutionProposal, error) {
	if s.foodRepo == nil {
		return nil, fmt.Errorf("food repository not wired")
	}
	// Validasi kepemilikan + status.
	o, err := s.foodRepo.GetFoodOrderForMerchant(ctx, orderID, merchantID)
	if err != nil {
		return nil, err
	}
	if o.Status != domain.StatusPreparing {
		return nil, fmt.Errorf("order %s tidak dalam status preparing (status: %s) — substitution hanya bisa dipropose saat sedang disiapkan", orderID, o.Status)
	}
	// Cegah duplicate proposal untuk item yang sama.
	pending, err := s.foodRepo.GetPendingSubstitutionProposals(ctx, orderID)
	if err != nil {
		return nil, fmt.Errorf("cek proposal pending: %w", err)
	}
	for _, p := range pending {
		if p.OriginalItemID == req.OriginalMenuItemID {
			return nil, fmt.Errorf("sudah ada proposal substitution pending untuk item %s — selesaikan dulu yang lama", req.OriginalMenuItemID)
		}
	}
	// Validate original item ada di order.
	items, err := s.foodRepo.GetFoodOrderItems(ctx, orderID)
	if err != nil {
		return nil, fmt.Errorf("ambil item order: %w", err)
	}
	found := false
	for _, it := range items {
		if it.MenuItemID == req.OriginalMenuItemID {
			found = true
			break
		}
	}
	if !found {
		return nil, fmt.Errorf("original menu item %s tidak ada di order %s", req.OriginalMenuItemID, orderID)
	}
	// Validate replacement item exist di menu merchant (zero-trust).
	menuItems, err := s.foodRepo.GetFoodMenuItems(ctx, []string{req.ReplacementMenuItemID})
	if err != nil {
		return nil, fmt.Errorf("ambil menu item: %w", err)
	}
	if len(menuItems) == 0 || menuItems[0].MerchantID != merchantID {
		return nil, fmt.Errorf("replacement menu item %s tidak ditemukan atau bukan milik merchant", req.ReplacementMenuItemID)
	}
	proposal, err := s.foodRepo.CreateFoodSubstitutionProposal(ctx, domain.FoodSubstitutionProposal{
		OrderID:           orderID,
		OriginalItemID:    req.OriginalMenuItemID,
		ReplacementItemID: req.ReplacementMenuItemID,
		Reason:            req.Reason,
		ProposedBy:        "merchant",
	})
	if err != nil {
		return nil, err
	}
	// Notif customer — substitution butuh keputusan.
	if s.notificationSvc != nil {
		_ = s.notificationSvc.Send(ctx, domain.NotificationRequest{
			UserID:  o.CustomerID,
			Title:   "Item makanan tidak tersedia",
			Message: "Merchant usulkan pengganti untuk item yang tidak tersedia — cek pesananmu",
			Channel: domain.ChannelPush,
			Data: map[string]string{
				"type":        "substitution_proposed",
				"order_id":    orderID,
				"proposal_id": proposal.ID,
			},
		})
	}
	return proposal, nil
}

// GetPendingSubstitutionProposals — customer lihat proposal pending.
// Validate customer ID == order owner (authorization).
func (s *orderServiceImpl) GetPendingSubstitutionProposals(ctx context.Context, customerID, orderID string) ([]*domain.FoodSubstitutionProposal, error) {
	if s.foodRepo == nil {
		return nil, fmt.Errorf("food repository not wired")
	}
	o, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return nil, fmt.Errorf("order tidak ditemukan: %w", err)
	}
	if o.CustomerID != customerID {
		return nil, fmt.Errorf("order %s bukan milik customer %s", orderID, customerID)
	}
	return s.foodRepo.GetPendingSubstitutionProposals(ctx, orderID)
}

// DecideFoodSubstitution — customer approve/reject proposal.
// Hanya bisa saat order masih preparing/searching (belum di-assign courier
// atau masih di pickup). Jika approve: update food_order_items price + event.
// Jika reject: proposal discard, notif ke merchant.
func (s *orderServiceImpl) DecideFoodSubstitution(ctx context.Context, customerID, proposalID string, req domain.SubstitutionDecisionRequest) error {
	if s.foodRepo == nil {
		return fmt.Errorf("food repository not wired")
	}
	// Lookup proposal full (pending atau sudah resolved — guard di repo level).
	p, err := s.foodRepo.GetSubstitutionProposalByID(ctx, proposalID)
	if err != nil {
		return fmt.Errorf("ambil proposal: %w", err)
	}
	if p.CustomerDecision != "pending" {
		return fmt.Errorf("substitution proposal %s sudah diputuskan (status: %s)", proposalID, p.CustomerDecision)
	}
	o, err := s.orderRepo.GetByID(ctx, p.OrderID)
	if err != nil {
		return fmt.Errorf("order tidak ditemukan: %w", err)
	}
	if o.CustomerID != customerID {
		return fmt.Errorf("order %s bukan milik customer %s", o.ID, customerID)
	}
	if o.Status != domain.StatusPreparing && o.Status != domain.StatusSearching {
		return fmt.Errorf("order %s status %s — keputusan substitution hanya bisa saat preparing/searching", o.ID, o.Status)
	}
	if err := s.foodRepo.ResolveFoodSubstitution(ctx, proposalID, req.Decision); err != nil {
		return fmt.Errorf("resolve substitution: %w", err)
	}
	if req.Decision == "approved" {
		// Update harga item food_order_items → harga replacement live.
		if err := s.foodRepo.UpdateFoodOrderItemPrice(ctx, p.OrderID, p.OriginalItemID, p.ReplacementPrice); err != nil {
			return fmt.Errorf("update harga item order: %w", err)
		}
		// Event + notif customer bahwa harga berubah.
		s.publishOrderEvent(ctx, p.OrderID, o.Status,
			fmt.Sprintf("Substitution approved: %s → %s (delta Rp %d)", p.OriginalItemName, p.ReplacementItemName, p.PriceDifferenceIDR))
		if s.notificationSvc != nil {
			_ = s.notificationSvc.Send(ctx, domain.NotificationRequest{
				UserID:  customerID,
				Title:   "Substitution disetujui",
				Message: "Pesananmu diperbarui dengan item pengganti.",
				Channel: domain.ChannelPush,
				Data: map[string]string{
					"type":        "substitution_approved",
					"order_id":    p.OrderID,
					"proposal_id": proposalID,
				},
			})
		}
	} else {
		// Customer reject → notif merchant agar bisa usulkan lagi atau cancel.
		if s.notificationSvc != nil {
			merchantID := ""
			if o.MerchantID != nil {
				merchantID = *o.MerchantID
			}
			_ = s.notificationSvc.Send(ctx, domain.NotificationRequest{
				UserID:  merchantID,
				Title:   "Customer tolak substitution",
				Message: fmt.Sprintf("Customer menolak usulan pengganti untuk item %s", p.OriginalItemName),
				Channel: domain.ChannelPush,
				Data: map[string]string{
					"type":        "substitution_rejected",
					"order_id":    p.OrderID,
					"proposal_id": proposalID,
				},
			})
		}
	}
	return nil
}
