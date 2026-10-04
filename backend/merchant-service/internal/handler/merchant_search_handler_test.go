package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"tembus/merchant-service/internal/domain"
)

type merchantSearchServiceStub struct {
	called bool
}

func (s *merchantSearchServiceStub) Search(context.Context, string, string, string, int) ([]domain.MerchantSearchResult, error) {
	s.called = true
	return []domain.MerchantSearchResult{{Kind: "menu", ID: "menu-1", Title: "Soto Ayam", Path: "/menu?item=menu-1"}}, nil
}

func TestMerchantSearchHandlerScopesAuthenticatedRequest(t *testing.T) {
	searchSvc := &merchantSearchServiceStub{}
	h := NewMerchantSearchHandler(NewMerchantHandler(nil, nil), searchSvc)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/merchant/search?q=soto", nil)
	req.Header.Set("X-User-ID", "00000000-0000-0000-0000-000000000001")
	res := httptest.NewRecorder()

	h.Search(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("Search() status = %d, want %d", res.Code, http.StatusOK)
	}
	if !searchSvc.called {
		t.Fatal("Search() did not delegate to the authenticated search service")
	}
}

func TestMerchantSearchHandlerRejectsShortQuery(t *testing.T) {
	h := NewMerchantSearchHandler(NewMerchantHandler(nil, nil), &merchantSearchServiceStub{})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/merchant/search?q=x", nil)
	req.Header.Set("X-User-ID", "00000000-0000-0000-0000-000000000001")
	res := httptest.NewRecorder()

	h.Search(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("Search() status = %d, want %d", res.Code, http.StatusBadRequest)
	}
}
