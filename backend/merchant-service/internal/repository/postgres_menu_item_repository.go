package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"tembus/merchant-service/internal/domain"

	"github.com/google/uuid"
)

// postgresMenuItemRepository — implementasi domain.MenuItemRepository.
type postgresMenuItemRepository struct {
	db     *sql.DB
	readDB *sql.DB
}

func NewPostgresMenuItemRepository(db, readDB *sql.DB) *postgresMenuItemRepository {
	return &postgresMenuItemRepository{db: db, readDB: readDB}
}

const menuItemColumns = `id, merchant_id, branch_id::text, nama, harga, foto, deskripsi, kategori, category_id::text,
	prep_time_minutes, is_available, status, moderation_status, moderation_reason, version,
	stock_quantity, daily_sales_limit, daily_sales_count, sales_limit_reset_at, created_at, updated_at`

func scanMenuItem(row interface{ Scan(...any) error }) (*domain.MenuItem, error) {
	var item domain.MenuItem
	var branchID, foto, deskripsi, categoryID, status, moderationStatus, moderationReason sql.NullString
	var stockQuantity, dailySalesLimit sql.NullInt64
	var salesResetAt sql.NullTime
	var version sql.NullInt64
	err := row.Scan(
		&item.ID, &item.MerchantID, &branchID, &item.Nama, &item.Harga, &foto, &deskripsi,
		&item.Kategori, &categoryID, &item.PrepTimeMinutes, &item.IsAvailable,
		&status, &moderationStatus, &moderationReason, &version,
		&stockQuantity, &dailySalesLimit, &item.DailySalesCount, &salesResetAt,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if foto.Valid {
		item.Foto = &foto.String
	}
	if branchID.Valid {
		item.BranchID = branchID.String
	}
	if deskripsi.Valid {
		item.Deskripsi = &deskripsi.String
	}
	if categoryID.Valid {
		item.CategoryID = &categoryID.String
	}
	if status.Valid {
		item.Status = status.String
	}
	if moderationStatus.Valid {
		item.ModerationStatus = moderationStatus.String
	}
	if moderationReason.Valid {
		item.ModerationReason = &moderationReason.String
	}
	if version.Valid {
		item.Version = version.Int64
	}
	if stockQuantity.Valid {
		value := int(stockQuantity.Int64)
		item.StockQuantity = &value
	}
	if dailySalesLimit.Valid {
		value := int(dailySalesLimit.Int64)
		item.DailySalesLimit = &value
	}
	if salesResetAt.Valid {
		item.SalesResetAt = &salesResetAt.Time
	}
	return &item, nil
}

func (r *postgresMenuItemRepository) Create(ctx context.Context, item *domain.MenuItem) error {
	var foto, deskripsi sql.NullString
	if item.Foto != nil {
		foto = sql.NullString{String: *item.Foto, Valid: true}
	}
	if item.Deskripsi != nil {
		deskripsi = sql.NullString{String: *item.Deskripsi, Valid: true}
	}
	status := item.Status
	if status == "" {
		status = domain.MenuItemStatusModerationPending
	}
	moderationStatus := item.ModerationStatus
	if moderationStatus == "" {
		moderationStatus = domain.MenuModerationPending
	}
	branchID := domain.MerchantAccessFromContext(ctx).BranchID
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO merchant_menu_items (id, merchant_id, branch_id, nama, harga, foto, deskripsi, kategori, category_id,
			prep_time_minutes, is_available, status, moderation_status, moderation_reason, version,
			stock_quantity, daily_sales_limit, daily_sales_count, sales_limit_reset_at)
		VALUES ($1, $2, NULLIF($3, '')::uuid, $4, $5, $6, $7, $8, $9::uuid, $10, $11, $12, $13, $14, 1, $15::int, $16::int, $17, $18::timestamptz)
		RETURNING created_at, updated_at`,
		item.ID, item.MerchantID, branchID, item.Nama, item.Harga, foto, deskripsi, item.Kategori, item.CategoryID,
		item.PrepTimeMinutes, item.IsAvailable, status, moderationStatus, item.ModerationReason,
		item.StockQuantity, item.DailySalesLimit, item.DailySalesCount, item.SalesResetAt,
	).Scan(&item.CreatedAt, &item.UpdatedAt)
	item.Status = status
	item.ModerationStatus = moderationStatus
	item.Version = 1
	return err
}

func (r *postgresMenuItemRepository) GetByID(ctx context.Context, id string) (*domain.MenuItem, error) {
	branchID := domain.MerchantAccessFromContext(ctx).BranchID
	query := `SELECT ` + menuItemColumns + ` FROM merchant_menu_items WHERE id = $1`
	args := []any{id}
	if branchID != "" {
		query += ` AND branch_id = $2`
		args = append(args, branchID)
	}
	row := r.readDB.QueryRowContext(ctx, query, args...)
	item, err := scanMenuItem(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return r.hydrateMenuItem(ctx, item)
}

func (r *postgresMenuItemRepository) ListByMerchant(ctx context.Context, merchantID string, limit, offset int) ([]*domain.MenuItem, error) {
	branchID := domain.MerchantAccessFromContext(ctx).BranchID
	query := `
		SELECT ` + menuItemColumns + ` FROM merchant_menu_items
		WHERE merchant_id = $1
	`
	args := []any{merchantID}
	if branchID != "" {
		query += ` AND branch_id = $2`
		args = append(args, branchID)
	}
	query += fmt.Sprintf(` ORDER BY kategori, nama LIMIT $%d OFFSET $%d`, len(args)+1, len(args)+2)
	args = append(args, limit, offset)
	rows, err := r.readDB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*domain.MenuItem{}
	for rows.Next() {
		item, err := scanMenuItem(rows)
		if err != nil {
			return nil, err
		}
		item, err = r.hydrateMenuItem(ctx, item)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *postgresMenuItemRepository) Update(ctx context.Context, item *domain.MenuItem) error {
	var foto, deskripsi sql.NullString
	if item.Foto != nil {
		foto = sql.NullString{String: *item.Foto, Valid: true}
	}
	if item.Deskripsi != nil {
		deskripsi = sql.NullString{String: *item.Deskripsi, Valid: true}
	}
	branchID := domain.MerchantAccessFromContext(ctx).BranchID
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchant_menu_items SET
			nama = COALESCE(NULLIF($3, ''), nama),
			harga = CASE WHEN $4 = 0 THEN harga ELSE $4 END,
			foto = CASE WHEN $5::text IS NULL THEN foto ELSE $5 END,
			deskripsi = CASE WHEN $6::text IS NULL THEN deskripsi ELSE $6 END,
			kategori = COALESCE(NULLIF($7, ''), kategori),
			category_id = $8::uuid,
			prep_time_minutes = CASE WHEN $9 = 0 THEN prep_time_minutes ELSE $9 END,
			is_available = COALESCE($10, is_available),
			status = COALESCE(NULLIF($11, ''), status),
			stock_quantity = $12::int,
			daily_sales_limit = $13::int,
			daily_sales_count = $14,
			sales_limit_reset_at = $15::timestamptz,
			version = version + 1,
			updated_at = NOW()
		WHERE id = $1 AND merchant_id = $2 AND ($16 = '' OR branch_id = NULLIF($16, '')::uuid)`,
		item.ID, item.MerchantID, item.Nama, item.Harga, foto, deskripsi, item.Kategori, item.CategoryID,
		item.PrepTimeMinutes, item.IsAvailable, item.Status, item.StockQuantity, item.DailySalesLimit,
		item.DailySalesCount, item.SalesResetAt, branchID,
	)
	return err
}

