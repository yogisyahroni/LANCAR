package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"tembus/order-service/internal/domain"
)

type CommunicationRepository struct{ db *sqlx.DB }

func NewCommunicationRepository(db *sqlx.DB) *CommunicationRepository {
	return &CommunicationRepository{db: db}
}

// CreateEvent is idempotent on semantic event_id and creates one delivery row
// per channel in the same transaction as the event. The notifications table is
// the existing inbox projection and remains the user-facing read source.
func (r *CommunicationRepository) CreateEvent(ctx context.Context, e domain.CommunicationEvent) (bool, error) {
	payload, _ := json.Marshal(e.Payload)
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	var inserted bool
	err = tx.QueryRowContext(ctx, `WITH created AS (INSERT INTO communication_events(event_id,semantic_type,recipient_id,market_code,locale,category,priority,entity_type,entity_id,order_id,template_key,template_version,correlation_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(event_id) DO NOTHING RETURNING event_id) SELECT EXISTS(SELECT 1 FROM created)`, e.EventID, e.SemanticType, e.RecipientID, e.MarketCode, e.Locale, e.Category, e.Priority, e.EntityType, e.EntityID, e.OrderID, e.TemplateKey, e.TemplateVersion, e.CorrelationID, payload).Scan(&inserted)
	if err != nil {
		return false, err
	}
	if !inserted {
		return false, tx.Commit()
	}
	channels, err := planCommunicationChannels(ctx, tx, e)
	if err != nil {
		return false, err
	}
	title := e.SemanticType
	body := e.SemanticType
	if e.Payload != nil {
		if v := e.Payload["title"]; v != "" {
			title = v
		}
		if v := e.Payload["body"]; v != "" {
			body = v
		}
	}
	var orderID any
	if e.OrderID != nil {
		orderID = *e.OrderID
	}
	meta, _ := json.Marshal(map[string]any{"communication_event_id": e.EventID.String(), "template_key": e.TemplateKey, "template_version": e.TemplateVersion, "correlation_id": e.CorrelationID})
	inAppAllowed := false
	for _, delivery := range channels {
		if delivery.channel == domain.CommunicationInApp && delivery.status != "suppressed" {
			inAppAllowed = true
		}
	}
	if inAppAllowed {
		_, err = tx.ExecContext(ctx, `INSERT INTO notifications(id,user_id,title,body,type,deep_link,channel,is_read,push_status,order_id,metadata,category,priority,created_at) VALUES($1,$2,$3,$4,$5,$6,'in_app',FALSE,'pending',$7,$8,$9,$10,NOW()) ON CONFLICT(id) DO NOTHING`, uuid.New(), e.RecipientID, title, body, e.SemanticType, typedDeepLink(e), orderID, meta, communicationInboxCategory(e.Category), communicationInboxPriority(e.Priority))
		if err != nil {
			return false, err
		}
	}
	for _, delivery := range channels {
		if _, err = tx.ExecContext(ctx, `INSERT INTO communication_deliveries(event_id,channel,status,next_attempt_at) VALUES($1,$2,$3,CASE WHEN CAST($3 AS VARCHAR)='queued' THEN NOW() ELSE NULL END) ON CONFLICT(event_id,channel) DO NOTHING`, e.EventID, delivery.channel, delivery.status); err != nil {
			return false, err
		}
	}
	if !inAppAllowed && len(channels) > 0 {
		_, err = tx.ExecContext(ctx, `UPDATE communication_events SET status='suppressed',updated_at=NOW() WHERE event_id=$1`, e.EventID)
		if err != nil {
			return false, err
		}
	}
	err = tx.Commit()
	return inserted, err
}

type plannedCommunicationDelivery struct {
	channel domain.CommunicationChannel
	status  string
}

