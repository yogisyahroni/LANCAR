package repository

import (
	"context"
	"database/sql"
	"fmt"
	"tembus/order-service/internal/domain"
)

type resiTemplateRepo struct {
	db *sql.DB
}

func NewResiTemplateRepository(db *sql.DB) domain.ResiTemplateRepository {
	return &resiTemplateRepo{db: db}
}

func (r *resiTemplateRepo) GetActiveTemplateByProvider(ctx context.Context, providerCode string) (*domain.ResiTemplate, error) {
	// Priority 1: Match provider_code exactly
	// Priority 2: provider_code IS NULL (fallback)
	query := `
		SELECT id, name, paper_size, layout_config, provider_code
		FROM resi_templates
		WHERE is_active = true 
		AND (provider_code = $1 OR provider_code IS NULL)
		ORDER BY 
			CASE WHEN provider_code = $1 THEN 1 ELSE 2 END ASC,
			created_at DESC
		LIMIT 1
	`
	
	var t domain.ResiTemplate
	var layoutConfigBytes []byte
	
	err := r.db.QueryRowContext(ctx, query, providerCode).Scan(&t.ID, &t.Name, &t.PaperSize, &layoutConfigBytes, &t.ProviderCode)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("no active resi template found for provider %s or default", providerCode)
		}
		return nil, err
	}
	
	t.LayoutConfig = string(layoutConfigBytes)
	return &t, nil
}