func (r *postgresMenuItemRepository) SetAvailability(ctx context.Context, id, merchantID string, available bool) error {
	branchID := domain.MerchantAccessFromContext(ctx).BranchID
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchant_menu_items SET status = CASE WHEN $3 THEN 'active' ELSE 'sold_out' END,
			version = version + 1, updated_at = NOW()
		WHERE id = $1 AND merchant_id = $2 AND ($4 = '' OR branch_id = NULLIF($4, '')::uuid)`, id, merchantID, available, branchID)
	return err
}

func (r *postgresMenuItemRepository) UpdateInventory(ctx context.Context, id, merchantID string, stockQuantity *int, dailySalesLimit *int, resetAt *time.Time) error {
	branchID := domain.MerchantAccessFromContext(ctx).BranchID
	result, err := r.db.ExecContext(ctx, `
		UPDATE merchant_menu_items SET
			stock_quantity = $3::int,
			daily_sales_limit = $4::int,
			daily_sales_count = CASE WHEN $4::int IS NULL THEN 0 ELSE LEAST(daily_sales_count, $4::int) END,
			sales_limit_reset_at = $5::timestamptz,
			is_available = CASE WHEN $3::int = 0 THEN FALSE ELSE is_available END,
			version = version + 1,
			updated_at = NOW()
		WHERE id = $1 AND merchant_id = $2 AND ($6 = '' OR branch_id = NULLIF($6, '')::uuid)`, id, merchantID, stockQuantity, dailySalesLimit, resetAt, branchID)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected != 1 {
		return fmt.Errorf("menu item tidak ditemukan")
	}
	return nil
}

func (r *postgresMenuItemRepository) Delete(ctx context.Context, id, merchantID string) error {
	branchID := domain.MerchantAccessFromContext(ctx).BranchID
	res, err := r.db.ExecContext(ctx, `
		DELETE FROM merchant_menu_items WHERE id = $1 AND merchant_id = $2 AND ($3 = '' OR branch_id = NULLIF($3, '')::uuid)`, id, merchantID, branchID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("menu item tidak ditemukan")
	}
	return nil
}

func (r *postgresMenuItemRepository) CountByMerchant(ctx context.Context, merchantID string) (int, error) {
	branchID := domain.MerchantAccessFromContext(ctx).BranchID
	var n int
	err := r.readDB.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM merchant_menu_items WHERE merchant_id = $1 AND ($2 = '' OR branch_id = NULLIF($2, '')::uuid)`, merchantID, branchID).Scan(&n)
	return n, err
}

// ── FB-108: varian menu ──────────────────────────────────────────────────