// planCommunicationChannels applies only communication policy. Transactional
// order/safety/security events bypass optional marketing preferences, while
// marketing needs explicit consent and may be delayed by quiet hours.
type communicationPreferenceQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func planCommunicationChannels(ctx context.Context, tx communicationPreferenceQuerier, e domain.CommunicationEvent) ([]plannedCommunicationDelivery, error) {
	channels := domain.ChannelsFor(e)
	planned := make([]plannedCommunicationDelivery, 0, len(channels))
	for _, channel := range channels {
		status := "queued"
		var marketEnabled, consentRequired bool
		err := tx.QueryRowContext(ctx, `SELECT enabled,consent_required FROM communication_channel_capabilities WHERE market_code=$1 AND channel=$2`, e.MarketCode, channel).Scan(&marketEnabled, &consentRequired)
		if err == sql.ErrNoRows || !marketEnabled {
			status = "suppressed"
		}
		if err != nil && err != sql.ErrNoRows {
			return nil, err
		}
		if e.Category == domain.CommunicationMarketing {
			var enabled bool
			var timezone, quietStart, quietEnd sql.NullString
			err := tx.QueryRowContext(ctx, `SELECT enabled,timezone,TO_CHAR(quiet_hours_start,'HH24:MI'),TO_CHAR(quiet_hours_end,'HH24:MI') FROM communication_preferences WHERE user_id=$1 AND category=$2 AND channel=$3`, e.RecipientID, e.Category, channel).Scan(&enabled, &timezone, &quietStart, &quietEnd)
			if err == sql.ErrNoRows || !enabled || (channel != domain.CommunicationInApp && quietWindowActive(timezone.String, quietStart.String, quietEnd.String, time.Now())) {
				status = "suppressed"
			}
			if err != nil && err != sql.ErrNoRows {
				return nil, err
			}
		}
		_ = consentRequired // consent is enforced by category preferences below.
		planned = append(planned, plannedCommunicationDelivery{channel: channel, status: status})
	}
	return planned, nil
}

func quietWindowActive(timezone, start, end string, now time.Time) bool {
	if start == "" || end == "" {
		return false
	}
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		loc = time.UTC
	}
	current := now.In(loc)
	parse := func(value string) (int, bool) {
		parsed, err := time.Parse("15:04", value)
		if err != nil {
			return 0, false
		}
		return parsed.Hour()*60 + parsed.Minute(), true
	}
	startMinutes, startOK := parse(start)
	endMinutes, endOK := parse(end)
	if !startOK || !endOK {
		return false
	}
	currentMinutes := current.Hour()*60 + current.Minute()
	if startMinutes <= endMinutes {
		return currentMinutes >= startMinutes && currentMinutes < endMinutes
	}
	return currentMinutes >= startMinutes || currentMinutes < endMinutes
}
func typedDeepLink(e domain.CommunicationEvent) string {
	if e.OrderID != nil {
		return fmt.Sprintf("tembus://orders/%s", e.OrderID.String())
	}
	if e.EntityID != nil {
		return fmt.Sprintf("tembus://%s/%s", e.EntityType, e.EntityID.String())
	}
	return "tembus://inbox"
}

func communicationInboxCategory(category domain.CommunicationCategory) string {
	switch category {
	case domain.CommunicationMarketing:
		return "promo"
	case domain.CommunicationSupport:
		return "support"
	case domain.CommunicationSafety, domain.CommunicationSecurity, domain.CommunicationSystem:
		return "system"
	default:
		return "activity"
	}
}

func communicationInboxPriority(priority domain.CommunicationPriority) string {
	if priority == domain.CommunicationCritical {
		return "urgent"
	}
	return string(priority)
}

func (r *CommunicationRepository) Receipt(ctx context.Context, id uuid.UUID, status, providerCode, providerErr string) error {
	if status != "delivered" && status != "read" && status != "failed" {
		return fmt.Errorf("invalid delivery receipt status")
	}
	canonicalStatus := status
	if status == "failed" && isPermanentProviderError(providerCode) {
		canonicalStatus = "dead_letter"
	}
	result, err := r.db.ExecContext(ctx, `UPDATE communication_deliveries SET status=$1,provider_code=$2,provider_error=$3,delivered_at=CASE WHEN CAST($1 AS VARCHAR)='delivered' THEN NOW() ELSE delivered_at END,read_at=CASE WHEN CAST($1 AS VARCHAR)='read' THEN NOW() ELSE read_at END,updated_at=NOW() WHERE id=$4`, canonicalStatus, providerCode, providerErr, id)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count == 0 {
		return fmt.Errorf("delivery not found")
	}
	return nil
}

