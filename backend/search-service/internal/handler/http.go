package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"tembus/search-service/internal/domain"
	"tembus/search-service/internal/repository"
)

type Handler struct{ repo *repository.Repository }

func New(repo *repository.Repository) *Handler { return &Handler{repo: repo} }
func write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"status": "success", "data": v})
}
func fail(w http.ResponseWriter, status int, msg string) {
	write(w, status, map[string]string{"code": "ERR_SEARCH", "message": msg})
}

func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	q := domain.Query{Text: r.URL.Query().Get("q"), MarketCode: r.URL.Query().Get("market_code"), Locale: r.URL.Query().Get("locale"), Service: r.URL.Query().Get("service"), OpenNow: r.URL.Query().Get("open_now") == "true"}
	q.Latitude, _ = strconv.ParseFloat(r.URL.Query().Get("lat"), 64)
	q.Longitude, _ = strconv.ParseFloat(r.URL.Query().Get("lng"), 64)
	q.RadiusM, _ = strconv.Atoi(r.URL.Query().Get("radius_m"))
	q.Limit, _ = strconv.Atoi(r.URL.Query().Get("limit"))
	q.Offset, _ = strconv.Atoi(r.URL.Query().Get("offset"))
	if strings.TrimSpace(q.Text) == "" {
		fail(w, http.StatusBadRequest, "q wajib diisi")
		return
	}
	intent := domain.Understand(q.Text, q.Locale)
	market := q.MarketCode
	if market == "" {
		market = "id-jk"
	}
	locale := q.Locale
	if locale == "" {
		locale = "id-ID"
	}
	q.MarketCode = market
	q.Locale = locale
	if resolved, resolveErr := h.repo.ResolveIntent(r.Context(), q.Text, market, locale); resolveErr == nil {
		intent = resolved
	}
	if q.Service == "" {
		q.Service = intent.Service
	} else if intent.Service == "" {
		intent.Service = q.Service
	}
	if intent.Filters["open_now"] == "true" {
		q.OpenNow = true
	}
	items, err := h.repo.Search(r.Context(), q, intent)
	if err != nil {
		fail(w, http.StatusServiceUnavailable, "search temporarily unavailable")
		return
	}
	userID := r.Header.Get("X-User-ID")
	_ = h.repo.SaveHistory(r.Context(), userID, q.Text)
	_ = h.repo.SaveQueryEvent(r.Context(), userID, q.Text, q, intent, len(items), int(time.Since(start).Milliseconds()))
	write(w, http.StatusOK, domain.Response{SchemaVersion: "search.v1", Query: q.Text, Intent: intent, Results: items, Total: len(items), RankingVersion: "organic-v1", OrganicOnly: true})
}
func (h *Handler) Autocomplete(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	own := []string{}
	if id := r.Header.Get("X-User-ID"); id != "" {
		own, _ = h.repo.History(r.Context(), id)
	}
	popular := []string{"ayam geprek", "tambal ban", "towing", "paket"}
	market, locale := r.URL.Query().Get("market_code"), r.URL.Query().Get("locale")
	if market == "" {
		market = "id-jk"
	}
	if locale == "" {
		locale = "id-ID"
	}
	if synonyms, err := h.repo.ListSynonyms(r.Context(), market, locale); err == nil {
		for _, synonym := range synonyms {
			if synonym.Active && synonym.Reviewed {
				popular = append(popular, synonym.Term, synonym.CanonicalTerm)
			}
		}
	}
	write(w, http.StatusOK, map[string]any{"schema_version": "search.autocomplete.v1", "suggestions": domain.Suggestions(q, own, popular)})
}
func (h *Handler) History(w http.ResponseWriter, r *http.Request) {
	id := r.Header.Get("X-User-ID")
	if id == "" {
		fail(w, 401, "unauthorized")
		return
	}
	items, err := h.repo.History(r.Context(), id)
	if err != nil {
		fail(w, 500, "history unavailable")
		return
	}
	write(w, 200, map[string]any{"items": items})
}
func (h *Handler) ClearHistory(w http.ResponseWriter, r *http.Request) {
	id := r.Header.Get("X-User-ID")
	if id == "" {
		fail(w, 401, "unauthorized")
		return
	}
	if err := h.repo.ClearHistory(r.Context(), id); err != nil {
		fail(w, 500, "history unavailable")
		return
	}
	write(w, 200, map[string]string{"status": "cleared"})
}
func (h *Handler) IndexEvent(w http.ResponseWriter, r *http.Request) {
	var body struct {
		EventID        string          `json:"event_id"`
		Document       domain.Document `json:"document"`
		SearchableText string          `json:"searchable_text"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || body.EventID == "" || body.Document.EntityID == "" {
		fail(w, 400, "event_id dan document wajib diisi")
		return
	}
	inserted, err := h.repo.ApplyIndexEvent(r.Context(), body.EventID, body.Document, body.SearchableText)
	if err != nil {
		fail(w, 500, "index event failed")
		return
	}
	write(w, 200, map[string]any{"accepted": true, "duplicate": !inserted})
}
func (h *Handler) Rebuild(w http.ResponseWriter, r *http.Request) {
	if !adminOnly(w, r) {
		return
	}
	if r.Method != "POST" {
		fail(w, 405, "method not allowed")
		return
	}
	var body struct {
		Version string `json:"version"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if err := h.repo.Rebuild(r.Context(), body.Version); err != nil {
		fail(w, 500, "rebuild alias failed")
		return
	}
	write(w, 200, map[string]string{"status": "alias_switched"})
}

func adminOnly(w http.ResponseWriter, r *http.Request) bool {
	role := r.Header.Get("X-User-Role")
	if role != "ops_admin" && role != "super_admin" && role != "admin" {
		fail(w, http.StatusForbidden, "admin access required")
		return false
	}
	return true
}
func (h *Handler) Synonyms(w http.ResponseWriter, r *http.Request) {
	if !adminOnly(w, r) {
		return
	}
	market := r.URL.Query().Get("market_code")
	locale := r.URL.Query().Get("locale")
	if market == "" {
		market = "id-jk"
	}
	if locale == "" {
		locale = "id-ID"
	}
	if r.Method == http.MethodGet {
		v, err := h.repo.ListSynonyms(r.Context(), market, locale)
		if err != nil {
			fail(w, 500, "synonyms unavailable")
			return
		}
		write(w, 200, v)
		return
	}
	var v domain.Synonym
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 32*1024)).Decode(&v) != nil {
		fail(w, 400, "invalid synonym")
		return
	}
	if v.MarketCode == "" {
		v.MarketCode = market
	}
	if v.Locale == "" {
		v.Locale = locale
	}
	if err := h.repo.SaveSynonym(r.Context(), v, r.Header.Get("X-User-ID")); err != nil {
		fail(w, 400, "synonym rejected")
		return
	}
	write(w, 201, v)
}
func (h *Handler) Merchandising(w http.ResponseWriter, r *http.Request) {
	if !adminOnly(w, r) {
		return
	}
	if r.Method == http.MethodGet {
		market, locale := r.URL.Query().Get("market_code"), r.URL.Query().Get("locale")
		if market == "" {
			market = "id-jk"
		}
		if locale == "" {
			locale = "id-ID"
		}
		items, err := h.repo.ListRules(r.Context(), market, locale)
		if err != nil {
			log.Printf("search merchandising list failed: %v", err)
			fail(w, 500, "merchandising rules unavailable")
			return
		}
		write(w, 200, items)
		return
	}
	if r.Method != http.MethodPost {
		fail(w, 405, "method not allowed")
		return
	}
	var v domain.MerchandisingRule
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 32*1024)).Decode(&v) != nil || v.QueryTerm == "" || v.EntityID == "" || v.Reason == "" || v.ExpiresAt == nil {
		fail(w, 400, "rule requires query, entity, reason and expiry")
		return
	}
	if err := h.repo.SaveRule(r.Context(), v, r.Header.Get("X-User-ID")); err != nil {
		fail(w, 400, "merchandising rule rejected")
		return
	}
	write(w, 201, v)
}

func (h *Handler) Quality(w http.ResponseWriter, r *http.Request) {
	if !adminOnly(w, r) {
		return
	}
	market, locale := r.URL.Query().Get("market_code"), r.URL.Query().Get("locale")
	if market == "" {
		market = "id-jk"
	}
	if locale == "" {
		locale = "id-ID"
	}
	metrics, err := h.repo.Quality(r.Context(), market, locale)
	if err != nil {
		fail(w, 500, "search quality unavailable")
		return
	}
	write(w, 200, metrics)
}