// GetVariantsByMenuItem — grup varian + opsi milik menu item (dengan
// validasi kepemilikan merchant: menu item harus milik merchantID).
func (r *postgresMenuItemRepository) GetVariantsByMenuItem(ctx context.Context, menuItemID, merchantID string) ([]*domain.MenuItemVariant, error) {
	// Validasi kepemilikan dulu — menu item harus milik merchant ini.
	var owner string
	branchID := domain.MerchantAccessFromContext(ctx).BranchID
	err := r.readDB.QueryRowContext(ctx,
		`SELECT merchant_id::text FROM merchant_menu_items WHERE id = $1 AND ($2 = '' OR branch_id = NULLIF($2, '')::uuid)`, menuItemID, branchID).Scan(&owner)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("menu item tidak ditemukan")
		}
		return nil, err
	}
	if owner != merchantID {
		return nil, fmt.Errorf("menu item bukan milik merchant ini")
	}

	rows, err := r.readDB.QueryContext(ctx, `
		SELECT id::text, menu_item_id::text, nama, kind, status, is_required, min_select, max_select
		FROM menu_item_variants
		WHERE menu_item_id = $1 AND status = 'active'
		ORDER BY sort_order ASC, created_at ASC`, menuItemID)
	if err != nil {
		return nil, fmt.Errorf("query menu_item_variants: %w", err)
	}
	defer rows.Close()

	var variants []*domain.MenuItemVariant
	var variantIDs []string
	for rows.Next() {
		v := &domain.MenuItemVariant{}
		if err := rows.Scan(&v.ID, &v.MenuItemID, &v.Nama, &v.Kind, &v.Status, &v.IsRequired, &v.MinSelect, &v.MaxSelect); err != nil {
			return nil, err
		}
		v.Options = []domain.MenuItemVariantOption{}
		variants = append(variants, v)
		variantIDs = append(variantIDs, v.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(variants) == 0 {
		return []*domain.MenuItemVariant{}, nil
	}

	// Ambil semua opsi sekaligus
	placeholders := make([]string, len(variantIDs))
	args := make([]any, len(variantIDs))
	for i, id := range variantIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}
	optRows, err := r.readDB.QueryContext(ctx, fmt.Sprintf(`
		SELECT id::text, variant_id::text, nama, price_delta, is_default
		FROM menu_item_variant_options
		WHERE variant_id IN (%s)
		ORDER BY created_at ASC`, strings.Join(placeholders, ", ")), args...)
	if err != nil {
		return nil, fmt.Errorf("query menu_item_variant_options: %w", err)
	}
	defer optRows.Close()

	byVariant := make(map[string][]domain.MenuItemVariantOption)
	for optRows.Next() {
		var o domain.MenuItemVariantOption
		if err := optRows.Scan(&o.ID, &o.VariantID, &o.Nama, &o.PriceDelta, &o.IsDefault); err != nil {
			return nil, err
		}
		byVariant[o.VariantID] = append(byVariant[o.VariantID], o)
	}
	if err := optRows.Err(); err != nil {
		return nil, err
	}
	for _, v := range variants {
		v.Options = byVariant[v.ID]
	}
	return variants, nil
}

