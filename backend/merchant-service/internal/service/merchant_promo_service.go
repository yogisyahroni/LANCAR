package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"tembus/merchant-service/internal/domain"
)

// MerchantPromoService — CRUD self-serve promo merchant (FB-099).
// TANPA approval admin (bukan duit PT) — merchant langsung bisa pasang.
// Validasi: discount_type valid, value > 0, window waktu valid,
// max_discount_idr >= 0 (opsional), harga tidak boleh negatif/nol.
type MerchantPromoService struct {
	promoRepo    domain.MerchantPromoRepository
	menuRepo     domain.MenuItemRepository
	merchantRepo domain.MerchantRepository
	accessRepo   domain.MerchantAccessRepository
}

// NewMerchantPromoService buat service promo merchant.
func NewMerchantPromoService(
	promoRepo domain.MerchantPromoRepository,
	menuRepo domain.MenuItemRepository,
	optional ...interface{},
) *MerchantPromoService {
	service := &MerchantPromoService{promoRepo: promoRepo, menuRepo: menuRepo}
	for _, dependency := range optional {
		switch value := dependency.(type) {
		case domain.MerchantRepository:
			service.merchantRepo = value
		case domain.MerchantAccessRepository:
			service.accessRepo = value
		}
	}
	return service
}

func (s *MerchantPromoService) resolveMerchant(ctx context.Context, userID string) (string, error) {
	if s.merchantRepo == nil {
		return userID, nil
	}
	merchant, err := s.merchantRepo.GetByUserID(ctx, userID)
	if err != nil {
		return "", err
	}
	if merchant != nil {
		return merchant.ID, nil
	}
	if s.accessRepo == nil {
		return "", errors.New("merchant belum terdaftar")
	}
	access := domain.MerchantAccessFromContext(ctx)
	if strings.TrimSpace(access.SessionToken) == "" || strings.TrimSpace(access.BranchID) == "" || strings.TrimSpace(access.DeviceID) == "" {
		return "", errors.New("merchant session, branch, dan device wajib diisi untuk staff")
	}
	session, err := s.accessRepo.AuthorizeDeviceSession(ctx, domain.MerchantSessionAuthorization{
		UserID: userID, BranchID: access.BranchID, DeviceID: access.DeviceID,
		SessionToken: access.SessionToken, RequiredPermission: access.RequiredPermission,
	})
	if err != nil {
		return "", err
	}
	return session.MerchantID, nil
}

var validPromoTypes = map[string]bool{"percent": true, "fixed": true, "buy1get1": true}

// parsePromoWindow parse RFC3339 start/end + validasi urutan.
func parsePromoWindow(startsAt, endsAt string) (time.Time, time.Time, error) {
	start, err := time.Parse(time.RFC3339, startsAt)
	if err != nil {
		return time.Time{}, time.Time{}, errors.New("starts_at harus format RFC3339 (mis. 2026-08-08T10:00:00Z)")
	}
	end, err := time.Parse(time.RFC3339, endsAt)
	if err != nil {
		return time.Time{}, time.Time{}, errors.New("ends_at harus format RFC3339")
	}
	if !end.After(start) {
		return time.Time{}, time.Time{}, errors.New("ends_at harus setelah starts_at")
	}
	return start, end, nil
}

// validatePromo — validasi umum create & update.
func validatePromo(discountType string, discountValue int64, maxDiscountIDR *int64) error {
	if !validPromoTypes[discountType] {
		return errors.New("discount_type harus percent | fixed | buy1get1")
	}
	if discountValue <= 0 {
		return errors.New("discount_value harus lebih dari 0 (harga tidak boleh nol/negatif)")
	}
	if discountType == "percent" && discountValue > 100 {
		return errors.New("discount_value percent maksimal 100")
	}
	if maxDiscountIDR != nil && *maxDiscountIDR < 0 {
		return errors.New("max_discount_idr tidak boleh negatif")
	}
	if discountType != "percent" && maxDiscountIDR != nil && *maxDiscountIDR > 0 {
		return errors.New("max_discount_idr hanya relevan untuk discount_type percent")
	}
	return nil
}

