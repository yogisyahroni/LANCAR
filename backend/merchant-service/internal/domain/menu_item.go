package domain

import (
	"context"
	"time"
)

// MenuItem — menu item merchant (FOOD-BIKE-004/016).
// Harga BIGINT (IDR, tanpa desimal) — konsisten dengan skema harga LANCAR.
type MenuItem struct {
	ID               string             `json:"id"`
	MerchantID       string             `json:"merchant_id"`
	Nama             string             `json:"nama"`
	Harga            int64              `json:"harga"`
	Foto             *string            `json:"foto,omitempty"`
	Deskripsi        *string            `json:"deskripsi,omitempty"`
	Kategori         string             `json:"kategori"`
	CategoryID       *string            `json:"category_id,omitempty"`
	PrepTimeMinutes  int                `json:"prep_time_minutes"`
	IsAvailable      bool               `json:"is_available"`
	Status           string             `json:"status"`
	ModerationStatus string             `json:"moderation_status"`
	ModerationReason *string            `json:"moderation_reason,omitempty"`
	Version          int64              `json:"version"`
	StockQuantity    *int               `json:"stock_quantity,omitempty"`
	DailySalesLimit  *int               `json:"daily_sales_limit,omitempty"`
	DailySalesCount  int                `json:"daily_sales_count"`
	SalesResetAt     *time.Time         `json:"sales_limit_reset_at,omitempty"`
	CreatedAt        time.Time          `json:"created_at"`
	UpdatedAt        time.Time          `json:"updated_at"`
	Images           []MenuItemImage    `json:"images,omitempty"`
	Schedules        []MenuItemSchedule `json:"schedules,omitempty"`
}

const (
	MenuItemStatusDraft             = "draft"
	MenuItemStatusActive            = "active"
	MenuItemStatusSoldOut           = "sold_out"
	MenuItemStatusScheduled         = "scheduled"
	MenuItemStatusArchived          = "archived"
	MenuItemStatusModerationPending = "moderation_pending"
	MenuItemStatusRejected          = "rejected"

	MenuModerationPending  = "pending"
	MenuModerationApproved = "approved"
	MenuModerationRejected = "rejected"

	MenuVariantKindVariant  = "variant"
	MenuVariantKindModifier = "modifier"
)

// MenuCategory is the canonical category entity. The legacy kategori string
// remains a response/import compatibility projection.
type MenuCategory struct {
	ID         string    `json:"id"`
	MerchantID string    `json:"merchant_id"`
	Name       string    `json:"name"`
	Slug       string    `json:"slug"`
	SortOrder  int       `json:"sort_order"`
	Status     string    `json:"status"`
	Version    int64     `json:"version"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type MenuItemImage struct {
	ID         string    `json:"id"`
	MenuItemID string    `json:"menu_item_id"`
	URL        string    `json:"url"`
	AltText    string    `json:"alt_text,omitempty"`
	SortOrder  int       `json:"sort_order"`
	IsPrimary  bool      `json:"is_primary"`
	CreatedAt  time.Time `json:"created_at"`
}

type MenuItemSchedule struct {
	ID         string `json:"id"`
	MenuItemID string `json:"menu_item_id"`
	Weekday    int    `json:"weekday"`
	StartsAt   string `json:"starts_at"`
	EndsAt     string `json:"ends_at"`
	IsActive   bool   `json:"is_active"`
}

// MenuItemRepository — interface CRUD menu merchant.
type MenuItemRepository interface {
	Create(ctx context.Context, item *MenuItem) error
	GetByID(ctx context.Context, id string) (*MenuItem, error)
	// ListByMerchant list menu milik merchant (pagination).
	ListByMerchant(ctx context.Context, merchantID string, limit, offset int) ([]*MenuItem, error)
	// Update update nama/harga/foto/kategori/prep_time/is_available.
	Update(ctx context.Context, item *MenuItem) error
	// SetAvailability toggle is_available (habis/masuk stok).
	SetAvailability(ctx context.Context, id string, merchantID string, available bool) error
	UpdateInventory(ctx context.Context, id string, merchantID string, stockQuantity *int, dailySalesLimit *int, resetAt *time.Time) error
	// Delete hapus menu item (soft-delete via status, atau hard delete).
	Delete(ctx context.Context, id string, merchantID string) error
	// CountByMerchant total menu (pagination).
	CountByMerchant(ctx context.Context, merchantID string) (int, error)
	// GetVariantsByMenuItem — FB-108: grup varian + opsi milik menu item.
	GetVariantsByMenuItem(ctx context.Context, menuItemID, merchantID string) ([]*MenuItemVariant, error)
	// ReplaceVariants — FB-108: replace SEMUA varian menu item dalam SATU
	// transaksi (hapus lama + insert baru). Dipakai editor varian mobile.
	ReplaceVariants(ctx context.Context, menuItemID, merchantID string, variants []*MenuItemVariant) error
}

// MenuItemVariant — grup varian menu (Ukuran, Level Pedas, Tambahan...).
type MenuItemVariant struct {
	ID         string                  `json:"id"`
	MenuItemID string                  `json:"menu_item_id"`
	Nama       string                  `json:"nama"`
	Kind       string                  `json:"kind"`
	Status     string                  `json:"status"`
	IsRequired bool                    `json:"is_required"`
	MinSelect  int                     `json:"min_select"`
	MaxSelect  int                     `json:"max_select"`
	SortOrder  int                     `json:"sort_order"`
	Options    []MenuItemVariantOption `json:"options"`
}

type CatalogImportRowError struct {
	Row     int    `json:"row"`
	Message string `json:"message"`
}

type BulkMenuImportResult struct {
	ImportID     string                  `json:"import_id"`
	Committed    bool                    `json:"committed"`
	Rows         int                     `json:"rows"`
	CreatedCount int                     `json:"created_count"`
	Errors       []CatalogImportRowError `json:"errors,omitempty"`
}

type CatalogImportRecord struct {
	ID             string
	MerchantID     string
	IdempotencyKey string
	RequestHash    string
	Status         string
	Result         BulkMenuImportResult
}

// MenuGovernanceRepository owns canonical catalog projections, moderation,
// schedules, and atomic/idempotent import persistence.
type MenuGovernanceRepository interface {
	ListCategories(ctx context.Context, merchantID string) ([]*MenuCategory, error)
	CreateCategory(ctx context.Context, category *MenuCategory) error
	UpdateCategory(ctx context.Context, category *MenuCategory) error
	ReplaceImages(ctx context.Context, menuItemID, merchantID string, images []MenuItemImage) error
	ReplaceSchedules(ctx context.Context, menuItemID, merchantID string, schedules []MenuItemSchedule) error
	SetModerationStatus(ctx context.Context, menuItemID, status, actorID, actorRole, reason string) error
	StartCatalogImport(ctx context.Context, merchantID, idempotencyKey, requestHash string) (*CatalogImportRecord, bool, error)
	CompleteCatalogImport(ctx context.Context, importID, status string, result BulkMenuImportResult) error
	BulkImportMenu(ctx context.Context, merchantID, importID string, items []*MenuItem, categories []*MenuCategory, result BulkMenuImportResult) error
}

// MenuItemVariantOption — satu opsi dalam grup varian (harga delta IDR).
type MenuItemVariantOption struct {
	ID         string `json:"id"`
	VariantID  string `json:"variant_id"`
	Nama       string `json:"nama"`
	PriceDelta int64  `json:"price_delta"`
	IsDefault  bool   `json:"is_default"`
}