// ReplaceVariants — replace semua varian menu item dalam SATU transaksi:
// validasi kepemilikan → DELETE lama (CASCADE hapus opsi) → INSERT baru.
func (r *postgresMenuItemRepository) ReplaceVariants(ctx context.Context, menuItemID, merchantID string, variants []*domain.MenuItemVariant) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var owner string
	branchID := domain.MerchantAccessFromContext(ctx).BranchID
	err = tx.QueryRowContext(ctx,
		`SELECT merchant_id::text FROM merchant_menu_items WHERE id = $1 AND ($2 = '' OR branch_id = NULLIF($2, '')::uuid) FOR UPDATE`, menuItemID, branchID).Scan(&owner)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("menu item tidak ditemukan")
		}
		return err
	}
	if owner != merchantID {
		return fmt.Errorf("menu item bukan milik merchant ini")
	}

	if _, err := tx.ExecContext(ctx,
		`DELETE FROM menu_item_variants WHERE menu_item_id = $1`, menuItemID); err != nil {
		return fmt.Errorf("delete variants lama: %w", err)
	}

	for gi, v := range variants {
		if v.Nama == "" {
			return fmt.Errorf("nama varian tidak boleh kosong")
		}
		if len(v.Options) == 0 {
			return fmt.Errorf("varian %q minimal punya 1 opsi", v.Nama)
		}
		var variantID string
		if err := tx.QueryRowContext(ctx, `
			INSERT INTO menu_item_variants (menu_item_id, nama, kind, status, is_required, min_select, max_select, sort_order)
			VALUES ($1, $2, $3, 'active', $4, $5, $6, $7) RETURNING id::text`,
			menuItemID, v.Nama, normalizeVariantKind(v.Kind), v.IsRequired, v.MinSelect, v.MaxSelect, gi,
		).Scan(&variantID); err != nil {
			return fmt.Errorf("insert variant %q: %w", v.Nama, err)
		}
		for _, o := range v.Options {
			if o.Nama == "" {
				return fmt.Errorf("nama opsi tidak boleh kosong")
			}
			if o.PriceDelta < 0 {
				return fmt.Errorf("price_delta tidak boleh negatif")
			}
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO menu_item_variant_options (variant_id, nama, price_delta, is_default)
				VALUES ($1, $2, $3, $4)`,
				variantID, o.Nama, o.PriceDelta, o.IsDefault,
			); err != nil {
				return fmt.Errorf("insert option %q: %w", o.Nama, err)
			}
		}
	}

	return tx.Commit()
}

func normalizeVariantKind(kind string) string {
	if kind == domain.MenuVariantKindModifier {
		return domain.MenuVariantKindModifier
	}
	return domain.MenuVariantKindVariant
}

func (r *postgresMenuItemRepository) listImages(ctx context.Context, menuItemID, merchantID string) ([]domain.MenuItemImage, error) {
	branchID := domain.MerchantAccessFromContext(ctx).BranchID
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT image.id::text, image.menu_item_id::text, image.url, image.alt_text,
		       image.sort_order, image.is_primary, image.created_at
		FROM merchant_menu_item_images image
		JOIN merchant_menu_items item ON item.id = image.menu_item_id
		WHERE image.menu_item_id = $1 AND item.merchant_id = $2
		  AND ($3 = '' OR item.branch_id = NULLIF($3, '')::uuid)
		ORDER BY image.sort_order, image.created_at`, menuItemID, merchantID, branchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	images := make([]domain.MenuItemImage, 0)
	for rows.Next() {
		var image domain.MenuItemImage
		if err := rows.Scan(&image.ID, &image.MenuItemID, &image.URL, &image.AltText,
			&image.SortOrder, &image.IsPrimary, &image.CreatedAt); err != nil {
			return nil, err
		}
		images = append(images, image)
	}
	return images, rows.Err()
}

func (r *postgresMenuItemRepository) listSchedules(ctx context.Context, menuItemID, merchantID string) ([]domain.MenuItemSchedule, error) {
	branchID := domain.MerchantAccessFromContext(ctx).BranchID
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT schedule.id::text, schedule.menu_item_id::text, schedule.weekday,
		       TO_CHAR(schedule.starts_at, 'HH24:MI'), TO_CHAR(schedule.ends_at, 'HH24:MI'), schedule.is_active
		FROM merchant_menu_item_schedules schedule
		JOIN merchant_menu_items item ON item.id = schedule.menu_item_id
		WHERE schedule.menu_item_id = $1 AND item.merchant_id = $2
		  AND ($3 = '' OR item.branch_id = NULLIF($3, '')::uuid)
		ORDER BY schedule.weekday, schedule.starts_at`, menuItemID, merchantID, branchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	schedules := make([]domain.MenuItemSchedule, 0)
	for rows.Next() {
		var schedule domain.MenuItemSchedule
		if err := rows.Scan(&schedule.ID, &schedule.MenuItemID, &schedule.Weekday,
			&schedule.StartsAt, &schedule.EndsAt, &schedule.IsActive); err != nil {
			return nil, err
		}
		schedules = append(schedules, schedule)
	}
	return schedules, rows.Err()
}

func (r *postgresMenuItemRepository) hydrateMenuItem(ctx context.Context, item *domain.MenuItem) (*domain.MenuItem, error) {
	if item == nil {
		return nil, nil
	}
	images, err := r.listImages(ctx, item.ID, item.MerchantID)
	if err != nil {
		return nil, err
	}
	schedules, err := r.listSchedules(ctx, item.ID, item.MerchantID)
	if err != nil {
		return nil, err
	}
	item.Images = images
	item.Schedules = schedules
	return item, nil
}

func (r *postgresMenuItemRepository) ListCategories(ctx context.Context, merchantID string) ([]*domain.MenuCategory, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT id::text, merchant_id::text, name, slug, sort_order, status, version, created_at, updated_at
		FROM merchant_menu_categories
		WHERE merchant_id = $1
		ORDER BY sort_order, name`, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	categories := make([]*domain.MenuCategory, 0)
	for rows.Next() {
		category := &domain.MenuCategory{}
		if err := rows.Scan(&category.ID, &category.MerchantID, &category.Name, &category.Slug,
			&category.SortOrder, &category.Status, &category.Version, &category.CreatedAt, &category.UpdatedAt); err != nil {
			return nil, err
		}
		categories = append(categories, category)
	}
	return categories, rows.Err()
}

func (r *postgresMenuItemRepository) CreateCategory(ctx context.Context, category *domain.MenuCategory) error {
	return r.db.QueryRowContext(ctx, `
		INSERT INTO merchant_menu_categories (id, merchant_id, name, slug, sort_order)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING version, created_at, updated_at`, category.ID, category.MerchantID, category.Name,
		category.Slug, category.SortOrder).Scan(&category.Version, &category.CreatedAt, &category.UpdatedAt)
}

func (r *postgresMenuItemRepository) UpdateCategory(ctx context.Context, category *domain.MenuCategory) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE merchant_menu_categories
		SET name = COALESCE(NULLIF($3, ''), name),
		    slug = COALESCE(NULLIF($4, ''), slug),
		    sort_order = COALESCE($5, sort_order),
		    status = COALESCE(NULLIF($6, ''), status),
		    version = version + 1,
		    updated_at = NOW()
		WHERE id = $1 AND merchant_id = $2`, category.ID, category.MerchantID, category.Name,
		category.Slug, category.SortOrder, category.Status)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected != 1 {
		return fmt.Errorf("kategori tidak ditemukan")
	}
	return r.db.QueryRowContext(ctx, `
		SELECT name, slug, sort_order, status, version, created_at, updated_at
		FROM merchant_menu_categories WHERE id = $1 AND merchant_id = $2`, category.ID, category.MerchantID).
		Scan(&category.Name, &category.Slug, &category.SortOrder, &category.Status, &category.Version,
			&category.CreatedAt, &category.UpdatedAt)
}

func (r *postgresMenuItemRepository) ReplaceImages(ctx context.Context, menuItemID, merchantID string, images []domain.MenuItemImage) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	var exists bool
	branchID := domain.MerchantAccessFromContext(ctx).BranchID
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM merchant_menu_items WHERE id = $1 AND merchant_id = $2 AND ($3 = '' OR branch_id = NULLIF($3, '')::uuid))`, menuItemID, merchantID, branchID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("menu item tidak ditemukan")
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM merchant_menu_item_images WHERE menu_item_id = $1`, menuItemID); err != nil {
		return err
	}
	for _, image := range images {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO merchant_menu_item_images (id, menu_item_id, url, alt_text, sort_order, is_primary)
			VALUES ($1, $2, $3, $4, $5, $6)`, uuidOrNew(image.ID), menuItemID, image.URL,
			image.AltText, image.SortOrder, image.IsPrimary); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *postgresMenuItemRepository) ReplaceSchedules(ctx context.Context, menuItemID, merchantID string, schedules []domain.MenuItemSchedule) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	var exists bool
	branchID := domain.MerchantAccessFromContext(ctx).BranchID
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM merchant_menu_items WHERE id = $1 AND merchant_id = $2 AND ($3 = '' OR branch_id = NULLIF($3, '')::uuid))`, menuItemID, merchantID, branchID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("menu item tidak ditemukan")
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM merchant_menu_item_schedules WHERE menu_item_id = $1`, menuItemID); err != nil {
		return err
	}
	for _, schedule := range schedules {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO merchant_menu_item_schedules (id, menu_item_id, weekday, starts_at, ends_at, is_active)
			VALUES ($1, $2, $3, $4::time, $5::time, $6)`, uuidOrNew(schedule.ID), menuItemID,
			schedule.Weekday, schedule.StartsAt, schedule.EndsAt, schedule.IsActive); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *postgresMenuItemRepository) SetModerationStatus(ctx context.Context, menuItemID, status, actorID, actorRole, reason string) error {
	moderationStatus := domain.MenuModerationRejected
	itemStatus := domain.MenuItemStatusRejected
	if status == domain.MenuModerationApproved {
		moderationStatus = domain.MenuModerationApproved
		itemStatus = domain.MenuItemStatusActive
	}
	result, err := r.db.ExecContext(ctx, `
		UPDATE merchant_menu_items
		SET moderation_status = $2::text,
		    moderation_reason = NULLIF($3, ''),
		    moderated_by = $4::uuid,
		    moderated_at = NOW(),
		    status = CASE WHEN $2::text = 'approved' AND stock_quantity = 0 THEN 'sold_out' ELSE $5::text END,
		    version = version + 1,
		    updated_at = NOW()
		WHERE id = $1 AND moderation_status = 'pending'`, menuItemID, moderationStatus, reason, actorID, itemStatus)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected != 1 {
		return fmt.Errorf("menu item tidak ditemukan atau sudah dimoderasi")
	}
	_ = actorRole // retained in the handler/audit context; row stores actor identity.
	return nil
}

func uuidOrNew(value string) string {
	if value == "" {
		return uuid.New().String()
	}
	return value
}

func scanCatalogImport(row interface{ Scan(...any) error }) (*domain.CatalogImportRecord, error) {
	record := &domain.CatalogImportRecord{}
	var resultJSON []byte
	if err := row.Scan(&record.ID, &record.MerchantID, &record.IdempotencyKey, &record.RequestHash,
		&record.Status, &resultJSON); err != nil {
		return nil, err
	}
	if len(resultJSON) > 0 {
		if err := json.Unmarshal(resultJSON, &record.Result); err != nil {
			return nil, fmt.Errorf("decode catalog import result: %w", err)
		}
	}
	return record, nil
}

func (r *postgresMenuItemRepository) StartCatalogImport(ctx context.Context, merchantID, idempotencyKey, requestHash string) (*domain.CatalogImportRecord, bool, error) {
	row := r.db.QueryRowContext(ctx, `
		INSERT INTO merchant_catalog_imports (merchant_id, idempotency_key, request_hash)
		VALUES ($1, $2, $3)
		ON CONFLICT (merchant_id, idempotency_key) DO NOTHING
		RETURNING id::text, merchant_id::text, idempotency_key, request_hash, status, result`,
		merchantID, idempotencyKey, requestHash)
	record, err := scanCatalogImport(row)
	if err == nil {
		return record, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	record, err = scanCatalogImport(r.db.QueryRowContext(ctx, `
		SELECT id::text, merchant_id::text, idempotency_key, request_hash, status, result
		FROM merchant_catalog_imports
		WHERE merchant_id = $1 AND idempotency_key = $2`, merchantID, idempotencyKey))
	if err != nil {
		return nil, false, err
	}
	return record, false, nil
}

func (r *postgresMenuItemRepository) CompleteCatalogImport(ctx context.Context, importID, status string, result domain.BulkMenuImportResult) error {
	payload, err := json.Marshal(result)
	if err != nil {
		return err
	}
	res, err := r.db.ExecContext(ctx, `
		UPDATE merchant_catalog_imports
		SET status = $2, result = $3::jsonb, completed_at = NOW()
		WHERE id = $1`, importID, status, payload)
	if err != nil {
		return err
	}
	if affected, _ := res.RowsAffected(); affected != 1 {
		return fmt.Errorf("catalog import tidak ditemukan")
	}
	return nil
}

func (r *postgresMenuItemRepository) BulkImportMenu(ctx context.Context, merchantID, importID string, items []*domain.MenuItem, categories []*domain.MenuCategory, result domain.BulkMenuImportResult) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var importMerchant, importStatus string
	if err := tx.QueryRowContext(ctx, `
		SELECT merchant_id::text, status FROM merchant_catalog_imports WHERE id = $1 FOR UPDATE`, importID).
		Scan(&importMerchant, &importStatus); err != nil {
		return err
	}
	if importMerchant != merchantID || importStatus != "processing" {
		return fmt.Errorf("catalog import tidak dalam status processing")
	}
	branchID := domain.MerchantAccessFromContext(ctx).BranchID

	for _, category := range categories {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO merchant_menu_categories (id, merchant_id, name, slug, sort_order)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (merchant_id, slug) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
			category.ID, merchantID, category.Name, category.Slug, category.SortOrder); err != nil {
			return fmt.Errorf("insert kategori %q: %w", category.Name, err)
		}
	}

	for _, item := range items {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO merchant_menu_items (
				id, merchant_id, branch_id, nama, harga, foto, deskripsi, kategori, category_id,
				prep_time_minutes, is_available, status, moderation_status, version,
				stock_quantity, daily_sales_limit, daily_sales_count, sales_limit_reset_at
			) VALUES ($1, $2, NULLIF($3, '')::uuid, $4, $5, $6, $7, $8, $9::uuid, $10, FALSE, 'moderation_pending', 'pending', 1, $11::int, $12::int, 0, $13::timestamptz)`,
			item.ID, merchantID, branchID, item.Nama, item.Harga, item.Foto, item.Deskripsi, item.Kategori,
			item.CategoryID, item.PrepTimeMinutes, item.StockQuantity, item.DailySalesLimit, item.SalesResetAt); err != nil {
			return fmt.Errorf("insert menu %q: %w", item.Nama, err)
		}
		for _, image := range item.Images {
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO merchant_menu_item_images (id, menu_item_id, url, alt_text, sort_order, is_primary)
				VALUES ($1, $2, $3, $4, $5, $6)`, uuidOrNew(image.ID), item.ID, image.URL, image.AltText,
				image.SortOrder, image.IsPrimary); err != nil {
				return fmt.Errorf("insert gambar menu %q: %w", item.Nama, err)
			}
		}
		for _, schedule := range item.Schedules {
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO merchant_menu_item_schedules (id, menu_item_id, weekday, starts_at, ends_at, is_active)
				VALUES ($1, $2, $3, $4::time, $5::time, $6)`, uuidOrNew(schedule.ID), item.ID,
				schedule.Weekday, schedule.StartsAt, schedule.EndsAt, schedule.IsActive); err != nil {
				return fmt.Errorf("insert jadwal menu %q: %w", item.Nama, err)
			}
		}
	}

	payload, err := json.Marshal(result)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE merchant_catalog_imports
		SET status = 'completed', result = $2::jsonb, completed_at = NOW()
		WHERE id = $1`, importID, payload); err != nil {
		return err
	}
	return tx.Commit()
}

func scanCatalogPublication(row interface{ Scan(...any) error }) (*domain.CatalogPublication, error) {
	publication := &domain.CatalogPublication{}
	var sourceID sql.NullString
	var createdAt time.Time
	if err := row.Scan(
		&publication.ID, &publication.MerchantID, &publication.PublicationVersion,
		&publication.CatalogVersion, &publication.ItemCount, &createdAt, &sourceID,
	); err != nil {
		return nil, err
	}
	publication.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	if sourceID.Valid {
		publication.SourcePublicationID = &sourceID.String
	}
	return publication, nil
}

const catalogReadinessQuery = `
SELECT
  COALESCE((SELECT version FROM merchant_catalog_versions WHERE merchant_id = $1), 0),
  COUNT(*) FILTER (WHERE item.status NOT IN ('draft', 'moderation_pending', 'rejected', 'archived') AND item.moderation_status = 'approved' AND item.harga > 0 AND BTRIM(item.nama) <> '' AND BTRIM(COALESCE(item.kategori, '')) <> '' AND item.prep_time_minutes BETWEEN 1 AND 180),
  COUNT(*) FILTER (WHERE item.moderation_status = 'pending' OR item.status = 'moderation_pending'),
  COUNT(*) FILTER (WHERE item.moderation_status = 'approved' AND (item.harga <= 0 OR BTRIM(item.nama) = '' OR BTRIM(COALESCE(item.kategori, '')) = '' OR item.prep_time_minutes NOT BETWEEN 1 AND 180))
