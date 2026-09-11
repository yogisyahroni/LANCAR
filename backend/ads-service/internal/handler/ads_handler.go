package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"tembus/ads-service/internal/auth"
	"tembus/ads-service/internal/domain"
	"tembus/ads-service/internal/service"
)

type AdsHandler struct {
	campaigns   *service.CampaignService
	delivery    *service.DeliveryService
	repo        service.CampaignRepository
	eventSecret string
}

func NewAdsHandler(campaigns *service.CampaignService, delivery *service.DeliveryService, repo service.CampaignRepository, eventSecret string) *AdsHandler {
	return &AdsHandler{campaigns: campaigns, delivery: delivery, repo: repo, eventSecret: eventSecret}
}

func (h *AdsHandler) respond(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func (h *AdsHandler) fail(w http.ResponseWriter, status int, message string) {
	h.respond(w, status, map[string]any{"status": "error", "error": message})
}

func actorID(r *http.Request) (string, error) {
	id := strings.TrimSpace(r.Header.Get("X-User-ID"))
	if _, err := uuid.Parse(id); err != nil {
		return "", err
	}
	return id, nil
}

func (h *AdsHandler) merchantActor(w http.ResponseWriter, r *http.Request) (string, bool) {
	id, err := actorID(r)
	if err != nil {
		h.fail(w, http.StatusUnauthorized, "authenticated merchant context is required")
		return "", false
	}
	return id, true
}

func (h *AdsHandler) adminActor(w http.ResponseWriter, r *http.Request) (string, bool) {
	id, ok := h.merchantActor(w, r)
	if !ok {
		return "", false
	}
	role := strings.ToLower(strings.TrimSpace(r.Header.Get("X-User-Role")))
	switch role {
	case "super_admin", "admin", "ops_admin", "finance_admin", "ops_security":
		return id, true
	}
	h.fail(w, http.StatusForbidden, "Ads admin capability is required")
	return "", false
}

func (h *AdsHandler) CreateCampaign(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.merchantActor(w, r)
	if !ok {
		return
	}
	var payload json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		h.fail(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	// Merchant Android currently sends the compatibility flat shape. The
	// canonical Ads API normalizes it into the typed campaign contract here.
	var req domain.CreateCampaignRequest
	_ = json.Unmarshal(payload, &req)
	if req.Name == "" || req.Budget.TotalMinor == 0 || req.Creative.Headline == "" {
		var legacy struct {
			Name             string          `json:"name"`
			Description      string          `json:"description"`
			CreativeHeadline string          `json:"creative_headline"`
			CreativeBody     string          `json:"creative_body"`
			CreativeImageURL string          `json:"creative_image_url"`
			TotalBudgetIDR   int64           `json:"total_budget_idr"`
			DailyBudgetIDR   int64           `json:"daily_budget_idr"`
			StartsAt         time.Time       `json:"starts_at"`
			EndsAt           time.Time       `json:"ends_at"`
			MarketCode       string          `json:"market_code"`
			Objective        string          `json:"objective"`
			Placements       []string        `json:"placements"`
			Timezone         string          `json:"timezone"`
			CreativeAltText  string          `json:"creative_alt_text"`
			BillingModel     string          `json:"billing_model"`
			BidMaxMinor      int64           `json:"bid_max_minor"`
			BranchIDs        []string        `json:"branch_ids"`
			Audience         domain.Audience `json:"audience"`
		}
		if err := json.Unmarshal(payload, &legacy); err != nil {
			h.fail(w, http.StatusBadRequest, "invalid campaign payload")
			return
		}
		objective := legacy.Objective
		if objective == "" {
			objective = "visibility"
		}
		placements := legacy.Placements
		if len(placements) == 0 {
			placements = []string{"food_discovery"}
		}
		market := legacy.MarketCode
		if market == "" {
			market = r.Header.Get("X-Market-Code")
		}
		if market == "" {
			market = "id-jk"
		}
		timezone := legacy.Timezone
		if timezone == "" {
			timezone = "Asia/Jakarta"
		}
		billing := legacy.BillingModel
		if billing == "" {
			billing = "cpc"
		}
		bid := legacy.BidMaxMinor
		if bid <= 0 {
			bid = 100
		}
		altText := legacy.CreativeAltText
		if altText == "" {
			altText = "Merchant sponsored food advertisement"
		}
		req = domain.CreateCampaignRequest{
			Name: legacy.Name, Description: legacy.Description, MerchantID: strings.TrimSpace(r.Header.Get("X-Merchant-ID")), MarketCode: market, BranchIDs: legacy.BranchIDs,
			Objective: objective, Placements: placements, Audience: legacy.Audience, Budget: domain.Budget{Currency: "IDR", TotalMinor: legacy.TotalBudgetIDR, DailyMinor: legacy.DailyBudgetIDR, BillingModel: billing},
			Bid: domain.BidStrategy{Kind: "manual", MaxMinor: bid, Version: 1}, StartsAt: legacy.StartsAt, EndsAt: legacy.EndsAt, Timezone: timezone,
			Creative:    domain.Creative{Headline: legacy.CreativeHeadline, Body: legacy.CreativeBody, ImageURL: legacy.CreativeImageURL, AltText: altText},
			Attribution: domain.Attribution{Model: "last_touch", WindowMinutes: 10080, Version: "ads-last-touch-v1"},
		}
	}
	req.OwnerID = actor
	if req.MerchantID == "" {
		req.MerchantID = strings.TrimSpace(r.Header.Get("X-Merchant-ID"))
	}
	req.IdempotencyKey = strings.TrimSpace(r.Header.Get("X-Idempotency-Key"))
	campaign, err := h.campaigns.Create(r.Context(), actor, req)
	if err != nil {
		h.fail(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respond(w, http.StatusCreated, merchantCampaignResponse(*campaign))
}

func (h *AdsHandler) ListMerchantCampaigns(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.merchantActor(w, r)
	if !ok {
		return
	}
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	items, total, err := h.campaigns.List(r.Context(), actor, page, pageSize)
	if err != nil {
		h.fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 50
	}
	compat := make([]merchantCampaign, 0, len(items))
	for _, item := range items {
		compat = append(compat, merchantCampaignResponse(item))
	}
	h.respond(w, http.StatusOK, map[string]any{"items": compat, "total": total, "page": page, "page_size": pageSize, "product_type": "sponsored_ad"})
}

func (h *AdsHandler) Transition(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.merchantActor(w, r)
	if !ok {
		return
	}
	var req struct {
		To     domain.CampaignStatus `json:"to"`
		Reason string                `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.fail(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	campaign, err := h.campaigns.Transition(r.Context(), actor, r.PathValue("id"), req.To, req.Reason)
	if err != nil {
		h.fail(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respond(w, http.StatusOK, campaign)
}

func (h *AdsHandler) SetActive(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.merchantActor(w, r)
	if !ok {
		return
	}
	var req struct {
		Active bool `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.fail(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	to := domain.StatusPaused
	if req.Active {
		to = domain.StatusActive
	}
	if _, err := h.campaigns.Transition(r.Context(), actor, r.PathValue("id"), to, "merchant status action"); err != nil {
		h.fail(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respond(w, http.StatusOK, map[string]any{"success": true, "audited": true})
}

func (h *AdsHandler) MerchantPerformance(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.merchantActor(w, r)
	if !ok {
		return
	}
	performance, err := h.campaigns.Performance(r.Context(), actor)
	if err != nil {
		h.fail(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respond(w, http.StatusOK, map[string]any{
		"period":      r.URL.Query().Get("period"),
		"paid":        map[string]any{"impressions": performance.Impressions, "clicks": performance.Clicks, "attributed_orders": performance.Orders, "revenue_idr": performance.AttributedRevenueMinor, "spend_idr": performance.SpendMinor},
		"organic":     map[string]any{"impressions": performance.OrganicBaseline.Impressions, "orders": performance.OrganicBaseline.Orders},
		"definitions": map[string]string{"spend": "charged Ads events only", "attribution": performance.AttributionModel + " / " + performance.AttributionVersion, "organic": "non-paid baseline; never mixed with paid"},
	})
}

type merchantCampaign struct {
	ID                   string          `json:"id"`
	MerchantID           string          `json:"merchant_id"`
	ProductType          string          `json:"product_type"`
	Name                 string          `json:"name"`
	Description          string          `json:"description"`
	MarketCode           string          `json:"market_code"`
	CityCode             string          `json:"city_code,omitempty"`
	BranchIDs            []string        `json:"branch_ids,omitempty"`
	Objective            string          `json:"objective"`
	Placements           []string        `json:"placements"`
	Audience             domain.Audience `json:"audience"`
	Status               string          `json:"status"`
	CreativeHeadline     string          `json:"creative_headline"`
	CreativeBody         string          `json:"creative_body"`
	CreativeImageURL     string          `json:"creative_image_url"`
	TotalBudgetIDR       int64           `json:"total_budget_idr"`
	DailyBudgetIDR       int64           `json:"daily_budget_idr"`
	StartsAt             time.Time       `json:"starts_at"`
	EndsAt               time.Time       `json:"ends_at"`
	Impressions          int64           `json:"impressions"`
	Clicks               int64           `json:"clicks"`
	AttributedOrders     int64           `json:"attributed_orders"`
	AttributedRevenueIDR int64           `json:"attributed_revenue_idr"`
	ChargedAmountIDR     int64           `json:"charged_amount_idr"`
	RejectionReason      string          `json:"rejection_reason,omitempty"`
	SuspensionReason     string          `json:"suspension_reason,omitempty"`
}

func merchantCampaignResponse(c domain.Campaign) merchantCampaign {
	return merchantCampaign{ID: c.ID, MerchantID: c.MerchantID, ProductType: "ads", Name: c.Name, Description: c.Description, MarketCode: c.MarketCode, CityCode: c.CityCode, BranchIDs: c.BranchIDs, Objective: c.Objective, Placements: c.Placements, Audience: c.Audience, Status: string(c.Status), CreativeHeadline: c.Creative.Headline, CreativeBody: c.Creative.Body, CreativeImageURL: c.Creative.ImageURL, TotalBudgetIDR: c.Budget.TotalMinor, DailyBudgetIDR: c.Budget.DailyMinor, StartsAt: c.StartsAt, EndsAt: c.EndsAt, ChargedAmountIDR: c.Budget.SpentMinor, RejectionReason: c.RejectionReason, SuspensionReason: c.SuspensionReason}
}

func (h *AdsHandler) Clone(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.merchantActor(w, r)
	if !ok {
		return
	}
	campaign, err := h.campaigns.Clone(r.Context(), actor, r.PathValue("id"), strings.TrimSpace(r.Header.Get("X-Idempotency-Key")))
	if err != nil {
		h.fail(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respond(w, http.StatusCreated, campaign)
}

func (h *AdsHandler) Placement(w http.ResponseWriter, r *http.Request) {
	placement := r.PathValue("placement")
	if domain.IsProtectedAdFree(placement) {
		h.respond(w, http.StatusOK, map[string]any{"items": []domain.DeliveryItem{}, "source": "ad_free_protected_zone", "fallback": "transaction"})
		return
	}
	resolved := strings.EqualFold(r.Header.Get("X-Ads-Context-Resolved"), "true")
	if !resolved {
		h.respond(w, http.StatusOK, map[string]any{"items": []domain.DeliveryItem{}, "source": "organic_fallback", "fallback_reason": "server_context_not_resolved"})
		return
	}
	items, err := h.delivery.Serve(r.Context(), domain.DeliveryContext{Placement: placement, Market: r.URL.Query().Get("market"), Session: r.URL.Query().Get("session_id"), UserHash: r.URL.Query().Get("user_hash"), Intent: service.NormalizeIntent(r.URL.Query().Get("intent"))}, service.EligibilityInput{Now: time.Now().UTC(), Audience: domain.AudienceContext{MarketCode: r.URL.Query().Get("market"), ZoneCode: r.URL.Query().Get("zone"), ServiceAreaCode: r.URL.Query().Get("service_area"), Relationship: r.URL.Query().Get("relationship"), IntentCategory: r.URL.Query().Get("intent"), AppVersion: r.Header.Get("X-App-Version"), PrivacyCohort: r.Header.Get("X-Ads-Privacy-Cohort")}, MerchantActive: true, MerchantOpen: true, Serviceable: true, Relevant: true, CatalogAvailable: true, RiskApproved: true, AppVersion: r.Header.Get("X-App-Version")})
	if err != nil {
		h.respond(w, http.StatusOK, map[string]any{"items": []domain.DeliveryItem{}, "source": "organic_fallback", "fallback_reason": "ads_unavailable"})
		return
	}
	h.respond(w, http.StatusOK, map[string]any{"items": items, "source": "ads_service", "placement": placement, "organic_minimum": domain.DefaultPlacementPolicies()[domain.Placement(placement)].MinOrganicVisible})
}

func (h *AdsHandler) Event(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token       string `json:"ad_delivery_token"`
		UserHash    string `json:"user_hash"`
		SessionHash string `json:"session_hash"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.fail(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	idem := strings.TrimSpace(r.Header.Get("X-Idempotency-Key"))
	eventType := domain.EventImpression
	if r.PathValue("event") == "click" {
		eventType = domain.EventClick
	}
	charged, err := h.delivery.Record(r.Context(), eventType, req.Token, req.UserHash, req.SessionHash, idem)
	if err != nil {
		if err == service.ErrBudgetExhausted {
			h.respond(w, http.StatusConflict, map[string]any{"accepted": false, "reason": "budget_exhausted"})
			return
		}
		h.fail(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respond(w, http.StatusAccepted, map[string]any{"accepted": charged, "deduplicated": !charged})
}

// ServerConversion is intentionally an internal service boundary. It accepts
// an order reference only from the authoritative order domain; the Ads
// repository validates the order state, finds a recent charged click and
// persists the immutable attribution row. There is no client conversion=true
// field and this route is not registered on the API gateway.
func (h *AdsHandler) ServerConversion(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CampaignID     string `json:"campaign_id"`
		OrderID        string `json:"order_id"`
		IdempotencyKey string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.fail(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	req.CampaignID = strings.TrimSpace(req.CampaignID)
	req.OrderID = strings.TrimSpace(req.OrderID)
	req.IdempotencyKey = strings.TrimSpace(req.IdempotencyKey)
	if _, err := uuid.Parse(req.CampaignID); err != nil {
		h.fail(w, http.StatusBadRequest, "invalid campaign id")
		return
	}
	if _, err := uuid.Parse(req.OrderID); err != nil {
		h.fail(w, http.StatusBadRequest, "invalid order id")
		return
	}
	if req.IdempotencyKey == "" {
		h.fail(w, http.StatusBadRequest, "idempotency key is required")
		return
	}
	if err := auth.VerifyOrderEvent(h.eventSecret, r, req.CampaignID, req.OrderID, req.IdempotencyKey); err != nil {
		h.fail(w, http.StatusUnauthorized, err.Error())
		return
	}
	accepted, err := h.delivery.RecordServerConversion(r.Context(), req.CampaignID, req.OrderID, req.IdempotencyKey)
	if err != nil {
		h.fail(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respond(w, http.StatusAccepted, map[string]any{"accepted": accepted, "deduplicated": !accepted, "source": "authoritative_order_event"})
}

func (h *AdsHandler) AdminCampaigns(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.adminActor(w, r); !ok {
		return
	}
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 50
	}
	items, total, err := h.repo.ListAllCampaigns(r.Context(), pageSize, (page-1)*pageSize)
	if err != nil {
		h.fail(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respond(w, http.StatusOK, map[string]any{"items": items, "total": total, "page": page, "page_size": pageSize})
}

func (h *AdsHandler) AdminSuspend(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.adminActor(w, r)
	if !ok {
		return
	}
	var req struct {
		Reason    string     `json:"reason"`
		Scope     string     `json:"scope"`
		ExpiresAt *time.Time `json:"expires_at"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.fail(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := h.repo.AdminSuspend(r.Context(), r.PathValue("id"), actor, req.Reason, req.Scope, req.ExpiresAt); err != nil {
		h.fail(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respond(w, http.StatusOK, map[string]any{"success": true, "audited": true})
}

func (h *AdsHandler) AdminModerate(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.adminActor(w, r)
	if !ok {
		return
	}
	var req struct {
		Status string `json:"status"`
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.fail(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	moderator, ok := h.repo.(interface {
		AdminModerate(context.Context, string, string, string, string) error
	})
	if !ok {
		h.fail(w, http.StatusNotImplemented, "moderation repository is not wired")
		return
	}
	if err := moderator.AdminModerate(r.Context(), r.PathValue("id"), actor, req.Status, req.Reason); err != nil {
		h.fail(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respond(w, http.StatusOK, map[string]any{"success": true, "audited": true})
}

func (h *AdsHandler) Inventory(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.adminActor(w, r); !ok {
		return
	}
	h.respond(w, http.StatusOK, map[string]any{"policies": domain.DefaultPlacementPolicies(), "protected_global_bounds": map[string]any{"home_first_viewport_max_ads": 1, "discovery_density_percent": 25, "ad_free_zones": []string{"checkout", "payment", "tracking", "support", "claim", "tambal_booking", "tambal_matching", "tambal_active", "towing_booking", "towing_matching", "towing_active", "aggregator_compare"}}})
}

func (h *AdsHandler) Audit(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.adminActor(w, r); !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, err := h.repo.ListAudit(r.Context(), limit)
	if err != nil {
		h.fail(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respond(w, http.StatusOK, map[string]any{"items": items, "privacy": "campaign-level audit only; raw user identity is excluded"})
}

func (h *AdsHandler) AdminBillingAdjustment(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.adminActor(w, r)
	if !ok {
		return
	}
	var req struct {
		Direction      string `json:"direction"`
		AmountMinor    int64  `json:"amount_minor"`
		Reason         string `json:"reason"`
		IdempotencyKey string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.fail(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.IdempotencyKey == "" {
		req.IdempotencyKey = strings.TrimSpace(r.Header.Get("X-Idempotency-Key"))
	}
	if err := h.repo.AdminBillingAdjustment(r.Context(), r.PathValue("id"), actor, req.Direction, req.AmountMinor, req.Reason, req.IdempotencyKey); err != nil {
		h.fail(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respond(w, http.StatusOK, map[string]any{"success": true, "append_only": true, "audited": true})
}

func (h *AdsHandler) AdminPolicyProposal(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.adminActor(w, r)
	if !ok {
		return
	}
	var req struct {
		Scope         string         `json:"scope"`
		Reason        string         `json:"reason"`
		ProposedValue map[string]any `json:"proposed_value"`
		ChangeTicket  string         `json:"change_ticket"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.fail(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if strings.TrimSpace(req.Scope) == "" || strings.TrimSpace(req.Reason) == "" {
		h.fail(w, http.StatusBadRequest, "scope and reason are required")
		return
	}
	if err := h.repo.AdminAudit(r.Context(), actor, "policy_change_proposed", req.Reason, map[string]any{"scope": req.Scope, "proposed_value": req.ProposedValue, "change_ticket": req.ChangeTicket, "maker_id": actor, "requires_second_approver": true}); err != nil {
		h.fail(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respond(w, http.StatusAccepted, map[string]any{"status": "pending_second_approver", "audited": true, "requires_second_approver": true})
}

func (h *AdsHandler) AdminDebug(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.adminActor(w, r); !ok {
		return
	}
	placement := strings.TrimSpace(r.URL.Query().Get("placement"))
	market := strings.TrimSpace(r.URL.Query().Get("market"))
	campaigns, _, err := h.repo.ListAllCampaigns(r.Context(), 100, 0)
	if err != nil {
		h.fail(w, http.StatusBadRequest, err.Error())
		return
	}
	now := time.Now().UTC()
	items := make([]map[string]any, 0, len(campaigns))
	for _, campaign := range campaigns {
		reason := "eligible_candidate"
		eligible := true
		switch {
		case !campaign.ServesAt(now):
			eligible, reason = false, "campaign_not_active_or_expired"
		case market != "" && !campaign.Audience.Matches(domain.AudienceContext{MarketCode: market}):
			eligible, reason = false, "audience_market_mismatch"
		case placement != "" && !containsString(campaign.Placements, placement):
			eligible, reason = false, "placement_not_reserved"
		case campaign.Budget.SpentMinor >= campaign.Budget.TotalMinor:
			eligible, reason = false, "budget_exhausted"
		}
		items = append(items, map[string]any{"campaign_id": campaign.ID, "eligible": eligible, "reason": reason, "placement": placement, "market": market, "campaign_version": campaign.Version})
	}
	h.respond(w, http.StatusOK, map[string]any{"items": items, "privacy": "sampled campaign-level decision; user identity and raw device data excluded"})
}

func containsString(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}
