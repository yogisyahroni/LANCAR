package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"tembus/search-service/internal/domain"

	"github.com/google/uuid"
)

type Repository struct{ db *sql.DB }

func New(db *sql.DB) *Repository { return &Repository{db: db} }

func (r *Repository) Search(ctx context.Context, q domain.Query, intent domain.Intent) ([]domain.Document, error) {
	limit := q.Limit
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	offset := q.Offset
	if offset < 0 {
		offset = 0
	}
	market := q.MarketCode
	if market == "" {
		market = "id-jk"
	}
	locale := q.Locale
	if locale == "" {
		locale = "id-ID"
	}
	rules, err := r.activeRules(ctx, market, locale, intent.CanonicalQuery)
	if err != nil {
		return nil, err
	}
	text := "%" + strings.ReplaceAll(intent.CanonicalQuery, "%", "") + "%"
	args := []any{market, locale, text}
	where := `d.index_version=(SELECT index_version FROM search_index_aliases WHERE alias_name='search-read') AND d.market_code=$1 AND d.locale=$2 AND d.status='active' AND (d.title ILIKE $3 OR d.searchable_text ILIKE $3)`
	arg := 4
	if intent.Service != "" {
		where += fmt.Sprintf(" AND d.service_code=$%d", arg)
		args = append(args, intent.Service)
		arg++
	}
	if q.OpenNow {
		where += " AND COALESCE(d.open_now, TRUE)=TRUE"
	}
	if q.Latitude != 0 || q.Longitude != 0 {
		radius := q.RadiusM
		if radius <= 0 {
			radius = 25000
		}
		where += fmt.Sprintf(" AND (d.geography IS NULL OR ST_DWithin(d.geography, ST_SetSRID(ST_MakePoint($%d,$%d),4326)::geography,$%d))", arg, arg+1, arg+2)
		args = append(args, q.Longitude, q.Latitude, radius)
		arg += 3
	}
	query := `SELECT entity_id, entity_type, market_code, locale, status, COALESCE(service_code,''), title, canonical_route, open_now, source_version, updated_at FROM search_documents d WHERE ` + where + ` ORDER BY (CASE WHEN lower(title)=lower($3) THEN 1 ELSE 0 END) DESC, quality_score DESC, updated_at DESC LIMIT $` + fmt.Sprint(arg) + ` OFFSET $` + fmt.Sprint(arg+1)
	args = append(args, limit, offset)
	fetchLimit := limit + len(rules) + 20
	if fetchLimit > 100 {
		fetchLimit = 100
	}
	args[len(args)-2] = fetchLimit
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []domain.Document{}
	for rows.Next() {
		var item domain.Document
		if err := rows.Scan(&item.EntityID, &item.EntityType, &item.MarketCode, &item.Locale, &item.Status, &item.ServiceCode, &item.Title, &item.CanonicalRoute, &item.OpenNow, &item.SourceVersion, &item.UpdatedAt); err != nil {
			return nil, err
		}
		item.Available = item.Status == "active"
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	items = applyMerchandisingRules(items, rules, q, intent)
	if len(items) > limit {
		items = items[:limit]
	}
	return items, nil
}

// ResolveIntent layers reviewed, market/locale-scoped aliases over the
// deterministic built-in spellings. If the config table is unavailable the
// handler keeps the built-in intent as a safe discovery fallback.
func (r *Repository) ResolveIntent(ctx context.Context, raw, market, locale string) (domain.Intent, error) {
	intent := domain.Understand(raw, locale)
	canonical := domain.Normalize(raw)
	rows, err := r.db.QueryContext(ctx, `SELECT term,canonical_term FROM search_synonyms WHERE market_code=$1 AND locale=$2 AND active=TRUE AND reviewed=TRUE ORDER BY length(term) DESC`, market, locale)
	if err != nil {
		return intent, err
	}
	defer rows.Close()
	for rows.Next() {
		var term, replacement string
		if err := rows.Scan(&term, &replacement); err != nil {
			return intent, err
		}
		term, replacement = domain.Normalize(term), domain.Normalize(replacement)
		if term != "" && replacement != "" {
			canonical = strings.ReplaceAll(canonical, term, replacement)
		}
	}
	if err := rows.Err(); err != nil {
		return intent, err
	}
	resolved := domain.Understand(canonical, locale)
	resolved.CanonicalQuery = canonical
	return resolved, nil
}

func (r *Repository) activeRules(ctx context.Context, market, locale, queryTerm string) ([]domain.MerchandisingRule, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,market_code,locale,query_term,entity_id::text,action,reason,scope,expires_at,reviewed,active FROM search_merchandising_rules WHERE market_code=$1 AND locale=$2 AND query_term=$3 AND active=TRUE AND reviewed=TRUE AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY updated_at DESC`, market, locale, queryTerm)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.MerchandisingRule
	for rows.Next() {
		var rule domain.MerchandisingRule
		var scope []byte
		if err := rows.Scan(&rule.ID, &rule.MarketCode, &rule.Locale, &rule.QueryTerm, &rule.EntityID, &rule.Action, &rule.Reason, &scope, &rule.ExpiresAt, &rule.Reviewed, &rule.Active); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(scope, &rule.Scope)
		out = append(out, rule)
	}
	return out, rows.Err()
}

func applyMerchandisingRules(items []domain.Document, rules []domain.MerchandisingRule, q domain.Query, intent domain.Intent) []domain.Document {
	if len(rules) == 0 {
		return items
	}
	byID := make(map[string]domain.Document, len(items))
	for _, item := range items {
		byID[item.EntityID] = item
	}
	allowed := func(rule domain.MerchandisingRule) bool {
		if rule.Scope == nil {
			return true
		}
		if service := rule.Scope["service_code"]; service != "" && service != intent.Service && service != q.Service {
			return false
		}
		if open := rule.Scope["open_now"]; open != "" && ((open == "true") != q.OpenNow) {
			return false
		}
		return true
	}
	excluded, promoted := map[string]bool{}, map[string]int{}
	for _, rule := range rules {
		if !allowed(rule) {
			continue
		}
		switch rule.Action {
		case "exclude":
			excluded[rule.EntityID] = true
		case "pin":
			promoted[rule.EntityID] = 0
		case "boost":
			if _, exists := promoted[rule.EntityID]; !exists {
				promoted[rule.EntityID] = 1
			}
		}
	}
	result := make([]domain.Document, 0, len(items))
	for _, item := range items {
		if !excluded[item.EntityID] {
			if _, isPromoted := promoted[item.EntityID]; isPromoted {
				continue
			}
			result = append(result, item)
		}
	}
	// Stable promotion keeps the organic order for all non-promoted results.
	promotedItems := make([]domain.Document, 0, len(promoted))
	for id, rank := range promoted {
		if item, ok := byID[id]; ok && !excluded[id] {
			item.RankScore += float64(1 - rank)
			promotedItems = append(promotedItems, item)
		}
	}
	sort.SliceStable(promotedItems, func(i, j int) bool { return promotedItems[i].RankScore > promotedItems[j].RankScore })
	return append(promotedItems, result...)
}

func (r *Repository) SaveQueryEvent(ctx context.Context, userID, query string, q domain.Query, intent domain.Intent, resultCount, latency int) error {
	var id any
	if parsed, err := uuid.Parse(userID); err == nil {
		id = parsed
	}
	_, err := r.db.ExecContext(ctx, `INSERT INTO search_query_events(user_id,query_hash,market_code,locale,intent,result_count,organic_count,ranking_version,latency_ms) VALUES($1,$2,$3,$4,$5,$6,$6,'organic-v1',$7)`, id, domain.HashQuery(query), q.MarketCode, q.Locale, intent.Service, resultCount, latency)
	return err
}

func (r *Repository) History(ctx context.Context, userID string) ([]string, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT query_label FROM search_history WHERE user_id=$1 ORDER BY last_used_at DESC LIMIT 20`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}
func (r *Repository) SaveHistory(ctx context.Context, userID, label string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return err
	}
	label = domain.Normalize(label)
	if label == "" || len(label) > 120 {
		return nil
	}
	_, err = r.db.ExecContext(ctx, `INSERT INTO search_history(user_id,query_hash,query_label) VALUES($1,$2,$3) ON CONFLICT(user_id,query_hash) DO UPDATE SET query_label=EXCLUDED.query_label,last_used_at=NOW()`, uid, domain.HashQuery(label), label)
	return err
}
func (r *Repository) ClearHistory(ctx context.Context, userID string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `DELETE FROM search_history WHERE user_id=$1`, uid)
	return err
}