FROM merchant_menu_items item
WHERE item.merchant_id = $1`

func (r *postgresMenuItemRepository) getCatalogReadinessRow(ctx context.Context, queryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, merchantID string) (*domain.CatalogReadiness, error) {
	readiness := &domain.CatalogReadiness{}
	var pending, invalid int
	if err := queryer.QueryRowContext(ctx, catalogReadinessQuery, merchantID).Scan(
		&readiness.CatalogVersion, &readiness.ItemCount, &pending, &invalid,
	); err != nil {
		return nil, err
	}
	if readiness.ItemCount == 0 {
		readiness.BlockingReasons = append(readiness.BlockingReasons, "Tambahkan minimal satu menu yang siap dijual")
	}
	if pending > 0 {
		readiness.BlockingReasons = append(readiness.BlockingReasons, fmt.Sprintf("%d menu masih menunggu pemeriksaan", pending))
	}
	if invalid > 0 {
		readiness.BlockingReasons = append(readiness.BlockingReasons, fmt.Sprintf("%d menu memiliki data nama, kategori, harga, atau waktu persiapan yang belum valid", invalid))
	}
	readiness.Ready = len(readiness.BlockingReasons) == 0
	var publishedVersion, publishedCatalogVersion sql.NullInt64
	if err := queryer.QueryRowContext(ctx, `
		SELECT publication_version, catalog_version
		FROM merchant_catalog_publications
		WHERE merchant_id = $1
		ORDER BY publication_version DESC
		LIMIT 1`, merchantID).Scan(&publishedVersion, &publishedCatalogVersion); err == nil {
		readiness.PublishedVersion = &publishedVersion.Int64
		readiness.PublishedCatalogVersion = &publishedCatalogVersion.Int64
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	return readiness, nil
}

func (r *postgresMenuItemRepository) GetCatalogReadiness(ctx context.Context, merchantID string) (*domain.CatalogReadiness, error) {
	return r.getCatalogReadinessRow(ctx, r.readDB, merchantID)
}

func (r *postgresMenuItemRepository) ListCatalogPublications(ctx context.Context, merchantID string, limit int) ([]*domain.CatalogPublication, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT id::text, merchant_id::text, publication_version, catalog_version,
		       item_count, created_at, source_publication_id::text
		FROM merchant_catalog_publications
		WHERE merchant_id = $1
		ORDER BY publication_version DESC
		LIMIT $2`, merchantID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	publications := make([]*domain.CatalogPublication, 0)
	for rows.Next() {
		publication, err := scanCatalogPublication(rows)
		if err != nil {
			return nil, err
		}
		publications = append(publications, publication)
	}
	return publications, rows.Err()
}

