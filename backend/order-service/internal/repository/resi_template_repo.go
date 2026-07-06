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

func (r *resiTemplateRepo) GetActiveTemplate(ctx context.Context) (*domain.ResiTemplate, error) {
	query := `
		SELECT id, name, paper_size, layout_config
		FROM resi_templates
		WHERE is_active = true
		ORDER BY created_at DESC
		LIMIT 1
	`
	
	var t domain.ResiTemplate
	var layoutConfigBytes []byte
	
	err := r.db.QueryRowContext(ctx, query).Scan(&t.ID, &t.Name, &t.PaperSize, &layoutConfigBytes)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("no active resi template found")
		}
		return nil, err
	}
	
	t.LayoutConfig = string(layoutConfigBytes)
	return &t, nil
}
