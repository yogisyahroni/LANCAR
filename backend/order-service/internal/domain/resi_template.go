package domain

import "context"

type ResiTemplate struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	PaperSize    string `json:"paper_size"`
	LayoutConfig string `json:"layout_config"`
	ProviderCode *string `json:"provider_code"`
}

type ResiTemplateRepository interface {
	GetActiveTemplateByProvider(ctx context.Context, providerCode string) (*ResiTemplate, error)
}
