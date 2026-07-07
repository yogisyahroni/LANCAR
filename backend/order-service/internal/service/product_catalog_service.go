package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"tembus/order-service/internal/domain"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

type ProductCatalogService struct {
	productRepo domain.ProductCatalogRepository
	configRepo  domain.ConfigRepository
}

func NewProductCatalogService(productRepo domain.ProductCatalogRepository, configRepo domain.ConfigRepository) *ProductCatalogService {
	return &ProductCatalogService{
		productRepo: productRepo,
		configRepo:  configRepo,
	}
}

func (s *ProductCatalogService) CreateProduct(ctx context.Context, p *domain.ProductCatalog) error {
	maxItems := s.configRepo.GetIntConfig(ctx, "product_catalog_max_items", 1000)

	currentCount, err := s.productRepo.GetCountByCustomerID(ctx, p.CustomerID)
	if err != nil {
		return err
	}

	if currentCount >= maxItems {
		return fmt.Errorf("batas maksimum produk (%d) telah tercapai. Harap hapus beberapa produk lama", maxItems)
	}

	p.ID = uuid.New().String()
	return s.productRepo.Create(ctx, p)
}

func (s *ProductCatalogService) GetProduct(ctx context.Context, id, customerID string) (*domain.ProductCatalog, error) {
	return s.productRepo.GetByID(ctx, id, customerID)
}

func (s *ProductCatalogService) ListProducts(ctx context.Context, req domain.ProductCatalogListRequest) (*domain.ProductCatalogListResponse, error) {
	if req.Limit <= 0 {
		req.Limit = 10
	}
	if req.Limit > 100 {
		req.Limit = 100
	}
	return s.productRepo.List(ctx, req)
}

func (s *ProductCatalogService) UpdateProduct(ctx context.Context, p *domain.ProductCatalog) error {
	// Verifikasi kepemilikan
	_, err := s.productRepo.GetByID(ctx, p.ID, p.CustomerID)
	if err != nil {
		return err
	}
	return s.productRepo.Update(ctx, p)
}

func (s *ProductCatalogService) DeleteProduct(ctx context.Context, id, customerID string) error {
	return s.productRepo.Delete(ctx, id, customerID)
}

func (s *ProductCatalogService) BulkUploadCSV(ctx context.Context, customerID string, csvContent []byte) (*domain.BulkUploadProductResponse, error) {
	reader := csv.NewReader(bytes.NewReader(csvContent))
	// Boleh koma atau titik koma (tergantung aplikasi export CSV di Indonesia seringkali semicolon)
	reader.LazyQuotes = true
	
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("gagal membaca file CSV: %v", err)
	}

	if len(records) <= 1 {
		return nil, fmt.Errorf("file CSV kosong atau hanya berisi header")
	}

	maxItems := s.configRepo.GetIntConfig(ctx, "product_catalog_max_items", 1000)
	currentCount, err := s.productRepo.GetCountByCustomerID(ctx, customerID)
	if err != nil {
		return nil, err
	}

	availableSlot := maxItems - currentCount
	if availableSlot <= 0 {
		return nil, fmt.Errorf("batas maksimum produk (%d) telah tercapai", maxItems)
	}

	var products []domain.ProductCatalog
	var successCount, errorCount int

	// Loop dari baris kedua (skip header)
	for i := 1; i < len(records); i++ {
		row := records[i]
		if len(row) < 3 {
			errorCount++
			continue
		}

		// Asumsi format: Nama Barang, SKU, Berat (KG), Harga, URL Gambar
		name := strings.TrimSpace(row[0])
		sku := strings.TrimSpace(row[1])
		weightStr := strings.TrimSpace(row[2])
		
		if name == "" {
			errorCount++
			continue
		}

		weight, err := strconv.ParseFloat(weightStr, 64)
		if err != nil || weight <= 0 {
			weight = 1.0 // Default weight
		}

		var pricePtr *float64
		if len(row) > 3 {
			priceStr := strings.TrimSpace(row[3])
			if priceStr != "" {
				price, err := strconv.ParseFloat(priceStr, 64)
				if err == nil {
					pricePtr = &price
				}
			}
		}

		var imagePtr *string
		if len(row) > 4 {
			imageStr := strings.TrimSpace(row[4])
			if imageStr != "" {
				imagePtr = &imageStr
			}
		}

		var skuPtr *string
		if sku != "" {
			skuPtr = &sku
		}

		products = append(products, domain.ProductCatalog{
			ID:         uuid.New().String(),
			CustomerID: customerID,
			Name:       name,
			SKU:        skuPtr,
			WeightKG:   weight,
			ItemImage:  imagePtr,
			Price:      pricePtr,
			IsActive:   true,
		})

		successCount++
		
		if successCount >= availableSlot {
			break // Berhenti jika slot habis
		}
	}

	if len(products) > 0 {
		err = s.productRepo.BulkCreate(ctx, products)
		if err != nil {
			return nil, err
		}
	}

	return &domain.BulkUploadProductResponse{
		SuccessCount: successCount,
		ErrorCount:   errorCount,
	}, nil
}
