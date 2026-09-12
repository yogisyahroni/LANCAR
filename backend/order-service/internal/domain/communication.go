package domain

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

type CommunicationCategory string

const (
	CommunicationOrder     CommunicationCategory = "order"
	CommunicationSafety    CommunicationCategory = "safety"
	CommunicationSecurity  CommunicationCategory = "security"
	CommunicationSupport   CommunicationCategory = "support"
	CommunicationSystem    CommunicationCategory = "system"
	CommunicationMarketing CommunicationCategory = "marketing"
)

type CommunicationPriority string

const (
	CommunicationLow      CommunicationPriority = "low"
	CommunicationNormal   CommunicationPriority = "normal"
	CommunicationHigh     CommunicationPriority = "high"
	CommunicationCritical CommunicationPriority = "critical"
)

type CommunicationChannel string

const (
	CommunicationInApp      CommunicationChannel = "in_app"
	CommunicationPush       CommunicationChannel = "push"
	CommunicationSMS        CommunicationChannel = "sms"
	CommunicationEmail      CommunicationChannel = "email"
	CommunicationWhatsApp   CommunicationChannel = "whatsapp"
	CommunicationMaskedCall CommunicationChannel = "masked_call"
)

type CommunicationEvent struct {
	EventID         uuid.UUID             `json:"event_id"`
	SemanticType    string                `json:"semantic_type"`
	RecipientID     uuid.UUID             `json:"recipient_id"`
	MarketCode      string                `json:"market_code"`
	Locale          string                `json:"locale"`
	Category        CommunicationCategory `json:"category"`
	Priority        CommunicationPriority `json:"priority"`
	EntityType      string                `json:"entity_type,omitempty"`
	EntityID        *uuid.UUID            `json:"entity_id,omitempty"`
	OrderID         *uuid.UUID            `json:"order_id,omitempty"`
	TemplateKey     string                `json:"template_key"`
	TemplateVersion int                   `json:"template_version"`
	CorrelationID   string                `json:"correlation_id"`
	Payload         map[string]string     `json:"payload,omitempty"`
}

type CommunicationTemplate struct {
	ID                string                `json:"id,omitempty"`
	TemplateKey       string                `json:"template_key"`
	Version           int                   `json:"version"`
	MarketCode        string                `json:"market_code"`
	Locale            string                `json:"locale"`
	Channel           CommunicationChannel  `json:"channel"`
	Category          CommunicationCategory `json:"category"`
	TitleTemplate     string                `json:"title_template,omitempty"`
	BodyTemplate      string                `json:"body_template"`
	RequiredVariables []string              `json:"required_variables,omitempty"`
	ApprovalStatus    string                `json:"approval_status"`
	ProtectedCopy     bool                  `json:"protected_copy"`
	Active            bool                  `json:"active"`
}

type CommunicationPreference struct {
	UserID          uuid.UUID             `json:"user_id"`
	Category        CommunicationCategory `json:"category"`
	Channel         CommunicationChannel  `json:"channel"`
	Enabled         bool                  `json:"enabled"`
	Timezone        string                `json:"timezone"`
	QuietHoursStart *string               `json:"quiet_hours_start,omitempty"`
	QuietHoursEnd   *string               `json:"quiet_hours_end,omitempty"`
	ConsentSource   string                `json:"consent_source"`
}

func (t CommunicationTemplate) Validate() error {
	if strings.TrimSpace(t.TemplateKey) == "" || t.Version < 1 || strings.TrimSpace(t.MarketCode) == "" || strings.TrimSpace(t.Locale) == "" || strings.TrimSpace(t.BodyTemplate) == "" {
		return errors.New("template key/version/market/locale/body are required")
	}
	if t.ApprovalStatus != "draft" && t.ApprovalStatus != "approved" && t.ApprovalStatus != "retired" {
		return errors.New("invalid template approval status")
	}
	if t.ProtectedCopy && t.ApprovalStatus != "approved" {
		return errors.New("protected copy requires approved status")
	}
	for _, variable := range t.RequiredVariables {
		if strings.TrimSpace(variable) == "" || !strings.Contains(t.BodyTemplate, "{{"+variable+"}}") {
			return errors.New("required template variable is missing from body")
		}
	}
	return nil
}

func (e CommunicationEvent) Validate() error {
	if e.EventID == uuid.Nil || e.RecipientID == uuid.Nil {
		return errors.New("event_id and recipient_id are required")
	}
	if strings.TrimSpace(e.SemanticType) == "" || strings.TrimSpace(e.TemplateKey) == "" || strings.TrimSpace(e.CorrelationID) == "" {
		return errors.New("semantic_type, template_key and correlation_id are required")
	}
	if strings.TrimSpace(e.MarketCode) == "" || strings.TrimSpace(e.Locale) == "" {
		return errors.New("market_code and locale are required")
	}
	if e.TemplateVersion < 1 {
		return errors.New("template_version must be positive")
	}
	switch e.Category {
	case CommunicationOrder, CommunicationSafety, CommunicationSecurity, CommunicationSupport, CommunicationSystem, CommunicationMarketing:
	default:
		return errors.New("invalid communication category")
	}
	switch e.Priority {
	case CommunicationLow, CommunicationNormal, CommunicationHigh, CommunicationCritical:
	default:
		return errors.New("invalid communication priority")
	}
	return nil
}

func ChannelsFor(e CommunicationEvent) []CommunicationChannel {
	if e.Category == CommunicationMarketing {
		return []CommunicationChannel{CommunicationInApp, CommunicationPush}
	}
	if e.Priority == CommunicationCritical || e.Category == CommunicationOrder || e.Category == CommunicationSafety || e.Category == CommunicationSecurity {
		return []CommunicationChannel{CommunicationInApp, CommunicationPush}
	}
	return []CommunicationChannel{CommunicationInApp, CommunicationPush}
}

// FallbackChain is policy-only: adapters may execute this ordered list, but
// they never turn a missing vendor capability into a fake success. Marketing
// is intentionally limited to consented in-app/push delivery.
func FallbackChain(e CommunicationEvent, primary CommunicationChannel) []CommunicationChannel {
	chain := []CommunicationChannel{primary}
	if primary == CommunicationInApp {
		return chain
	}
	if e.Category == CommunicationMarketing {
		return append(chain, CommunicationInApp)
	}
	if e.Category == CommunicationOrder || e.Category == CommunicationSafety || e.Category == CommunicationSecurity || e.Priority == CommunicationCritical {
		return append(chain, CommunicationInApp)
	}
	return append(chain, CommunicationPush, CommunicationInApp)
}

type DeliveryDecision struct {
	Retry      bool
	DeadLetter bool
	Delay      time.Duration
}

func ClassifyDelivery(statusCode int, attempts int) DeliveryDecision {
	if statusCode >= 200 && statusCode < 300 {
		return DeliveryDecision{}
	}
	// Invalid token, malformed request and consent/policy errors are permanent.
	if statusCode == 400 || statusCode == 401 || statusCode == 403 || statusCode == 404 || statusCode == 410 || statusCode == 422 {
		return DeliveryDecision{DeadLetter: true}
	}
	if attempts >= 8 {
		return DeliveryDecision{DeadLetter: true}
	}
	delay := time.Second * time.Duration(1<<min(attempts, 6))
	if delay > 5*time.Minute {
		delay = 5 * time.Minute
	}
	return DeliveryDecision{Retry: true, Delay: delay}
}
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
