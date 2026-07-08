package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/service"
	"strconv"
	"time"
)

type productDTO struct {
	ID         string    `json:"id"`
	CustomerID string    `json:"customer_id"`
	Name       string    `json:"name"`
	ItemName   string    `json:"item_name"`
	SKU        *string   `json:"sku,omitempty"`
	WeightKG   float64   `json:"weight_kg"`
	ItemImage  *string   `json:"item_image,omitempty"`
	ImageURL   *string   `json:"image_url,omitempty"`
	Price      *float64  `json:"price,omitempty"`
	ItemValue  *float64  `json:"item_value,omitempty"`
	IsActive   bool      `json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

func toProductDTO(p domain.ProductCatalog) productDTO {
	return productDTO{
		ID:         p.ID,
		CustomerID: p.CustomerID,
		Name:       p.Name,
		ItemName:   p.Name,
		SKU:        p.SKU,
		WeightKG:   p.WeightKG,
		ItemImage:  p.ItemImage,
		ImageURL:   p.ItemImage,
		Price:      p.Price,
		ItemValue:  p.Price,
		IsActive:   p.IsActive,
		CreatedAt:  p.CreatedAt,
		UpdatedAt:  p.UpdatedAt,
	}
}

type productPayload struct {
	Name      string   `json:"name"`
	ItemName  string   `json:"item_name"`
	SKU       *string  `json:"sku"`
	WeightKG  float64  `json:"weight_kg"`
	Price     *float64 `json:"price"`
	ItemValue *float64 `json:"item_value"`
	ItemImage *string  `json:"item_image"`
	ImageURL  *string  `json:"image_url"`
	IsActive  *bool    `json:"is_active"`
}

func payloadToDomain(payload productPayload) domain.ProductCatalog {
	name := payload.Name
	if name == "" {
		name = payload.ItemName
	}
	price := payload.Price
	if price == nil {
		price = payload.ItemValue
	}
	img := payload.ItemImage
	if img == nil {
		img = payload.ImageURL
	}
	isActive := true
	if payload.IsActive != nil {
		isActive = *payload.IsActive
	}
	weight := payload.WeightKG
	if weight <= 0 {
		weight = 1.0
	}
	return domain.ProductCatalog{
		Name:      name,
		SKU:       payload.SKU,
		WeightKG:  weight,
		ItemImage: img,
		Price:     price,
		IsActive:  isActive,
	}
}

type ProductCatalogHandler struct {
	productService *service.ProductCatalogService
}

func NewProductCatalogHandler(productService *service.ProductCatalogService) *ProductCatalogHandler {
	return &ProductCatalogHandler{
		productService: productService,
	}
}

// WriteJSON is a helper for writing JSON response
func (h *ProductCatalogHandler) WriteJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		json.NewEncoder(w).Encode(data)
	}
}

func (h *ProductCatalogHandler) WriteError(w http.ResponseWriter, status int, message string) {
	h.WriteJSON(w, status, map[string]string{"error": message})
}

// HandleProducts acts as a router for /api/v1/products
func (h *ProductCatalogHandler) HandleProducts(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.ListProducts(w, r)
	case http.MethodPost:
		h.CreateProduct(w, r)
	default:
		h.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

// HandleProductByID acts as a router for /api/v1/products/{id}
func (h *ProductCatalogHandler) HandleProductByID(w http.ResponseWriter, r *http.Request, id string) {
	switch r.Method {
	case http.MethodGet:
		h.GetProduct(w, r, id)
	case http.MethodPut:
		h.UpdateProduct(w, r, id)
	case http.MethodDelete:
		h.DeleteProduct(w, r, id)
	default:
		h.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (h *ProductCatalogHandler) getCustomerID(r *http.Request) (string, error) {
	// Usually injected via middleware as X-User-ID or context
	customerID := r.Header.Get("X-User-ID")
	if customerID == "" {
		return "", domain.ErrUnauthorized
	}
	return customerID, nil
}

func (h *ProductCatalogHandler) ListProducts(w http.ResponseWriter, r *http.Request) {
	customerID, err := h.getCustomerID(r)
	if err != nil {
		h.WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page <= 0 {
		page = 1
	}
	offset := (page - 1) * limit
	search := r.URL.Query().Get("search")

	req := domain.ProductCatalogListRequest{
		CustomerID: customerID,
		Limit:      limit,
		Offset:     offset,
		Search:     search,
	}

	res, err := h.productService.ListProducts(r.Context(), req)
	if err != nil {
		h.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	dtos := make([]productDTO, 0, len(res.Items))
	for _, item := range res.Items {
		dtos = append(dtos, toProductDTO(item))
	}

	h.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"status":      "success",
		"items":       dtos,
		"data":        dtos,
		"total_count": res.TotalCount,
		"page":        res.Page,
		"limit":       res.Limit,
	})
}

func (h *ProductCatalogHandler) CreateProduct(w http.ResponseWriter, r *http.Request) {
	customerID, err := h.getCustomerID(r)
	if err != nil {
		h.WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var payload productPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		h.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	p := payloadToDomain(payload)
	p.CustomerID = customerID

	if err := h.productService.CreateProduct(r.Context(), &p); err != nil {
		h.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.WriteJSON(w, http.StatusCreated, toProductDTO(p))
}

func (h *ProductCatalogHandler) GetProduct(w http.ResponseWriter, r *http.Request, id string) {
	customerID, err := h.getCustomerID(r)
	if err != nil {
		h.WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	p, err := h.productService.GetProduct(r.Context(), id, customerID)
	if err != nil {
		h.WriteError(w, http.StatusNotFound, "Product not found")
		return
	}

	h.WriteJSON(w, http.StatusOK, toProductDTO(*p))
}

func (h *ProductCatalogHandler) UpdateProduct(w http.ResponseWriter, r *http.Request, id string) {
	customerID, err := h.getCustomerID(r)
	if err != nil {
		h.WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var payload productPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		h.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	p := payloadToDomain(payload)
	p.ID = id
	p.CustomerID = customerID

	if err := h.productService.UpdateProduct(r.Context(), &p); err != nil {
		h.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.WriteJSON(w, http.StatusOK, toProductDTO(p))
}

func (h *ProductCatalogHandler) DeleteProduct(w http.ResponseWriter, r *http.Request, id string) {
	customerID, err := h.getCustomerID(r)
	if err != nil {
		h.WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if err := h.productService.DeleteProduct(r.Context(), id, customerID); err != nil {
		h.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.WriteJSON(w, http.StatusOK, map[string]string{"message": "deleted successfully"})
}

func (h *ProductCatalogHandler) HandleBulkUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	customerID, err := h.getCustomerID(r)
	if err != nil {
		h.WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	r.ParseMultipartForm(10 << 20) // 10MB limit
	file, _, err := r.FormFile("file")
	if err != nil {
		h.WriteError(w, http.StatusBadRequest, "File CSV tidak ditemukan")
		return
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		h.WriteError(w, http.StatusInternalServerError, "Gagal membaca file")
		return
	}

	res, err := h.productService.BulkUploadCSV(r.Context(), customerID, content)
	if err != nil {
		h.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.WriteJSON(w, http.StatusOK, res)
}
