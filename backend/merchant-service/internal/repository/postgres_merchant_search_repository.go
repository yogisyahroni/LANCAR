package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"tembus/merchant-service/internal/domain"
)

type postgresMerchantSearchRepository struct {
	readDB *sql.DB
}

func NewPostgresMerchantSearchRepository(readDB *sql.DB) domain.MerchantSearchRepository {
	return &postgresMerchantSearchRepository{readDB: readDB}
}

func (r *postgresMerchantSearchRepository) Search(ctx context.Context, scope domain.MerchantSearchScope, query string, limit int) ([]domain.MerchantSearchResult, error) {
	if r.readDB == nil {
		return nil, fmt.Errorf("merchant search database is not configured")
	}
	if limit < 1 || limit > 20 {
		limit = 10
	}
	needle := "%" + strings.ToLower(query) + "%"
	// Orders do not yet carry outlet_id in the canonical orders table. They are
	// therefore scoped by merchant only until the order/outlet contract lands in
	// the multi-outlet task; menu, staff and outlet hits are branch-scoped now.
	queries := []struct {
		kind  string
		query string
		args  []any
	}{
		{
			kind: "menu",
			query: `
				SELECT 'menu', id::text, nama,
				       COALESCE(NULLIF(kategori, ''), 'Menu'),
				       '/menu?item=' || id::text
				FROM merchant_menu_items
				WHERE merchant_id = $1 AND branch_id = $2
				  AND (LOWER(nama) LIKE $3 OR LOWER(COALESCE(kategori, '')) LIKE $3)
				ORDER BY nama
				LIMIT $4`,
			args: []any{scope.MerchantID, scope.BranchID, needle, limit},
		},
	}
	if scope.IncludeOutlets {
		queries = append(queries, struct {
			kind  string
			query string
			args  []any
		}{
			kind: "outlet",
			query: `
				SELECT 'outlet', id::text, name, code, '/pengaturan'
				FROM merchant_branches
				WHERE merchant_id = $1 AND is_active = TRUE
				  AND (LOWER(name) LIKE $2 OR LOWER(code) LIKE $2 OR LOWER(address) LIKE $2)
				ORDER BY name
				LIMIT $3`,
			args: []any{scope.MerchantID, needle, limit},
		})
	}
	if scope.IncludeOrders {
		queries = append(queries, struct {
			kind  string
			query string
			args  []any
		}{
			kind: "order",
			query: `
				SELECT 'order', id::text, order_number, status,
				       '/pesanan?order=' || id::text
				FROM orders
				WHERE merchant_id = $1 AND service_sub_type = 'food_delivery'
				  AND LOWER(order_number) LIKE $2
				ORDER BY created_at DESC
				LIMIT $3`,
			args: []any{scope.MerchantID, needle, limit},
		})
	}
	if scope.IncludeStaff {
		queries = append(queries, struct {
			kind  string
			query string
			args  []any
		}{
			kind: "staff",
			query: `
				SELECT 'staff', s.id::text,
				       COALESCE(NULLIF(u.full_name, ''), NULLIF(u.email, ''), 'Undangan staff'),
				       s.role || ' · ' || s.status,
				       '/staff?staff=' || s.id::text
				FROM merchant_staff s
				LEFT JOIN users u ON u.id = s.user_id
				WHERE s.merchant_id = $1
				  AND (LOWER(COALESCE(u.full_name, '')) LIKE $2
				       OR LOWER(COALESCE(u.email, '')) LIKE $2
				       OR LOWER(s.role) LIKE $2)
				  AND ($3 = '' OR EXISTS (
				      SELECT 1 FROM merchant_staff_branch_access access
				      WHERE access.staff_id = s.id AND access.branch_id = $3::uuid
				  ))
				ORDER BY s.created_at DESC
				LIMIT $4`,
			args: []any{scope.MerchantID, needle, scope.BranchID, limit},
		})
	}

	results := make([]domain.MerchantSearchResult, 0, limit)
	for _, item := range queries {
		rows, err := r.readDB.QueryContext(ctx, item.query, item.args...)
		if err != nil {
			return nil, fmt.Errorf("search %s: %w", item.kind, err)
		}
		for rows.Next() {
			var result domain.MerchantSearchResult
			if err := rows.Scan(&result.Kind, &result.ID, &result.Title, &result.Subtitle, &result.Path); err != nil {
				_ = rows.Close()
				return nil, fmt.Errorf("scan search %s: %w", item.kind, err)
			}
			results = append(results, result)
			if len(results) >= limit {
				break
			}
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("iterate search %s: %w", item.kind, err)
		}
		_ = rows.Close()
		if len(results) >= limit {
			break
		}
	}
	return results, nil
}