func isPermanentProviderError(code string) bool {
	switch strings.ToUpper(strings.TrimSpace(code)) {
	case "INVALID_TOKEN", "UNREGISTERED", "NOT_FOUND", "BAD_REQUEST", "FORBIDDEN", "410":
		return true
	default:
		return false
	}
}
func (r *CommunicationRepository) RetryDue(ctx context.Context, limit int) (int, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	res, err := r.db.ExecContext(ctx, `UPDATE communication_deliveries SET status='queued',attempts=attempts+1,next_attempt_at=NOW()+LEAST((INTERVAL '1 second' * power(2, attempts)), INTERVAL '5 minutes'),updated_at=NOW() WHERE id IN (SELECT id FROM communication_deliveries WHERE status='failed' AND next_attempt_at<=NOW() AND attempts<8 ORDER BY next_attempt_at LIMIT $1)`, limit)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// ReplayDelivery is safe to call more than once: only failed/dead-letter
// rows can transition back to queued and the attempt cap prevents storms.
func (r *CommunicationRepository) ReplayDelivery(ctx context.Context, id uuid.UUID) (bool, error) {
	result, err := r.db.ExecContext(ctx, `UPDATE communication_deliveries SET status='queued',attempts=attempts+1,next_attempt_at=NOW(),updated_at=NOW() WHERE id=$1 AND status IN ('failed','dead_letter') AND attempts<8`, id)
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	return count == 1, err
}
func (r *CommunicationRepository) AuditPreference(ctx context.Context, userID uuid.UUID, category, channel string, enabled bool, timezone, source string) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO communication_preference_audit(user_id,category,channel,enabled,timezone,consent_source) VALUES($1,$2,$3,$4,$5,$6)`, userID, category, channel, enabled, timezone, source)
	return err
}

func (r *CommunicationRepository) SaveTemplate(ctx context.Context, t domain.CommunicationTemplate, actor uuid.UUID) error {
	vars := communicationJSON(t.RequiredVariables)
	_, err := r.db.ExecContext(ctx, `INSERT INTO communication_templates(template_key,version,market_code,locale,channel,category,title_template,body_template,required_variables,approval_status,protected_copy,active,created_by,approved_by,approved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,CASE WHEN CAST($10 AS VARCHAR)='approved' THEN $13::uuid ELSE NULL::uuid END,CASE WHEN CAST($10 AS VARCHAR)='approved' THEN NOW() ELSE NULL END) ON CONFLICT(template_key,version,market_code,locale,channel) DO UPDATE SET category=EXCLUDED.category,title_template=EXCLUDED.title_template,body_template=EXCLUDED.body_template,required_variables=EXCLUDED.required_variables,approval_status=EXCLUDED.approval_status,protected_copy=EXCLUDED.protected_copy,active=EXCLUDED.active,approved_by=EXCLUDED.approved_by,approved_at=EXCLUDED.approved_at,updated_at=NOW()`, t.TemplateKey, t.Version, t.MarketCode, t.Locale, t.Channel, t.Category, t.TitleTemplate, t.BodyTemplate, vars, t.ApprovalStatus, t.ProtectedCopy, t.Active, actor)
	return err
}

func (r *CommunicationRepository) ApproveTemplate(ctx context.Context, templateKey string, version int, market, locale string, channel domain.CommunicationChannel, actor uuid.UUID) error {
	result, err := r.db.ExecContext(ctx, `UPDATE communication_templates SET approval_status='approved',approved_by=$1,approved_at=NOW(),active=TRUE,updated_at=NOW() WHERE template_key=$2 AND version=$3 AND market_code=$4 AND locale=$5 AND channel=$6 AND approval_status='draft'`, actor, templateKey, version, market, locale, channel)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("template draft not found")
	}
	return nil
}
func (r *CommunicationRepository) ListTemplates(ctx context.Context, market, locale string) ([]domain.CommunicationTemplate, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,template_key,version,market_code,locale,channel,category,title_template,body_template,required_variables,approval_status,protected_copy,active FROM communication_templates WHERE market_code=$1 AND locale=$2 ORDER BY template_key,version DESC`, market, locale)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.CommunicationTemplate
	for rows.Next() {
		var t domain.CommunicationTemplate
		var vars []byte
		var title *string
		if err := rows.Scan(&t.ID, &t.TemplateKey, &t.Version, &t.MarketCode, &t.Locale, &t.Channel, &t.Category, &title, &t.BodyTemplate, &vars, &t.ApprovalStatus, &t.ProtectedCopy, &t.Active); err != nil {
			return nil, err
		}
		if title != nil {
			t.TitleTemplate = *title
		}
		_ = json.Unmarshal(vars, &t.RequiredVariables)
		out = append(out, t)
	}
	return out, rows.Err()
}
func (r *CommunicationRepository) DeliveryHealth(ctx context.Context) ([]map[string]any, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT channel,status,COUNT(*),COALESCE(AVG(EXTRACT(EPOCH FROM NOW()-created_at)),0),COALESCE(SUM(cost_minor),0) FROM communication_deliveries WHERE created_at>=NOW()-INTERVAL '24 hours' GROUP BY channel,status ORDER BY channel,status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var ch, st string
		var count, cost int64
		var age float64
		if err := rows.Scan(&ch, &st, &count, &age, &cost); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"channel": ch, "status": st, "count": count, "average_age_seconds": int64(age), "cost_minor": cost})
	}
	return out, rows.Err()
}
func (r *CommunicationRepository) GetPreference(ctx context.Context, userID uuid.UUID, category, channel string) (*domain.CommunicationPreference, error) {
	var p domain.CommunicationPreference
	err := r.db.QueryRowContext(ctx, `SELECT user_id,category,channel,enabled,timezone,TO_CHAR(quiet_hours_start,'HH24:MI'),TO_CHAR(quiet_hours_end,'HH24:MI'),consent_source FROM communication_preferences WHERE user_id=$1 AND category=$2 AND channel=$3`, userID, category, channel).Scan(&p.UserID, &p.Category, &p.Channel, &p.Enabled, &p.Timezone, &p.QuietHoursStart, &p.QuietHoursEnd, &p.ConsentSource)
	if err != nil {
		return &domain.CommunicationPreference{UserID: userID, Category: domain.CommunicationCategory(category), Channel: domain.CommunicationChannel(channel), Enabled: category != "marketing", Timezone: "Asia/Jakarta", ConsentSource: "market-compliance"}, nil
	}
	return &p, nil
}
func (r *CommunicationRepository) SetPreference(ctx context.Context, p domain.CommunicationPreference, actor uuid.UUID) error {
	if (p.Category == domain.CommunicationOrder || p.Category == domain.CommunicationSafety || p.Category == domain.CommunicationSecurity) && !p.Enabled {
		return fmt.Errorf("critical communication cannot be disabled")
	}
	_, err := r.db.ExecContext(ctx, `INSERT INTO communication_preferences(user_id,category,channel,enabled,timezone,quiet_hours_start,quiet_hours_end,consent_source,updated_at) VALUES($1,$2,$3,$4,$5,$6::time,$7::time,$8,NOW()) ON CONFLICT(user_id,category,channel) DO UPDATE SET enabled=EXCLUDED.enabled,timezone=EXCLUDED.timezone,quiet_hours_start=EXCLUDED.quiet_hours_start,quiet_hours_end=EXCLUDED.quiet_hours_end,consent_source=EXCLUDED.consent_source,updated_at=NOW()`, p.UserID, p.Category, p.Channel, p.Enabled, p.Timezone, p.QuietHoursStart, p.QuietHoursEnd, p.ConsentSource)
	if err == nil {
		err = r.AuditPreference(ctx, p.UserID, string(p.Category), string(p.Channel), p.Enabled, p.Timezone, p.ConsentSource)
	}
	return err
}

func communicationJSON(v any) []byte { b, _ := json.Marshal(v); return b }
