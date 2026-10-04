package domain

import (
	"context"
	"errors"
	"strings"
)

// MerchantSearchResult is a safe, navigable search hit for the Merchant Portal.
// It intentionally contains no customer PII or opaque provider payloads.
type MerchantSearchResult struct {
	Kind     string `json:"kind"`
	ID       string `json:"id"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle,omitempty"`
	Path     string `json:"path"`
}

func NormalizeMerchantSearchQuery(query string) (string, error) {
	value := strings.Join(strings.Fields(strings.TrimSpace(query)), " ")
	if len([]rune(value)) < 2 {
		return "", errors.New("pencarian minimal 2 karakter")
	}
	if len([]rune(value)) > 80 {
		return "", errors.New("pencarian maksimal 80 karakter")
	}
	return value, nil
}

type MerchantSearchScope struct {
	MerchantID     string
	BranchID       string
	IncludeOrders  bool
	IncludeStaff   bool
	IncludeOutlets bool
}

type MerchantSearchRepository interface {
	Search(ctx context.Context, scope MerchantSearchScope, query string, limit int) ([]MerchantSearchResult, error)
}

type MerchantSearchService interface {
	Search(ctx context.Context, requesterUserID, requestedBranchID, query string, limit int) ([]MerchantSearchResult, error)
}
