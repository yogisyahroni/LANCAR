package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"tembus/merchant-service/internal/domain"
)

type MerchantAdsService struct {
	repo         domain.MerchantAdsRepository
	merchantRepo domain.MerchantRepository
	accessRepo   domain.MerchantAccessRepository
}

func NewMerchantAdsService(repo domain.MerchantAdsRepository, merchantRepo domain.MerchantRepository, accessRepo domain.MerchantAccessRepository) *MerchantAdsService {
	return &MerchantAdsService{repo: repo, merchantRepo: merchantRepo, accessRepo: accessRepo}
}

func (s *MerchantAdsService) resolveMerchant(ctx context.Context, userID string) (string, error) {
	merchant, err := s.merchantRepo.GetByUserID(ctx, userID)
	if err != nil {
		return "", err
	}
	if merchant != nil {
		return merchant.ID, nil
	}
	access := domain.MerchantAccessFromContext(ctx)
	if s.accessRepo == nil || access.SessionToken == "" || access.BranchID == "" || access.DeviceID == "" {
		return "", errors.New("merchant session, branch, dan device wajib diisi untuk staff")
	}
	session, err := s.accessRepo.AuthorizeDeviceSession(ctx, domain.MerchantSessionAuthorization{
		UserID: userID, BranchID: access.BranchID, DeviceID: access.DeviceID,
		SessionToken: access.SessionToken, RequiredPermission: access.RequiredPermission,
	})
	if err != nil {
		return "", err
	}
	return session.MerchantID, nil
}

var forbiddenAdClaims = regexp.MustCompile(`(?i)(diskon|discount|eta|rating|bintang|stars?)`)
var percentageClaim = regexp.MustCompile(`[0-9]+[[:space:]]*%`)

func validateMerchantAd(req domain.CreateMerchantAdRequest) (time.Time, time.Time, error) {
	req.Name = strings.TrimSpace(req.Name)
	req.CreativeHeadline = strings.TrimSpace(req.CreativeHeadline)
	req.CreativeBody = strings.TrimSpace(req.CreativeBody)
	if len(req.Name) < 3 || len(req.Name) > 160 {
		return time.Time{}, time.Time{}, errors.New("nama Ads harus 3-160 karakter")
	}
	if len(req.CreativeHeadline) < 3 || len(req.CreativeHeadline) > 120 {
		return time.Time{}, time.Time{}, errors.New("creative headline harus 3-120 karakter")
	}
	if len(req.CreativeBody) > 240 {
		return time.Time{}, time.Time{}, errors.New("creative body maksimal 240 karakter")
	}
	creative := req.CreativeHeadline + " " + req.CreativeBody
	if forbiddenAdClaims.MatchString(creative) || percentageClaim.MatchString(creative) {
		return time.Time{}, time.Time{}, errors.New("creative Ads tidak boleh mengklaim diskon, ETA, atau rating")
	}
	if req.TotalBudgetIDR < 10000 {
		return time.Time{}, time.Time{}, errors.New("total_budget_idr minimal 10000")
	}
	if req.DailyBudgetIDR < 1000 || req.DailyBudgetIDR > req.TotalBudgetIDR {
		return time.Time{}, time.Time{}, errors.New("daily_budget_idr harus 1000 sampai total_budget_idr")
	}
	if strings.TrimSpace(req.CreativeImageURL) != "" {
		parsed, err := url.Parse(strings.TrimSpace(req.CreativeImageURL))
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
			return time.Time{}, time.Time{}, errors.New("creative_image_url harus URL https yang valid")
		}
	}
	start, err := time.Parse(time.RFC3339, req.StartsAt)
	if err != nil {
		return time.Time{}, time.Time{}, errors.New("starts_at harus format RFC3339")
	}
	end, err := time.Parse(time.RFC3339, req.EndsAt)
	if err != nil || !end.After(start) || !end.After(time.Now()) {
		return time.Time{}, time.Time{}, errors.New("ends_at harus setelah starts_at dan belum berakhir")
	}
	return start, end, nil
}

func adsRequestFingerprint(req domain.CreateMerchantAdRequest) string {
	req.IdempotencyKey = ""
	data, _ := json.Marshal(req)
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

func (s *MerchantAdsService) Create(ctx context.Context, userID string, req domain.CreateMerchantAdRequest) (*domain.MerchantAd, error) {
	if s.repo == nil || s.merchantRepo == nil {
		return nil, errors.New("Ads repository not wired")
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, errors.New("user id tidak valid")
	}
	if len(strings.TrimSpace(req.IdempotencyKey)) < 12 || len(req.IdempotencyKey) > 160 {
		return nil, errors.New("X-Idempotency-Key wajib 12-160 karakter")
	}
	start, end, err := validateMerchantAd(req)
	if err != nil {
		return nil, err
	}
	merchantID, err := s.resolveMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	merchant, err := s.merchantRepo.GetByID(ctx, merchantID)
	if err != nil || merchant == nil {
		return nil, errors.New("merchant tidak ditemukan")
	}
	if merchant.VerificationStatus != "approved" {
		return nil, errors.New("merchant belum disetujui")
	}
	ad := &domain.MerchantAd{
		MerchantID: merchantID, ProductType: "ads", Name: strings.TrimSpace(req.Name),
		Description: strings.TrimSpace(req.Description), Status: "active",
		CreativeHeadline: strings.TrimSpace(req.CreativeHeadline), CreativeBody: strings.TrimSpace(req.CreativeBody),
		CreativeImageURL: strings.TrimSpace(req.CreativeImageURL), TotalBudgetIDR: req.TotalBudgetIDR,
		DailyBudgetIDR: req.DailyBudgetIDR, StartsAt: start, EndsAt: end,
	}
	return s.repo.Create(ctx, ad, req.IdempotencyKey, adsRequestFingerprint(req), userID)
}

func (s *MerchantAdsService) List(ctx context.Context, userID string, page, pageSize int) ([]*domain.MerchantAd, int, error) {
	merchantID, err := s.resolveMerchant(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return s.repo.ListByMerchant(ctx, merchantID, pageSize, (page-1)*pageSize)
}

func (s *MerchantAdsService) SetActive(ctx context.Context, userID, adID string, active bool) error {
	if _, err := uuid.Parse(adID); err != nil {
		return errors.New("Ads id tidak valid")
	}
	merchantID, err := s.resolveMerchant(ctx, userID)
	if err != nil {
		return err
	}
	return s.repo.SetActive(ctx, adID, merchantID, active)
}

func (s *MerchantAdsService) Performance(ctx context.Context, userID, period string) (*domain.MerchantMarketingPerformance, error) {
	if period == "" {
		period = "daily"
	}
	if period != "daily" && period != "weekly" {
		return nil, errors.New("period harus daily atau weekly")
	}
	merchantID, err := s.resolveMerchant(ctx, userID)
	if err != nil {
		return nil, err
	}
	return s.repo.Performance(ctx, merchantID, period)
}

var _ domain.MerchantAdsService = (*MerchantAdsService)(nil)
