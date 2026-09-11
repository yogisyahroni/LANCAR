package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"tembus/ads-service/internal/domain"
)

type CampaignRepository interface {
	CreateCampaign(ctx context.Context, campaign domain.Campaign, idempotencyKey, fingerprint, actorID string) (*domain.Campaign, error)
	ListCampaigns(ctx context.Context, ownerID string, limit, offset int) ([]domain.Campaign, int, error)
	GetCampaign(ctx context.Context, ownerID, campaignID string) (*domain.Campaign, error)
	TransitionCampaign(ctx context.Context, ownerID, campaignID string, from, to domain.CampaignStatus, reason, actorID string) (*domain.Campaign, error)
	CloneCampaign(ctx context.Context, ownerID, campaignID, idempotencyKey, actorID string) (*domain.Campaign, error)
	ListAllCampaigns(ctx context.Context, limit, offset int) ([]domain.Campaign, int, error)
	AdminSuspend(ctx context.Context, campaignID, actorID, reason, scope string, expiresAt *time.Time) error
	AdminAudit(ctx context.Context, actorID, action, reason string, payload map[string]any) error
	ListAudit(ctx context.Context, limit int) ([]map[string]any, error)
	AdminBillingAdjustment(ctx context.Context, campaignID, actorID, direction string, amount int64, reason, idempotencyKey string) error
	MerchantPerformance(ctx context.Context, ownerID string) (domain.Performance, error)
}

type CampaignService struct{ repo CampaignRepository }

func NewCampaignService(repo CampaignRepository) *CampaignService {
	return &CampaignService{repo: repo}
}

func (s *CampaignService) Create(ctx context.Context, actorID string, req domain.CreateCampaignRequest) (*domain.Campaign, error) {
	if s.repo == nil {
		return nil, errors.New("Ads repository not wired")
	}
	if _, err := uuid.Parse(actorID); err != nil {
		return nil, errors.New("actor id is invalid")
	}
	if strings.TrimSpace(req.IdempotencyKey) == "" || len(req.IdempotencyKey) > 160 {
		return nil, errors.New("X-Idempotency-Key is required")
	}
	ownerID := strings.TrimSpace(req.OwnerID)
	if ownerID == "" {
		ownerID = actorID
	}
	if ownerID != actorID {
		return nil, errors.New("campaign owner must be the authenticated actor")
	}
	campaign := domain.Campaign{
		ID: uuid.NewString(), OwnerID: ownerID, MerchantID: strings.TrimSpace(req.MerchantID), BrandAccountID: strings.TrimSpace(req.BrandAccountID),
		MarketCode: strings.TrimSpace(req.MarketCode), CityCode: strings.TrimSpace(req.CityCode), BranchIDs: req.BranchIDs, Name: strings.TrimSpace(req.Name),
		Description: strings.TrimSpace(req.Description),
		Objective:   strings.TrimSpace(req.Objective), Placements: req.Placements, Audience: req.Audience, Budget: req.Budget, Bid: req.Bid,
		StartsAt: req.StartsAt.UTC(), EndsAt: req.EndsAt.UTC(), Timezone: strings.TrimSpace(req.Timezone), Daypart: req.Daypart, Creative: req.Creative,
		Status: domain.StatusDraft, PolicyStatus: "pending", Version: 1, Attribution: req.Attribution, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(),
	}
	// Currency must arrive from the market financial context (or the explicit
	// legacy `*_idr` compatibility payload); never infer it from locale.
	if campaign.Budget.BillingModel == "" {
		campaign.Budget.BillingModel = "cpc"
	}
	if campaign.Attribution.Model == "" {
		campaign.Attribution.Model = "last_touch"
	}
	if campaign.Attribution.WindowMinutes == 0 {
		campaign.Attribution.WindowMinutes = 7 * 24 * 60
	}
	if campaign.Attribution.Version == "" {
		campaign.Attribution.Version = "ads-last-touch-v1"
	}
	if campaign.Bid.Kind == "" {
		campaign.Bid.Kind = "automatic"
	}
	if campaign.Bid.Version == 0 {
		campaign.Bid.Version = 1
	}
	if err := campaign.Validate(); err != nil {
		return nil, err
	}
	return s.repo.CreateCampaign(ctx, campaign, req.IdempotencyKey, fingerprint(req), actorID)
}

func (s *CampaignService) List(ctx context.Context, ownerID string, page, pageSize int) ([]domain.Campaign, int, error) {
	if _, err := uuid.Parse(ownerID); err != nil {
		return nil, 0, errors.New("owner id is invalid")
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 50
	}
	return s.repo.ListCampaigns(ctx, ownerID, pageSize, (page-1)*pageSize)
}

func (s *CampaignService) Transition(ctx context.Context, ownerID, id string, to domain.CampaignStatus, reason string) (*domain.Campaign, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, errors.New("campaign id is invalid")
	}
	if _, err := uuid.Parse(ownerID); err != nil {
		return nil, errors.New("owner id is invalid")
	}
	campaign, err := s.repo.GetCampaign(ctx, ownerID, id)
	if err != nil {
		return nil, err
	}
	if campaign == nil {
		return nil, errors.New("campaign not found")
	}
	if !domain.CanTransition(campaign.Status, to) {
		return nil, errors.New("invalid campaign lifecycle transition")
	}
	if to == domain.StatusActive && campaign.EndsAt.Before(time.Now().UTC()) {
		return nil, errors.New("expired campaign cannot be activated")
	}
	return s.repo.TransitionCampaign(ctx, ownerID, id, campaign.Status, to, strings.TrimSpace(reason), ownerID)
}

func (s *CampaignService) Clone(ctx context.Context, ownerID, id, idempotencyKey string) (*domain.Campaign, error) {
	if len(idempotencyKey) < 12 {
		return nil, errors.New("X-Idempotency-Key is required for clone")
	}
	return s.repo.CloneCampaign(ctx, ownerID, id, idempotencyKey, ownerID)
}

func (s *CampaignService) Performance(ctx context.Context, ownerID string) (domain.Performance, error) {
	if _, err := uuid.Parse(ownerID); err != nil {
		return domain.Performance{}, errors.New("owner id is invalid")
	}
	return s.repo.MerchantPerformance(ctx, ownerID)
}

func fingerprint(req domain.CreateCampaignRequest) string {
	req.IdempotencyKey = ""
	b, _ := json.Marshal(req)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}
