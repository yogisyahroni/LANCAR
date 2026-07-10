package domain

import (
	"context"
	"time"
)

type ProductCatalog struct {
	ID         string    `json:"id" db:"id"`
	CustomerID string    `json:"customer_id" db:"customer_id"`
	Name       string    `json:"name" db:"name" validate:"required"`
	SKU        *string   `json:"sku,omitempty" db:"sku"`
	WeightKG   float64   `json:"weight_kg" db:"weight_kg"`
	ItemImage  *string   `json:"item_image,omitempty" db:"item_image"`
	Price      *int64    `json:"price,omitempty" db:"price"`
	IsActive   bool      `json:"is_active" db:"is_active"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
	UpdatedAt  time.Time `json:"updated_at" db:"updated_at"`
}

type ProductCatalogListRequest struct {
	CustomerID string
	Limit      int
	Offset     int
	Search     string
}

type ProductCatalogListResponse struct {
	Items      []ProductCatalog `json:"items"`
	TotalCount int              `json:"total_count"`
	Page       int              `json:"page"`
	Limit      int              `json:"limit"`
}

type BulkUploadProductRequest struct {
	CustomerID string
	CSVContent []byte
}

type BulkUploadProductResponse struct {
	SuccessCount int `json:"success_count"`
	ErrorCount   int `json:"error_count"`
}

type ProductCatalogRepository interface {
	Create(ctx context.Context, product *ProductCatalog) error
	GetByID(ctx context.Context, id, customerID string) (*ProductCatalog, error)
	List(ctx context.Context, req ProductCatalogListRequest) (*ProductCatalogListResponse, error)
	Update(ctx context.Context, product *ProductCatalog) error
	Delete(ctx context.Context, id, customerID string) error
	GetCountByCustomerID(ctx context.Context, customerID string) (int, error)
	BulkCreate(ctx context.Context, products []ProductCatalog) error
}
