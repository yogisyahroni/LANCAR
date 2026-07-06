package domain

import "context"

type ResiTemplate struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	PaperSize    string `json:"paper_size"`
	LayoutConfig string `json:"layout_config"`
}

type ResiTemplateRepository interface {
	GetActiveTemplate(ctx context.Context) (*ResiTemplate, error)
}