func (r *Repository) ListSynonyms(ctx context.Context, market, locale string) ([]domain.Synonym, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,market_code,locale,term,canonical_term,kind,reviewed,active FROM search_synonyms WHERE market_code=$1 AND locale=$2 ORDER BY term`, market, locale)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Synonym
	for rows.Next() {
		var v domain.Synonym
		if err := rows.Scan(&v.ID, &v.MarketCode, &v.Locale, &v.Term, &v.CanonicalTerm, &v.Kind, &v.Reviewed, &v.Active); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (r *Repository) ListRules(ctx context.Context, market, locale string) ([]domain.MerchandisingRule, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,market_code,locale,query_term,entity_id::text,action,reason,scope,expires_at,reviewed,active FROM search_merchandising_rules WHERE market_code=$1 AND locale=$2 ORDER BY query_term,updated_at DESC`, market, locale)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.MerchandisingRule
	for rows.Next() {
		var v domain.MerchandisingRule
		var scope []byte
		if err := rows.Scan(&v.ID, &v.MarketCode, &v.Locale, &v.QueryTerm, &v.EntityID, &v.Action, &v.Reason, &scope, &v.ExpiresAt, &v.Reviewed, &v.Active); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(scope, &v.Scope)
		out = append(out, v)
	}
	return out, rows.Err()
}

