package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"tembus/ads-service/internal/domain"
)

type DeliveryRepository interface {
	EligibleCampaigns(ctx context.Context, placement, market string) ([]domain.Campaign, error)
	SaveDeliveryContext(ctx context.Context, claims domain.DeliveryTokenClaims, tokenHash string) error
	RecordBillableEvent(ctx context.Context, event domain.AdEvent) (bool, error)
	RecordServerConversion(ctx context.Context, campaignID, orderID, idempotencyKey string) (bool, error)
}

type DeliveryService struct {
	repo        DeliveryRepository
	secret      []byte
	eligibility EligibilityService
	auction     AuctionService
	now         func() time.Time
}

func NewDeliveryService(repo DeliveryRepository, secret string) *DeliveryService {
	return &DeliveryService{repo: repo, secret: []byte(secret), now: func() time.Time { return time.Now().UTC() }}
}

func (s *DeliveryService) Serve(ctx context.Context, request domain.DeliveryContext, input EligibilityInput) ([]domain.DeliveryItem, error) {
	policy, ok := domain.DefaultPlacementPolicies()[domain.Placement(request.Placement)]
	if !ok {
		return nil, errors.New("unknown placement")
	}
	if policy.ProtectedAdFree {
		return []domain.DeliveryItem{}, nil
	}
	campaigns, err := s.repo.EligibleCampaigns(ctx, request.Placement, request.Market)
	if err != nil {
		return nil, err
	}
	candidates := make([]domain.AdCandidate, 0, len(campaigns))
	for _, campaign := range campaigns {
		eligible, reason := s.eligibility.Check(campaign, input)
		candidate := domain.AdCandidate{Campaign: campaign, Eligible: eligible, Reason: reason, Relevance: relevance(campaign, request.Intent), Quality: 1}
		candidates = append(candidates, candidate)
	}
	result := s.auction.Select(candidates, policy.MaxAds)
	if result.Winner == nil {
		return []domain.DeliveryItem{}, nil
	}
	winner := result.Winner.Campaign
	now := s.now()
	claims := domain.DeliveryTokenClaims{CampaignID: winner.ID, Placement: request.Placement, CampaignVer: winner.Version, SelectedAt: now, ExpiresAt: now.Add(2 * time.Minute), RequestHash: hash(request.Market + "|" + request.Session + "|" + request.Intent)}
	token, err := s.sign(claims)
	if err != nil {
		return nil, err
	}
	if err := s.repo.SaveDeliveryContext(ctx, claims, hash(token)); err != nil {
		return nil, err
	}
	return []domain.DeliveryItem{{CampaignID: winner.ID, MerchantID: winner.MerchantID, CreativeHeadline: winner.Creative.Headline, CreativeBody: winner.Creative.Body, CreativeImageURL: winner.Creative.ImageURL, CreativeAltText: winner.Creative.AltText, AdDeliveryToken: token, SourceType: "sponsored_ad", DisclosureLabel: "Sponsored / Iklan", OrganicFacts: domain.OrganicFacts{Serviceable: true, Availability: "server_resolved"}}}, nil
}

func (s *DeliveryService) Record(ctx context.Context, eventType domain.AdEventType, token string, userHash, sessionHash, idem string) (bool, error) {
	claims, err := s.verify(token)
	if err != nil {
		return false, err
	}
	if eventType != domain.EventImpression && eventType != domain.EventClick {
		return false, errors.New("unsupported ad event")
	}
	if strings.TrimSpace(idem) == "" {
		return false, errors.New("idempotency key is required")
	}
	cost := int64(0)
	if eventType == domain.EventClick {
		cost = 100
	}
	event := domain.AdEvent{CampaignID: claims.CampaignID, EventType: eventType, Placement: claims.Placement, DeliveryToken: token, TokenHash: hash(token), UserHash: hash(userHash), SessionHash: hash(sessionHash), CostMinor: cost, Currency: "IDR", BillingModel: "cpc", CampaignVersion: claims.CampaignVer, IdempotencyKey: idem, CreatedAt: s.now()}
	return s.repo.RecordBillableEvent(ctx, event)
}

// RecordServerConversion delegates attribution to the repository so the
// database transaction can validate the real order state and enforce the
// one-order/last-touch uniqueness boundary.
func (s *DeliveryService) RecordServerConversion(ctx context.Context, campaignID, orderID, idempotencyKey string) (bool, error) {
	if strings.TrimSpace(campaignID) == "" || strings.TrimSpace(orderID) == "" || strings.TrimSpace(idempotencyKey) == "" {
		return false, errors.New("campaign, order and idempotency references are required")
	}
	return s.repo.RecordServerConversion(ctx, campaignID, orderID, idempotencyKey)
}

func relevance(campaign domain.Campaign, intent string) float64 {
	if intent == "" {
		return .5
	}
	for _, placement := range campaign.Placements {
		if strings.EqualFold(placement, intent) {
			return 1
		}
	}
	return .25
}

func hash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func (s *DeliveryService) sign(claims domain.DeliveryTokenClaims) (string, error) {
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, s.secret)
	_, _ = mac.Write([]byte(encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func (s *DeliveryService) verify(token string) (domain.DeliveryTokenClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return domain.DeliveryTokenClaims{}, errors.New("invalid ad delivery token")
	}
	mac := hmac.New(sha256.New, s.secret)
	_, _ = mac.Write([]byte(parts[0]))
	supplied, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(supplied, mac.Sum(nil)) {
		return domain.DeliveryTokenClaims{}, errors.New("invalid ad delivery token signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return domain.DeliveryTokenClaims{}, errors.New("invalid ad delivery token payload")
	}
	var claims domain.DeliveryTokenClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return claims, err
	}
	if !s.now().Before(claims.ExpiresAt) {
		return claims, errors.New("expired ad delivery token")
	}
	return claims, nil
}