const publicationItemSnapshotSelect = `
SELECT item.id, item.merchant_id, item.nama, item.harga, item.foto, item.deskripsi,
       item.kategori, item.prep_time_minutes,
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'id', image.id, 'menu_item_id', image.menu_item_id, 'url', image.url,
         'alt_text', image.alt_text, 'sort_order', image.sort_order,
         'is_primary', image.is_primary
       ) ORDER BY image.sort_order, image.created_at)
       FROM merchant_menu_item_images image WHERE image.menu_item_id = item.id), '[]'::jsonb),
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'id', variant.id, 'menu_item_id', variant.menu_item_id, 'nama', variant.nama,
         'kind', COALESCE(variant.kind, 'variant'), 'status', COALESCE(variant.status, 'active'),
         'is_required', variant.is_required, 'min_select', variant.min_select,
         'max_select', variant.max_select, 'sort_order', variant.sort_order,
         'options', COALESCE((SELECT jsonb_agg(jsonb_build_object(
           'id', option.id, 'variant_id', option.variant_id, 'nama', option.nama,
           'price_delta', option.price_delta, 'is_default', option.is_default
         ) ORDER BY option.created_at)
         FROM menu_item_variant_options option WHERE option.variant_id = variant.id), '[]'::jsonb)
       ) ORDER BY variant.sort_order, variant.created_at)
       FROM menu_item_variants variant WHERE variant.menu_item_id = item.id AND COALESCE(variant.status, 'active') = 'active'), '[]'::jsonb)
FROM merchant_menu_items item
WHERE item.merchant_id = $1
  AND item.status NOT IN ('draft', 'moderation_pending', 'rejected', 'archived')
  AND item.moderation_status = 'approved'`

