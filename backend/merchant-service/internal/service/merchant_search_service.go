package service

import (
	"context"
	"errors"
	"strings"

	"tembus/merchant-service/internal/domain"
)

type merchantSearchService struct {
	accessSvc domain.MerchantAccessService
	repo      domain.MerchantSearchRepository
}

func NewMerchantSearchService(accessSvc domain.MerchantAccessService, repo domain.MerchantSearchRepository) domain.MerchantSearchService {
	return &merchantSearchService{accessSvc: accessSvc, repo: repo}
}

func (s *merchantSearchService) Search(ctx context.Context, requesterUserID, requestedBranchID, query string, limit int) ([]domain.MerchantSearchResult, error) {
	if s.accessSvc == nil || s.repo == nil {
		return nil, errors.New("merchant search service belum dikonfigurasi")
	}
	query, err := domain.NormalizeMerchantSearchQuery(query)
	if err != nil {
		return nil, err
	}
	portal, err := s.accessSvc.GetPortalContext(ctx, requesterUserID, strings.TrimSpace(requestedBranchID))
	if err != nil {
		return nil, err
	}
	if portal == nil || portal.Merchant == nil || strings.TrimSpace(portal.CurrentBranchID) == "" {
		return nil, errors.New("konteks outlet belum tersedia")
	}
	if portal.DeviceSessionRequired {
		access := domain.MerchantAccessFromContext(ctx)
		if strings.TrimSpace(access.SessionToken) == "" || strings.TrimSpace(access.DeviceID) == "" {
			return nil, errors.New("merchant session dan device wajib diisi untuk staff")
		}
		if _, err := s.accessSvc.AuthorizeDeviceSession(ctx, domain.MerchantSessionAuthorization{
			UserID: requesterUserID, MerchantID: portal.Merchant.ID, BranchID: portal.CurrentBranchID,
			DeviceID: access.DeviceID, SessionToken: access.SessionToken, RequiredPermission: domain.PermViewStore,
		}); err != nil {
			return nil, err
		}
	}

	capabilities := make(map[string]bool, len(portal.Capabilities))
	for _, capability := range portal.Capabilities {
		capabilities[capability] = true
	}
	return s.repo.Search(ctx, domain.MerchantSearchScope{
		MerchantID: portal.Merchant.ID,
		BranchID:   portal.CurrentBranchID,
		// The canonical orders table is merchant-scoped today and has no
		// outlet_id. Keep order hits owner-only until the multi-outlet order
		// contract adds an authoritative outlet relationship; this avoids
		// exposing another outlet's orders to staff through global search.
		IncludeOrders:  capabilities["manage_branch"],
		IncludeStaff:   capabilities["manage_staff"],
		IncludeOutlets: capabilities["manage_branch"],
	}, query, limit)
}
