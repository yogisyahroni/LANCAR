package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/service"
	"strconv"
)

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

	h.WriteJSON(w, http.StatusOK, res)
}

func (h *ProductCatalogHandler) CreateProduct(w http.ResponseWriter, r *http.Request) {
	customerID, err := h.getCustomerID(r)
	if err != nil {
		h.WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var p domain.ProductCatalog
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		h.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	p.CustomerID = customerID

	if err := h.productService.CreateProduct(r.Context(), &p); err != nil {
		h.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.WriteJSON(w, http.StatusCreated, p)
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

	h.WriteJSON(w, http.StatusOK, p)
}

func (h *ProductCatalogHandler) UpdateProduct(w http.ResponseWriter, r *http.Request, id string) {
	customerID, err := h.getCustomerID(r)
	if err != nil {
		h.WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var p domain.ProductCatalog
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		h.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	p.ID = id
	p.CustomerID = customerID

	if err := h.productService.UpdateProduct(r.Context(), &p); err != nil {
		h.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.WriteJSON(w, http.StatusOK, p)
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