func (s *MerchantPromoService) Create(ctx context.Context, userID string, req domain.CreateMerchantPromoRequest) (*domain.MerchantPromo, error) {
	merchantID, err := s.resolveMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if err := validatePromo(req.DiscountType, req.DiscountValue, req.MaxDiscountIDR); err != nil {
		return nil, err
	}
	start, end, err := parsePromoWindow(req.StartsAt, req.EndsAt)
	if err != nil {
		return nil, err
	}
	// menu_item_id nullable → kalau diisi, wajib milik merchant ini.
	if req.MenuItemID != nil && *req.MenuItemID != "" {
		item, err := s.menuRepo.GetByID(ctx, *req.MenuItemID)
		if err != nil {
			return nil, errors.New("menu item tidak ditemukan")
		}
		if item.MerchantID != merchantID {
			return nil, errors.New("menu item bukan milik merchant ini")
		}
	}

	p := &domain.MerchantPromo{
		ID:             uuid.NewString(),
		MerchantID:     merchantID,
		MenuItemID:     req.MenuItemID,
		DiscountType:   req.DiscountType,
		DiscountValue:  req.DiscountValue,
		MaxDiscountIDR: req.MaxDiscountIDR,
		StartsAt:       start,
		EndsAt:         end,
		IsActive:       true,
	}
	if err := s.promoRepo.Create(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

func (s *MerchantPromoService) List(ctx context.Context, userID string, page, pageSize int) ([]*domain.MerchantPromo, int, error) {
	merchantID, err := s.resolveMerchant(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return s.promoRepo.ListByMerchant(ctx, merchantID, pageSize, (page-1)*pageSize)
}

func (s *MerchantPromoService) Update(ctx context.Context, userID, promoID string, req domain.UpdateMerchantPromoRequest) (*domain.MerchantPromo, error) {
	merchantID, err := s.resolveMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	existing, err := s.promoRepo.GetByID(ctx, promoID, merchantID)
	if err != nil {
		return nil, err
	}
	if req.DiscountType != nil {
		existing.DiscountType = *req.DiscountType
	}
	if req.DiscountValue != nil {
		existing.DiscountValue = *req.DiscountValue
	}
	if req.MaxDiscountIDR != nil {
		existing.MaxDiscountIDR = req.MaxDiscountIDR
	}
	if req.MenuItemID != nil {
		existing.MenuItemID = req.MenuItemID
	}
	// Validasi ulang setelah merge (kalau field diubah).
	if err := validatePromo(existing.DiscountType, existing.DiscountValue, existing.MaxDiscountIDR); err != nil {
		return nil, err
	}
	if req.StartsAt != nil || req.EndsAt != nil {
		start, end := existing.StartsAt, existing.EndsAt
		if req.StartsAt != nil {
			start, err = time.Parse(time.RFC3339, *req.StartsAt)
			if err != nil {
				return nil, errors.New("starts_at harus format RFC3339")
			}
		}
		if req.EndsAt != nil {
			end, err = time.Parse(time.RFC3339, *req.EndsAt)
			if err != nil {
				return nil, errors.New("ends_at harus format RFC3339")
			}
		}
		if !end.After(start) {
			return nil, errors.New("ends_at harus setelah starts_at")
		}
		existing.StartsAt, existing.EndsAt = start, end
	}
	if err := s.promoRepo.Update(ctx, existing); err != nil {
		return nil, err
	}
	return s.promoRepo.GetByID(ctx, promoID, merchantID)
}

func (s *MerchantPromoService) SetActive(ctx context.Context, userID, promoID string, active bool) error {
	merchantID, err := s.resolveMerchant(ctx, userID)
	if err != nil {
		return err
	}
	return s.promoRepo.SetActive(ctx, promoID, merchantID, active)
}

func (s *MerchantPromoService) Delete(ctx context.Context, userID, promoID string) error {
	merchantID, err := s.resolveMerchant(ctx, userID)
	if err != nil {
		return err
	}
	return s.promoRepo.Delete(ctx, promoID, merchantID)
}
