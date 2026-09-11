package domain

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

type CampaignStatus string

const (
	StatusDraft           CampaignStatus = "draft"
	StatusValidating      CampaignStatus = "validating"
	StatusReview          CampaignStatus = "review"
	StatusScheduled       CampaignStatus = "scheduled"
	StatusActive          CampaignStatus = "active"
	StatusPaused          CampaignStatus = "paused"
	StatusEnded           CampaignStatus = "ended"
	StatusRejected        CampaignStatus = "rejected"
	StatusBudgetExhausted CampaignStatus = "budget_exhausted"
	StatusPaymentHold     CampaignStatus = "payment_hold"
	StatusSuspended       CampaignStatus = "suspended"
	StatusArchived        CampaignStatus = "archived"
)

type Campaign struct {
	ID               string         `json:"id"`
	OwnerID          string         `json:"owner_id"`
	MerchantID       string         `json:"merchant_id,omitempty"`
	BrandAccountID   string         `json:"brand_account_id,omitempty"`
	MarketCode       string         `json:"market_code"`
	CityCode         string         `json:"city_code,omitempty"`
	BranchIDs        []string       `json:"branch_ids,omitempty"`
	Name             string         `json:"name"`
	Description      string         `json:"description,omitempty"`
	Objective        string         `json:"objective"`
	Placements       []string       `json:"placements"`
	Audience         Audience       `json:"audience"`
	Budget           Budget         `json:"budget"`
	Bid              BidStrategy    `json:"bid_strategy"`
	StartsAt         time.Time      `json:"starts_at"`
	EndsAt           time.Time      `json:"ends_at"`
	Timezone         string         `json:"timezone"`
	Daypart          []Daypart      `json:"daypart,omitempty"`
	Creative         Creative       `json:"creative"`
	Status           CampaignStatus `json:"status"`
	PolicyStatus     string         `json:"policy_status"`
	Version          int            `json:"version"`
	Attribution      Attribution    `json:"attribution"`
	RejectionReason  string         `json:"rejection_reason,omitempty"`
	SuspensionReason string         `json:"suspension_reason,omitempty"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
}

type CreateCampaignRequest struct {
	OwnerID        string      `json:"owner_id"`
	MerchantID     string      `json:"merchant_id"`
	BrandAccountID string      `json:"brand_account_id,omitempty"`
	MarketCode     string      `json:"market_code"`
	CityCode       string      `json:"city_code,omitempty"`
	BranchIDs      []string    `json:"branch_ids,omitempty"`
	Name           string      `json:"name"`
	Description    string      `json:"description,omitempty"`
	Objective      string      `json:"objective"`
	Placements     []string    `json:"placements"`
	Audience       Audience    `json:"audience"`
	Budget         Budget      `json:"budget"`
	Bid            BidStrategy `json:"bid_strategy"`
	StartsAt       time.Time   `json:"starts_at"`
	EndsAt         time.Time   `json:"ends_at"`
	Timezone       string      `json:"timezone"`
	Daypart        []Daypart   `json:"daypart,omitempty"`
	Creative       Creative    `json:"creative"`
	Attribution    Attribution `json:"attribution"`
	IdempotencyKey string      `json:"-"`
}

type Daypart struct {
	Weekday int    `json:"weekday"`
	Start   string `json:"start"`
	End     string `json:"end"`
}

type Attribution struct {
	Model         string `json:"model"`
	WindowMinutes int    `json:"window_minutes"`
	Version       string `json:"version"`
}

func (c Campaign) Validate() error {
	if strings.TrimSpace(c.OwnerID) == "" {
		return errors.New("campaign owner is required")
	}
	if strings.TrimSpace(c.MarketCode) == "" {
		return errors.New("market_code is required")
	}
	if len(strings.TrimSpace(c.Name)) < 3 || len(c.Name) > 160 {
		return errors.New("campaign name must be 3-160 characters")
	}
	if strings.TrimSpace(c.Objective) == "" {
		return errors.New("objective is required")
	}
	if len(c.Placements) == 0 {
		return errors.New("at least one placement is required")
	}
	if c.Budget.Currency != "IDR" && c.Budget.Currency != "USD" {
		return fmt.Errorf("unsupported campaign currency %q", c.Budget.Currency)
	}
	if c.Budget.TotalMinor <= 0 || c.Budget.DailyMinor <= 0 || c.Budget.DailyMinor > c.Budget.TotalMinor {
		return errors.New("daily and total budget must be positive and daily must not exceed total")
	}
	if c.StartsAt.IsZero() || c.EndsAt.IsZero() || !c.EndsAt.After(c.StartsAt) {
		return errors.New("campaign window is invalid")
	}
	if strings.TrimSpace(c.Timezone) == "" {
		return errors.New("campaign timezone is required")
	}
	if err := c.Creative.Validate(); err != nil {
		return err
	}
	if c.Attribution.WindowMinutes <= 0 || strings.TrimSpace(c.Attribution.Version) == "" {
		return errors.New("immutable attribution window and version are required")
	}
	return nil
}

func CanTransition(from, to CampaignStatus) bool {
	if from == to {
		return true
	}
	allowed := map[CampaignStatus]map[CampaignStatus]bool{
		StatusDraft:           {StatusValidating: true, StatusArchived: true},
		StatusValidating:      {StatusReview: true, StatusRejected: true, StatusDraft: true},
		StatusReview:          {StatusScheduled: true, StatusRejected: true, StatusSuspended: true},
		StatusScheduled:       {StatusActive: true, StatusPaused: true, StatusEnded: true, StatusSuspended: true},
		StatusActive:          {StatusPaused: true, StatusEnded: true, StatusBudgetExhausted: true, StatusPaymentHold: true, StatusSuspended: true},
		StatusPaused:          {StatusActive: true, StatusEnded: true, StatusArchived: true, StatusSuspended: true},
		StatusEnded:           {StatusArchived: true},
		StatusRejected:        {StatusDraft: true, StatusArchived: true},
		StatusBudgetExhausted: {StatusArchived: true},
		StatusPaymentHold:     {StatusActive: true, StatusPaused: true, StatusEnded: true, StatusSuspended: true},
		StatusSuspended:       {StatusReview: true, StatusPaused: true, StatusEnded: true, StatusArchived: true},
	}
	return allowed[from][to]
}

func (c Campaign) ServesAt(now time.Time) bool {
	return c.PolicyStatus == "approved" && c.Status == StatusActive && now.Before(c.EndsAt) && !now.Before(c.StartsAt)
}