func (r *postgresMenuItemRepository) PublishCatalog(ctx context.Context, merchantID, actorID, idempotencyKey string, expectedCatalogVersion *int64) (*domain.CatalogPublication, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	var existing *domain.CatalogPublication
	existing, err = scanCatalogPublication(tx.QueryRowContext(ctx, `
		SELECT id::text, merchant_id::text, publication_version, catalog_version,
		       item_count, created_at, source_publication_id::text
		FROM merchant_catalog_publications
		WHERE merchant_id = $1 AND idempotency_key = $2`, merchantID, idempotencyKey))
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO merchant_catalog_versions (merchant_id, version)
		VALUES ($1, 0)
		ON CONFLICT (merchant_id) DO NOTHING`, merchantID); err != nil {
		return nil, err
	}
	var catalogVersion int64
	if err := tx.QueryRowContext(ctx, `SELECT version FROM merchant_catalog_versions WHERE merchant_id = $1 FOR UPDATE`, merchantID).Scan(&catalogVersion); err != nil {
		return nil, err
	}
	if expectedCatalogVersion != nil && *expectedCatalogVersion != catalogVersion {
		return nil, fmt.Errorf("katalog berubah sejak halaman dibuka; muat ulang sebelum mempublikasikan (versi saat ini %d)", catalogVersion)
	}
	readiness, err := r.getCatalogReadinessRow(ctx, tx, merchantID)
	if err != nil {
		return nil, err
	}
	if !readiness.Ready {
		return nil, fmt.Errorf("katalog belum siap dipublikasikan: %s", strings.Join(readiness.BlockingReasons, "; "))
	}

	var nextPublicationVersion int64
	if err := tx.QueryRowContext(ctx, `
		SELECT COALESCE(MAX(publication_version), 0) + 1
		FROM merchant_catalog_publications
		WHERE merchant_id = $1`, merchantID).Scan(&nextPublicationVersion); err != nil {
		return nil, err
	}
	var publication *domain.CatalogPublication
	publication, err = scanCatalogPublication(tx.QueryRowContext(ctx, `
		INSERT INTO merchant_catalog_publications (
			merchant_id, publication_version, catalog_version, published_by,
			idempotency_key, item_count
		)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id::text, merchant_id::text, publication_version, catalog_version,
		          item_count, created_at, source_publication_id::text`,
		merchantID, nextPublicationVersion, catalogVersion, actorID, idempotencyKey, readiness.ItemCount))
	if err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO merchant_catalog_publication_items (
			publication_id, menu_item_id, merchant_id, nama, harga, foto, deskripsi,
			kategori, prep_time_minutes, images, variants
		)
		`+strings.Replace(publicationItemSnapshotSelect, "SELECT item.id, item.merchant_id,", "SELECT $2::uuid, item.id, item.merchant_id,", 1),
		merchantID, publication.ID); err != nil {
		return nil, fmt.Errorf("snapshot katalog: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return publication, nil
}

func (r *postgresMenuItemRepository) RollbackCatalog(ctx context.Context, merchantID, actorID, idempotencyKey string, targetPublicationVersion int64) (*domain.CatalogPublication, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	if existing, existingErr := scanCatalogPublication(tx.QueryRowContext(ctx, `
		SELECT id::text, merchant_id::text, publication_version, catalog_version,
		       item_count, created_at, source_publication_id::text
		FROM merchant_catalog_publications
		WHERE merchant_id = $1 AND idempotency_key = $2`, merchantID, idempotencyKey)); existingErr == nil {
		return existing, nil
	} else if !errors.Is(existingErr, sql.ErrNoRows) {
		return nil, existingErr
	}
	var targetID string
	var targetCatalogVersion int64
	var targetItemCount int
	if err := tx.QueryRowContext(ctx, `
		SELECT id::text, catalog_version, item_count
		FROM merchant_catalog_publications
		WHERE merchant_id = $1 AND publication_version = $2`, merchantID, targetPublicationVersion).
		Scan(&targetID, &targetCatalogVersion, &targetItemCount); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("versi publikasi %d tidak ditemukan", targetPublicationVersion)
		}
		return nil, err
	}
	var nextPublicationVersion int64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(publication_version), 0) + 1 FROM merchant_catalog_publications WHERE merchant_id = $1`, merchantID).Scan(&nextPublicationVersion); err != nil {
		return nil, err
	}
	publication, err := scanCatalogPublication(tx.QueryRowContext(ctx, `
		INSERT INTO merchant_catalog_publications (
			merchant_id, publication_version, catalog_version, published_by,
			source_publication_id, idempotency_key, item_count
		)
		VALUES ($1, $2, $3, $4, $5::uuid, $6, $7)
		RETURNING id::text, merchant_id::text, publication_version, catalog_version,
		          item_count, created_at, source_publication_id::text`,
		merchantID, nextPublicationVersion, targetCatalogVersion, actorID, targetID, idempotencyKey, targetItemCount))
	if err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO merchant_catalog_publication_items (
			publication_id, menu_item_id, merchant_id, nama, harga, foto, deskripsi,
			kategori, prep_time_minutes, images, variants
		)
		SELECT $1::uuid, menu_item_id, merchant_id, nama, harga, foto, deskripsi,
		       kategori, prep_time_minutes, images, variants
		FROM merchant_catalog_publication_items
		WHERE publication_id = $2::uuid`, publication.ID, targetID); err != nil {
		return nil, fmt.Errorf("copy snapshot rollback: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return publication, nil
}