func (r *Repository) Quality(ctx context.Context, market, locale string) (map[string]any, error) {
	var volume, zero int64
	var average float64
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*),COUNT(*) FILTER (WHERE result_count=0),COALESCE(AVG(latency_ms),0) FROM search_query_events WHERE market_code=$1 AND locale=$2 AND created_at>=NOW()-INTERVAL '24 hours'`, market, locale).Scan(&volume, &zero, &average); err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT entity_type,COUNT(*),COALESCE(EXTRACT(EPOCH FROM MAX(NOW()-indexed_at)),0) FROM search_documents WHERE market_code=$1 AND locale=$2 AND index_version=(SELECT index_version FROM search_index_aliases WHERE alias_name='search-read') GROUP BY entity_type ORDER BY entity_type`, market, locale)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byType := make([]map[string]any, 0)
	for rows.Next() {
		var entityType string
		var count int64
		var ageSeconds float64
		if err := rows.Scan(&entityType, &count, &ageSeconds); err != nil {
			return nil, err
		}
		byType = append(byType, map[string]any{"entity_type": entityType, "document_count": count, "max_index_age_seconds": int64(ageSeconds)})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rate := float64(0)
	if volume > 0 {
		rate = float64(zero) / float64(volume)
	}
	return map[string]any{"window": "24h", "query_volume": volume, "zero_result_rate": rate, "average_latency_ms": average, "freshness_by_entity_type": byType}, nil
}

