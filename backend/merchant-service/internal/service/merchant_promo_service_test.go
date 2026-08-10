package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"tembus/merchant-service/internal/domain"
)

// ── mock promo repo (embed interface → override) ──
type mockPromoRepo struct {
	domain.MerchantPromoRepository
	created   []*domain.MerchantPromo
	getByIDFn func(ctx context.Context, id, merchantID string) (*domain.MerchantPromo, error)
	updateFn  func(ctx context.Context, p *domain.MerchantPromo) error
	setActive func(ctx context.Context, id, merchantID string, active bool) error
	deleteFn  func(ctx context.Context, id, merchantID string) error
	listFn    func(ctx context.Context, merchantID string, limit, offset int) ([]*domain.MerchantPromo, int, error)
	activeFn  func(ctx context.Context, merchantID string, now time.Time) ([]*domain.MerchantPromo, error)
}

func (m *mockPromoRepo) Create(ctx context.Context, p *domain.MerchantPromo) error {
	m.created = append(m.created, p)
	return nil
}

func (m *mockPromoRepo) GetByID(ctx context.Context, id, merchantID string) (*domain.MerchantPromo, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id, merchantID)
	}
	return nil, errors.New("not found")
}

func (m *mockPromoRepo) Update(ctx context.Context, p *domain.MerchantPromo) error {
	if m.updateFn != nil {
		return m.updateFn(ctx, p)
	}
	return nil
}

func (m *mockPromoRepo) SetActive(ctx context.Context, id, merchantID string, active bool) error {
	if m.setActive != nil {
		return m.setActive(ctx, id, merchantID, active)
	}
	return nil
}

func (m *mockPromoRepo) Delete(ctx context.Context, id, merchantID string) error {
	if m.deleteFn != nil {
		return m.deleteFn(ctx, id, merchantID)
	}
	return nil
}

func (m *mockPromoRepo) ListByMerchant(ctx context.Context, merchantID string, limit, offset int) ([]*domain.MerchantPromo, int, error) {
	if m.listFn != nil {
		return m.listFn(ctx, merchantID, limit, offset)
	}
	return nil, 0, nil
}

func (m *mockPromoRepo) ListActiveByMerchant(ctx context.Context, merchantID string, now time.Time) ([]*domain.MerchantPromo, error) {
	if m.activeFn != nil {
		return m.activeFn(ctx, merchantID, now)
	}
	return nil, nil
}

// ── mock menu repo (embed interface → override GetByID) ──
type mockMenuRepoPromo struct {
	domain.MenuItemRepository
	getByID func(ctx context.Context, id string) (*domain.MenuItem, error)
}

func (m *mockMenuRepoPromo) GetByID(ctx context.Context, id string) (*domain.MenuItem, error) {
	return m.getByID(ctx, id)
}

func newPromoService(promo domain.MerchantPromoRepository, menu domain.MenuItemRepository) *MerchantPromoService {
	return NewMerchantPromoService(promo, menu)
}

func TestPromoCreate_Valid(t *testing.T) {
	repo := &mockPromoRepo{}
	menu := &mockMenuRepoPromo{getByID: func(ctx context.Context, id string) (*domain.MenuItem, error) {
		return menuItem(id, "merchant-1", "Nasi Goreng", 15000, true), nil
	}}
	svc := newPromoService(repo, menu)

	p, err := svc.Create(context.Background(), "merchant-1", domain.CreateMerchantPromoRequest{
		MenuItemID:     strPtr("item-1"),
		DiscountType:   "percent",
		DiscountValue:  20,
		MaxDiscountIDR: int64Ptr(10000),
		StartsAt:       "2026-08-08T08:00:00Z",
		EndsAt:         "2026-08-15T23:59:59Z",
	})
	if err != nil {
		t.Fatalf("Create gagal: %v", err)
	}
	if p.DiscountType != "percent" || p.DiscountValue != 20 {
		t.Fatalf("promo tidak tersimpan benar: %+v", p)
	}
	if !p.IsActive {
		t.Fatal("promo baru harus aktif")
	}
	if len(repo.created) != 1 {
		t.Fatalf("repo.Create tidak dipanggil: %d", len(repo.created))
	}
}

