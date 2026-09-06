from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} anchor missing")
    return text.replace(old, new, 1)


# --- WebSocket canonical realtime envelope + current dedupe wiring ---
p = Path("backend/order-service/internal/handler/websocket_handler.go")
s = p.read_text()

if '"fmt"' not in s:
    s = replace_once(
        s,
        'import (\n\t"context"\n\t"encoding/json"\n\t"log"',
        'import (\n\t"context"\n\t"encoding/json"\n\t"fmt"\n\t"log"',
        "websocket fmt import",
    )
if '"strconv"' not in s:
    s = replace_once(s, '\t"net/http"\n\t"sync"', '\t"net/http"\n\t"strconv"\n\t"strings"\n\t"sync"', "websocket strconv imports")

if "func normalizeRealtimeEvent(" not in s:
    anchor = "// versionedEvent is the on-the-wire shape parsed from the event bus payload to\n"
    helper = r'''type realtimeEventIndex struct {
	OrderID string
	UserID  string
}

func normalizeRealtimeEvent(eventType string, payload []byte, now time.Time) ([]byte, realtimeEventIndex, bool) {
	var event map[string]interface{}
	if err := json.Unmarshal(payload, &event); err != nil {
		return nil, realtimeEventIndex{}, false
	}

	eventID := stringField(event, "event_id")
	if eventID == "" {
		eventID = uuid.NewString()
		event["event_id"] = eventID
	}

	version := stringField(event, "event_version")
	if version == "" {
		version = stringField(event, "version")
	}
	if version == "" {
		version = strconv.FormatInt(now.UTC().UnixNano(), 10)
	}
	event["event_version"] = version

	if stringField(event, "event_type") == "" {
		event["event_type"] = eventType
	}
	if stringField(event, "created_at") == "" {
		event["created_at"] = now.UTC().Format(time.RFC3339Nano)
	}

	orderID := firstNonEmpty(
		stringField(event, "order_id"),
		stringField(event, "orderId"),
		stringField(event, "reference_id"),
		stringField(event, "referenceId"),
	)
	userID := firstNonEmpty(
		stringField(event, "user_id"),
		stringField(event, "userId"),
	)
	if orderID != "" {
		event["order_id"] = orderID
	}
	if userID != "" {
		event["user_id"] = userID
	}

	normalized, err := json.Marshal(event)
	if err != nil {
		return nil, realtimeEventIndex{}, false
	}
	return normalized, realtimeEventIndex{OrderID: orderID, UserID: userID}, true
}

func stringField(payload map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		value, ok := payload[key]
		if !ok || value == nil {
			continue
		}
		switch typed := value.(type) {
		case string:
			if typed != "" {
				return typed
			}
		case json.Number:
			return typed.String()
		case float64:
			return strconv.FormatFloat(typed, 'f', -1, 64)
		default:
			rendered := strings.TrimSpace(fmt.Sprint(typed))
			if rendered != "" {
				return rendered
			}
		}
	}
	return ""
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

'''
    s = replace_once(s, anchor, helper + anchor, "websocket helper")

old_broadcast = r'''func (h *WSHandler) broadcastToRoomFromEvent(topic, payload string) {
	var event versionedEvent
	_ = json.Unmarshal([]byte(payload), &event)

	h.mu.RLock()
	defer h.mu.RUnlock()

	// CORE-2026-007: skip duplicate / older events. Only forward an event to a
	// room if its version is strictly greater than the last version seen for
	// that (user, order). This makes event ordering authoritative server-side.
	if event.OrderID != "" {
		h.lastVersionMu.Lock()
		key := h.versionKey("", event.OrderID)
		last := h.lastVersion[key]
		if event.Version > 0 && event.Version <= last {
			h.lastVersionMu.Unlock()
			return
		}
		if event.Version > last {
			h.lastVersion[key] = event.Version
		}
		h.lastVersionMu.Unlock()
	}

	h.broadcastToRoom("order:"+event.OrderID, payload)
	if event.UserID != "" {
		h.broadcastToRoom("user:"+event.UserID, payload)
	}
}
'''
new_broadcast = r'''func (h *WSHandler) broadcastToRoomFromEvent(topic, payload string) {
	normalized, index, ok := normalizeRealtimeEvent(topic, []byte(payload), time.Now().UTC())
	if !ok {
		return
	}

	var event versionedEvent
	_ = json.Unmarshal(normalized, &event)
	event.OrderID = firstNonEmpty(event.OrderID, index.OrderID)
	event.UserID = firstNonEmpty(event.UserID, index.UserID)
	if event.Version == 0 {
		var contract struct {
			EventVersion string `json:"event_version"`
		}
		if json.Unmarshal(normalized, &contract) == nil {
			if version, err := strconv.ParseUint(contract.EventVersion, 10, 64); err == nil {
				event.Version = version
			}
		}
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	// CORE-2026-007: skip duplicate / older events using the canonical version.
	if event.OrderID != "" {
		h.lastVersionMu.Lock()
		key := h.versionKey("", event.OrderID)
		last := h.lastVersion[key]
		if event.Version > 0 && event.Version <= last {
			h.lastVersionMu.Unlock()
			return
		}
		if event.Version > last {
			h.lastVersion[key] = event.Version
		}
		h.lastVersionMu.Unlock()
		h.broadcastToRoom("order:"+event.OrderID, string(normalized))
	}
	if event.UserID != "" {
		h.broadcastToRoom("user:"+event.UserID, string(normalized))
	}
}
'''
if old_broadcast in s:
    s = s.replace(old_broadcast, new_broadcast, 1)