func (r *Repository) SaveSynonym(ctx context.Context, v domain.Synonym, actor string) error {
	id, _ := uuid.Parse(actor)
	_, err := r.db.ExecContext(ctx, `INSERT INTO search_synonyms(market_code,locale,term,canonical_term,kind,reviewed,active,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW()) ON CONFLICT(market_code,locale,term) DO UPDATE SET canonical_term=EXCLUDED.canonical_term,kind=EXCLUDED.kind,reviewed=EXCLUDED.reviewed,active=EXCLUDED.active,updated_by=EXCLUDED.updated_by,updated_at=NOW()`, v.MarketCode, v.Locale, v.Term, v.CanonicalTerm, v.Kind, v.Reviewed, v.Active, id)
	return err
}
func (r *Repository) SaveRule(ctx context.Context, v domain.MerchandisingRule, actor string) error {
	id, err := uuid.Parse(actor)
	if err != nil {
		return err
	}
	eid, err := uuid.Parse(v.EntityID)
	if err != nil {
		return err
	}
	scope := mustJSON(v.Scope)
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	var ruleID uuid.UUID
	err = tx.QueryRowContext(ctx, `INSERT INTO search_merchandising_rules(market_code,locale,query_term,entity_id,action,reason,scope,expires_at,reviewed,active,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) RETURNING id`, v.MarketCode, v.Locale, v.QueryTerm, eid, v.Action, v.Reason, scope, v.ExpiresAt, v.Reviewed, v.Active, id).Scan(&ruleID)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO search_merchandising_audit(rule_id,actor_id,action,reason,scope,expires_at) VALUES($1,$2,$3,$4,$5,$6)`, ruleID, id, v.Action, v.Reason, scope, v.ExpiresAt)
	if err != nil {
		return err
	}
	err = tx.Commit()
	return err
}
func (r *Repository) ApplyIndexEvent(ctx context.Context, eventID string, doc domain.Document, searchable string) (bool, error) {
	eid, err := uuid.Parse(eventID)
	if err != nil {
		return false, err
	}
	did, err := uuid.Parse(doc.EntityID)
	if err != nil {
		return false, err
	}
	var inserted bool
	err = r.db.QueryRowContext(ctx, `WITH claimed AS (INSERT INTO search_index_events(event_id,entity_id,entity_type,source_version,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING event_id) SELECT EXISTS(SELECT 1 FROM claimed)`, eid, did, doc.EntityType, doc.SourceVersion, mustJSON(doc)).Scan(&inserted)
	if err != nil || !inserted {
		return inserted, err
	}
	_, err = r.db.ExecContext(ctx, `INSERT INTO search_documents(entity_id,entity_type,market_code,locale,status,service_code,title,searchable_text,canonical_route,geography,serviceability,open_now,source_version,index_version,quality_score,updated_at,indexed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN CAST($10 AS DOUBLE PRECISION) IS NULL OR CAST($11 AS DOUBLE PRECISION) IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(CAST($10 AS DOUBLE PRECISION),CAST($11 AS DOUBLE PRECISION)),4326)::geography END,$12,$13,$14,$15,0,$16,NOW()) ON CONFLICT(entity_id,entity_type,market_code,locale,index_version) DO UPDATE SET status=EXCLUDED.status,service_code=EXCLUDED.service_code,title=EXCLUDED.title,searchable_text=EXCLUDED.searchable_text,canonical_route=EXCLUDED.canonical_route,geography=EXCLUDED.geography,serviceability=EXCLUDED.serviceability,open_now=EXCLUDED.open_now,source_version=EXCLUDED.source_version,updated_at=EXCLUDED.updated_at,indexed_at=NOW() WHERE EXCLUDED.source_version >= search_documents.source_version`, did, doc.EntityType, doc.MarketCode, doc.Locale, doc.Status, doc.ServiceCode, doc.Title, searchable, doc.CanonicalRoute, doc.Longitude, doc.Latitude, mustJSON(doc.Serviceability), doc.OpenNow, doc.SourceVersion, domain.CurrentIndexVersion, doc.UpdatedAt)
	return true, err
}
func (r *Repository) Rebuild(ctx context.Context, version string) error {
	if version == "" {
		version = domain.CurrentIndexVersion
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	// Snapshot authoritative merchant/catalog tables into a new version. No
	// price/rating/ETA fields are copied into the projection, so stale search
	// documents can never invent transactional truth.
	_, err = tx.ExecContext(ctx, `
		INSERT INTO search_documents(entity_id,entity_type,market_code,locale,status,service_code,title,searchable_text,canonical_route,geography,open_now,source_version,index_version,updated_at,indexed_at)
		SELECT m.id,'merchant','id-jk','id-ID',CASE WHEN m.verification_status='approved' THEN 'active' ELSE 'inactive' END,
		'food_delivery',m.nama_toko,COALESCE(m.alamat,''),'tembus://merchant/'||m.id,m.lokasi,m.is_open,EXTRACT(EPOCH FROM m.updated_at)::bigint,$1,m.updated_at,NOW()
		FROM merchants m
		ON CONFLICT(entity_id,entity_type,market_code,locale,index_version) DO UPDATE SET status=EXCLUDED.status,title=EXCLUDED.title,searchable_text=EXCLUDED.searchable_text,geography=EXCLUDED.geography,open_now=EXCLUDED.open_now,source_version=EXCLUDED.source_version,updated_at=EXCLUDED.updated_at,indexed_at=NOW()`, version)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO search_documents(entity_id,entity_type,market_code,locale,status,service_code,title,searchable_text,canonical_route,geography,open_now,source_version,index_version,updated_at,indexed_at)
		SELECT i.id,'food_item','id-jk','id-ID',CASE WHEN i.is_available AND m.verification_status='approved' THEN 'active' ELSE 'inactive' END,
		'food_delivery',i.nama,COALESCE(i.kategori,'')||' '||COALESCE(m.nama_toko,''),'tembus://food-item/'||i.id,m.lokasi,m.is_open,EXTRACT(EPOCH FROM i.updated_at)::bigint,$1,i.updated_at,NOW()
		FROM merchant_menu_items i JOIN merchants m ON m.id=i.merchant_id
		ON CONFLICT(entity_id,entity_type,market_code,locale,index_version) DO UPDATE SET status=EXCLUDED.status,title=EXCLUDED.title,searchable_text=EXCLUDED.searchable_text,geography=EXCLUDED.geography,open_now=EXCLUDED.open_now,source_version=EXCLUDED.source_version,updated_at=EXCLUDED.updated_at,indexed_at=NOW()`, version)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO search_index_aliases(alias_name,index_version,generation,switched_at) VALUES('search-read',$1,1,NOW()) ON CONFLICT(alias_name) DO UPDATE SET index_version=EXCLUDED.index_version,generation=search_index_aliases.generation+1,switched_at=NOW()`, version)
	if err != nil {
		return err
	}
	return tx.Commit()
}
func mustJSON(v any) []byte { b, _ := json.Marshal(v); return b }
