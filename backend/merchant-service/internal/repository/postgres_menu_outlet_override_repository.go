package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"tembus/merchant-service/internal/domain"

	"github.com/google/uuid"
)

const menuOutletOverrideSelect = `
SELECT
  COALESCE(override.id::text, ''),
  item.merchant_id::text,
  item.id::text,
  branch.id::text,
  branch.code,
  branch.name,
  item.harga,
  COALESCE(override.price_idr, item.harga),
  override.price_idr,
  item.is_available,
  COALESCE(override.is_available, item.is_available),
  override.is_available,
  override.promo_id::text,
  COALESCE(override.version, 0),
  COALESCE(override.updated_by::text, ''),
  COALESCE(override.created_at, item.created_at),
  COALESCE(override.updated_at, item.updated_at)
FROM merchant_menu_items item
JOIN merchant_branches branch ON branch.id = item.branch_id
LEFT JOIN merchant_menu_item_outlet_overrides override
  ON override.menu_item_id = item.id AND override.branch_id = branch.id
WHERE item.merchant_id = $1
  AND ($2 = '' OR item.id = $2::uuid)
  AND ($3 = '' OR branch.id = $3::uuid)`

func scanMenuItemOutletOverride(row interface{ Scan(...any) error }) (*domain.MenuItemOutletOverride, error) {
	var item domain.MenuItemOutletOverride
	var id, promoID, updatedBy sql.NullString
	var priceIDR sql.NullInt64
	var overrideAvailable sql.NullBool
	if err := row.Scan(
		&id, &item.MerchantID, &item.MenuItemID, &item.BranchID,
		&item.BranchCode, &item.BranchName, &item.BasePriceIDR,
		&item.EffectivePriceIDR, &priceIDR, &item.BaseIsAvailable,
		&item.EffectiveIsAvailable, &overrideAvailable, &promoID, &item.Version,
		&updatedBy, &item.CreatedAt, &item.UpdatedAt,
	); err != nil {
		return nil, err
	}
	if id.Valid {
		item.ID = id.String
	}
	if priceIDR.Valid {
		value := priceIDR.Int64
		item.PriceIDR = &value
	}
	if overrideAvailable.Valid {
		value := overrideAvailable.Bool
		item.IsAvailable = &value
	}
	if promoID.Valid {
		item.PromoID = &promoID.String
	}
	if updatedBy.Valid {
		item.UpdatedBy = updatedBy.String
	}
	return &item, nil
}