elif new_broadcast not in s:
    raise SystemExit("websocket broadcast anchor missing")

# uuid is required by normalizeRealtimeEvent.
if '"github.com/google/uuid"' not in s:
    s = replace_once(s, '\n\t"github.com/gorilla/websocket"', '\n\t"github.com/google/uuid"\n\t"github.com/gorilla/websocket"', "websocket uuid import")
p.write_text(s)


# --- Handoff service: return the exact plaintext persisted by repository ---
p = Path("backend/order-service/internal/service/handoff_service.go")
s = p.read_text()
old_issue = r'''	// Resolve token format.
	format := req.TokenFormat
	if format == "" {
		format = domain.TokenFormatNumeric6
	}

	// Resolve expiry.
	expiresAt := req.ExpiresAt
	if expiresAt.IsZero() {
		expiresAt = domain.DefaultTokenExpiry()
	}

	// Resolve max attempts.
	maxAttempts := req.MaxAttempts
	if maxAttempts == 0 {
		maxAttempts = domain.DefaultMaxAttempts
	}

	if maxAttempts < 1 {
		return nil, "", fmt.Errorf("max_attempts must be >= 1")
	}

	plaintext, err := domain.GenerateTokenValue(format)
	if err != nil {
		return nil, "", fmt.Errorf("generate token value: %w", err)
	}

	hash, salt := domain.HashToken(plaintext, "")
	_ = hash + salt // hash/salt are persisted inside IssueToken by the repository

	t, _, err := s.repo.IssueToken(ctx, req, actorID, actorRole, string(category))
	if err != nil {
		return nil, "", fmt.Errorf("issue token: %w", err)
	}
	t.TokenHash = ""
	t.TokenSalt = ""
	return t, plaintext, nil
'''
new_issue = r'''	// Resolve defaults on the request itself so the repository persists exactly
	// the same contract the caller receives.
	if req.TokenFormat == "" {
		req.TokenFormat = domain.TokenFormatNumeric6
	}
	if req.ExpiresAt.IsZero() {
		req.ExpiresAt = domain.DefaultTokenExpiry()
	}
	if req.MaxAttempts == 0 {
		req.MaxAttempts = domain.DefaultMaxAttempts
	}
	if req.MaxAttempts < 1 {
		return nil, "", fmt.Errorf("max_attempts must be >= 1")
	}

	t, plaintext, err := s.repo.IssueToken(ctx, req, actorID, actorRole, string(category))
	if err != nil {
		return nil, "", fmt.Errorf("issue token: %w", err)
	}
	if t == nil || strings.TrimSpace(plaintext) == "" {
		return nil, "", domain.ErrProofTokenInvalid
	}
	t.TokenHash = ""
	t.TokenSalt = ""
	return t, plaintext, nil
'''
if old_issue in s:
    s = s.replace(old_issue, new_issue, 1)
elif new_issue not in s:
    raise SystemExit("handoff IssueProofToken anchor missing")
p.write_text(s)


# --- Handoff tests: provide required order repository and real verification binding ---
p = Path("backend/order-service/internal/service/handoff_service_test.go")
s = p.read_text()
if "type handoffOrderRepoStub struct" not in s:
    anchor = "// handoffRepoStub implements domain.ProofVerificationRepository for tests.\n"
    stub = r'''type handoffOrderRepoStub struct {
	domain.OrderRepository
	err error
}

func (s handoffOrderRepoStub) GetByID(_ context.Context, id string) (*domain.Order, error) {
	if s.err != nil {
		return nil, s.err
	}
	return &domain.Order{ID: id, ServiceCategory: "food_delivery"}, nil
}

'''
    s = replace_once(s, anchor, stub + anchor, "handoff order repo stub")

old_verify = r'''func (r *handoffRepoStub) VerifyToken(_ context.Context, req domain.VerifyProofTokenRequest) (*domain.ProofVerificationResult, error) {
	if r.verifyErr != nil {
		return nil, r.verifyErr
	}
	if r.token == nil {
		return nil, domain.ErrProofTokenInvalid
	}
	return &domain.ProofVerificationResult{
		TokenID:  r.token.ID,
		OrderID:  r.token.OrderID,
		Consumed: false,
		Stage:    string(r.token.Stage),
	}, nil
}
'''
new_verify = r'''func (r *handoffRepoStub) VerifyToken(_ context.Context, req domain.VerifyProofTokenRequest) (*domain.ProofVerificationResult, error) {
	if r.verifyErr != nil {
		return nil, r.verifyErr
	}
	if r.consumeErr != nil {
		return nil, r.consumeErr
	}
	if r.token == nil || req.TokenID != r.token.OrderID || req.ActorID != r.token.ActorID || req.ProofValue != r.token.TokenHash {
		return nil, domain.ErrProofTokenInvalid
	}
	return &domain.ProofVerificationResult{
		TokenID:  r.token.ID,
		OrderID:  r.token.OrderID,
		Consumed: true,
		Stage:    string(r.token.Stage),
	}, nil
}
'''
if old_verify in s:
    s = s.replace(old_verify, new_verify, 1)
elif new_verify not in s:
    raise SystemExit("handoff VerifyToken stub anchor missing")

old_svc = "svc := &handoffService{repo: repo}"
new_svc = "svc := &handoffService{repo: repo, orderRepo: handoffOrderRepoStub{}}"
if old_svc in s:
    s = s.replace(old_svc, new_svc)
elif new_svc not in s:
    raise SystemExit("handoff service fixture anchor missing")
p.write_text(s)