func TestPromoCreate_Invalid(t *testing.T) {
	repo := &mockPromoRepo{}
	menu := &mockMenuRepoPromo{}
	svc := newPromoService(repo, menu)

	cases := []struct {
		name string
		req  domain.CreateMerchantPromoRequest
	}{
		{"discount_type invalid", domain.CreateMerchantPromoRequest{
			DiscountType: "cashback", DiscountValue: 10,
			StartsAt: "2026-08-08T08:00:00Z", EndsAt: "2026-08-15T23:59:59Z",
		}},
		{"discount_value nol", domain.CreateMerchantPromoRequest{
			DiscountType: "fixed", DiscountValue: 0,
			StartsAt: "2026-08-08T08:00:00Z", EndsAt: "2026-08-15T23:59:59Z",
		}},
		{"percent > 100", domain.CreateMerchantPromoRequest{
			DiscountType: "percent", DiscountValue: 150,
			StartsAt: "2026-08-08T08:00:00Z", EndsAt: "2026-08-15T23:59:59Z",
		}},
		{"max_discount negatif", domain.CreateMerchantPromoRequest{
			DiscountType: "percent", DiscountValue: 20, MaxDiscountIDR: int64Ptr(-5),
			StartsAt: "2026-08-08T08:00:00Z", EndsAt: "2026-08-15T23:59:59Z",
		}},
		{"window terbalik", domain.CreateMerchantPromoRequest{
			DiscountType: "fixed", DiscountValue: 5000,
			StartsAt: "2026-08-15T08:00:00Z", EndsAt: "2026-08-08T23:59:59Z",
		}},
		{"starts_at bukan RFC3339", domain.CreateMerchantPromoRequest{
			DiscountType: "fixed", DiscountValue: 5000,
			StartsAt: "besok", EndsAt: "2026-08-15T23:59:59Z",
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := svc.Create(context.Background(), "merchant-1", c.req)
			if err == nil {
				t.Fatal("harus error, tapi nil")
			}
		})
	}
	if len(repo.created) != 0 {
		t.Fatalf("repo.Create kepanggil utk request invalid: %d", len(repo.created))
	}
}

func TestPromoCreate_MenuBukanMilikMerchant(t *testing.T) {
	repo := &mockPromoRepo{}
	menu := &mockMenuRepoPromo{getByID: func(ctx context.Context, id string) (*domain.MenuItem, error) {
		return menuItem(id, "merchant-LAIN", "Nasi Goreng", 15000, true), nil
	}}
	svc := newPromoService(repo, menu)

	_, err := svc.Create(context.Background(), "merchant-1", domain.CreateMerchantPromoRequest{
		MenuItemID: strPtr("item-1"), DiscountType: "fixed", DiscountValue: 5000,
		StartsAt: "2026-08-08T08:00:00Z", EndsAt: "2026-08-15T23:59:59Z",
	})
	if err == nil {
		t.Fatal("menu milik merchant lain harus ditolak")
	}
}

func TestPromoUpdate_RewindowValid(t *testing.T) {
	now := time.Now().UTC()
	repo := &mockPromoRepo{
		getByIDFn: func(ctx context.Context, id, merchantID string) (*domain.MerchantPromo, error) {
			return &domain.MerchantPromo{
				ID: id, MerchantID: merchantID, DiscountType: "fixed", DiscountValue: 5000,
				StartsAt: now.Add(-24 * time.Hour), EndsAt: now.Add(24 * time.Hour), IsActive: true,
			}, nil
		},
	}
	svc := newPromoService(repo, &mockMenuRepoPromo{})

	// Pindah window ke depan — harus valid.
	p, err := svc.Update(context.Background(), "merchant-1", "promo-1", domain.UpdateMerchantPromoRequest{
		StartsAt: strPtr(now.Add(48 * time.Hour).Format(time.RFC3339)),
		EndsAt:   strPtr(now.Add(72 * time.Hour).Format(time.RFC3339)),
	})
	if err != nil {
		t.Fatalf("Update window valid malah error: %v", err)
	}
	if !p.EndsAt.After(p.StartsAt) {
		t.Fatal("window tidak tersimpan benar")
	}
}

func strPtr(s string) *string { return &s }
func int64Ptr(v int64) *int64 { return &v }