func (r *postgresMenuItemRepository) ListMenuItemOutletOverrides(ctx context.Context, merchantID, menuItemID, branchID string) ([]*domain.MenuItemOutletOverride, error) {
	rows, err := r.readDB.QueryContext(ctx, menuOutletOverrideSelect+` ORDER BY item.kategori, item.nama`, merchantID, menuItemID, branchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.MenuItemOutletOverride, 0)
	for rows.Next() {
		item, scanErr := scanMenuItemOutletOverride(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *postgresMenuItemRepository) UpsertMenuItemOutletOverride(ctx context.Context, override *domain.MenuItemOutletOverride, idempotencyKey, requestFingerprint string) (*domain.MenuItemOutletOverride, bool, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = tx.Rollback() }()

	requestID := uuid.New().String()
	inserted, err := tx.ExecContext(ctx, `
		INSERT INTO merchant_menu_item_outlet_override_requests
			(id, merchant_id, idempotency_key, request_fingerprint)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (merchant_id, idempotency_key) DO NOTHING`,
		requestID, override.MerchantID, idempotencyKey, requestFingerprint)
	if err != nil {
		return nil, false, err
	}
	if affected, _ := inserted.RowsAffected(); affected == 0 {
		var existingFingerprint string
		var resultJSON []byte
		if err := tx.QueryRowContext(ctx, `
			SELECT request_fingerprint, result_json
			FROM merchant_menu_item_outlet_override_requests
			WHERE merchant_id = $1 AND idempotency_key = $2
			FOR UPDATE`, override.MerchantID, idempotencyKey).Scan(&existingFingerprint, &resultJSON); err != nil {
			return nil, false, err
		}
		if existingFingerprint != requestFingerprint {
			return nil, false, errors.New("idempotency key sudah dipakai untuk permintaan berbeda")
		}
		if len(resultJSON) == 0 {
			return nil, false, errors.New("permintaan idempotent masih diproses; coba lagi")
		}
		var replay domain.MenuItemOutletOverride
		if err := json.Unmarshal(resultJSON, &replay); err != nil {
			return nil, false, fmt.Errorf("decode idempotent outlet override: %w", err)
		}
		if err := tx.Commit(); err != nil {
			return nil, false, err
		}
		return &replay, true, nil
	}

	var itemMerchant string
	if err := tx.QueryRowContext(ctx, `
		SELECT merchant_id::text
		FROM merchant_menu_items WHERE id = $1 FOR UPDATE`, override.MenuItemID).
		Scan(&itemMerchant); err != nil {
		return nil, false, fmt.Errorf("menu item tidak ditemukan: %w", err)
	}
	if itemMerchant != override.MerchantID {
		return nil, false, errors.New("menu item bukan milik merchant")
	}
	var branchID string
	if err := tx.QueryRowContext(ctx, `SELECT id::text FROM merchant_branches WHERE id = $1 AND merchant_id = $2 FOR UPDATE`, override.BranchID, override.MerchantID).Scan(&branchID); err != nil {
		return nil, false, fmt.Errorf("outlet tidak ditemukan: %w", err)
	}

	var currentVersion sql.NullInt64
	if err := tx.QueryRowContext(ctx, `
		SELECT version FROM merchant_menu_item_outlet_overrides
		WHERE menu_item_id = $1 AND branch_id = $2 FOR UPDATE`, override.MenuItemID, override.BranchID).Scan(&currentVersion); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	if override.Version > 0 && (!currentVersion.Valid || currentVersion.Int64 != override.Version) {
		return nil, false, fmt.Errorf("override outlet berubah; muat ulang sebelum menyimpan (versi saat ini %d)", currentVersion.Int64)
	}

	priceIDR := any(nil)
	if override.PriceIDR != nil {
		priceIDR = *override.PriceIDR
	}
	available := any(nil)
	if override.IsAvailable != nil {
		available = *override.IsAvailable
	}
	promoID := any(nil)
	if override.PromoID != nil {
		promoID = *override.PromoID
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO merchant_menu_item_outlet_overrides
			(merchant_id, menu_item_id, branch_id, price_idr, is_available, promo_id, version, updated_by)
		VALUES ($1, $2, $3, $4::bigint, $5::boolean, $6::uuid, 1, $7)
		ON CONFLICT (menu_item_id, branch_id) DO UPDATE SET
			price_idr = EXCLUDED.price_idr,
			is_available = EXCLUDED.is_available,
			promo_id = EXCLUDED.promo_id,
			version = merchant_menu_item_outlet_overrides.version + 1,
			updated_by = EXCLUDED.updated_by,
			updated_at = NOW()`,
		override.MerchantID, override.MenuItemID, override.BranchID, priceIDR, available, promoID, override.UpdatedBy); err != nil {
		return nil, false, err
	}

	result, err := scanMenuItemOutletOverride(tx.QueryRowContext(ctx, menuOutletOverrideSelect+` AND item.id = $4::uuid`, override.MerchantID, "", override.BranchID, override.MenuItemID))
	if err != nil {
		return nil, false, err
	}
	payload, err := json.Marshal(result)
	if err != nil {
		return nil, false, err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE merchant_menu_item_outlet_override_requests
		SET override_id = $2, result_json = $3::jsonb, completed_at = NOW()
		WHERE id = $1`, requestID, result.ID, payload); err != nil {
		return nil, false, err
	}
	auditPayload, _ := json.Marshal(map[string]any{
		"merchant_id": override.MerchantID, "menu_item_id": override.MenuItemID,
		"branch_id": override.BranchID, "override_id": result.ID,
		"idempotency_key": idempotencyKey, "result": "success",
	})
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO audit_logs (actor_id, action, target_id, payload, merchant_id)
		VALUES ($1, 'merchant.menu_outlet_override.updated', $2, $3, $4)`,
		override.UpdatedBy, result.ID, string(auditPayload), override.MerchantID); err != nil {
		return nil, false, err
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	return result, false, nil
}

var _ domain.MenuItemOutletOverrideRepository = (*postgresMenuItemRepository)(nil)
