from pathlib import Path

p = Path("backend/order-service/internal/handler/websocket_handler.go")
s = p.read_text()

if "func normalizeRealtimeEvent(" not in s:
    anchor = "func NewWebSocketHandler(redisClient *redis.Client) *WebSocketHandler {"
    helper = r'''func normalizeRealtimeEvent(eventType string, raw []byte, version int) (RealtimeEvent, []byte) {
	evt := RealtimeEvent{
		EventID:      uuid.New().String(),
		EventVersion: version,
		EventType:    eventType,
		Timestamp:    time.Now().UTC(),
		Payload:      json.RawMessage(raw),
	}

	var envelope map[string]interface{}
	if json.Unmarshal(raw, &envelope) == nil {
		if value, ok := envelope["event_id"].(string); ok && value != "" {
			evt.EventID = value
		}
		if value, ok := envelope["event_version"].(float64); ok && evt.EventVersion <= 0 && int(value) > 0 {
			evt.EventVersion = int(value)
		}
		if value, ok := envelope["event_type"].(string); ok && value != "" {
			evt.EventType = value
		}
		if value, ok := envelope["order_id"].(string); ok {
			evt.OrderID = value
		}
	}
	if evt.EventVersion <= 0 {
		evt.EventVersion = int(time.Now().UTC().UnixNano())
	}

	legacy := make(map[string]interface{})
	if json.Unmarshal(raw, &legacy) == nil {
		legacy["event_id"] = evt.EventID
		legacy["event_version"] = evt.EventVersion
		legacy["event_type"] = evt.EventType
		legacyBytes, err := json.Marshal(legacy)
		if err == nil {
			return evt, legacyBytes
		}
	}
	return evt, raw
}

'''
    if anchor not in s:
        raise SystemExit("websocket helper anchor missing")
    s = s.replace(anchor, helper + anchor, 1)

old = r'''func (h *WebSocketHandler) broadcast(topic string, payload []byte) {
	event := versionedEvent{
		ID:      uuid.NewString(),
		Version: h.nextVersion(),
		Type:    topic,
		Payload: json.RawMessage(payload),
	}

	eventBytes, err := json.Marshal(event)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		client.mu.Lock()
		if client.topics[topic] {
			if h.isDuplicateLocked(client, event.ID, event.Version) {
				client.mu.Unlock()
				continue
			}
			client.lastEventID = event.ID
			client.lastVersion = event.Version

			messageType := websocket.TextMessage
			body := payload
			if client.supportsVersion2 {
				body = eventBytes
			}
			if err := client.conn.WriteMessage(messageType, body); err != nil {
				log.Printf("[WebSocket] broadcast failed topic=%s err=%v", topic, err)
			}
		}
		client.mu.Unlock()
	}
}
'''
new = r'''func (h *WebSocketHandler) broadcast(topic string, payload []byte) {
	evt, legacyPayload := normalizeRealtimeEvent(topic, payload, int(h.nextVersion()))
	eventBytes, err := json.Marshal(evt)
	if err != nil {
		return
	}

	eventVersion := uint64(evt.EventVersion)

	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		client.mu.Lock()
		if client.topics[topic] {
			if h.isDuplicateLocked(client, evt.EventID, eventVersion) {
				client.mu.Unlock()
				continue
			}
			client.lastEventID = evt.EventID
			client.lastVersion = eventVersion

			messageType := websocket.TextMessage
			body := legacyPayload
			if client.supportsVersion2 {
				body = eventBytes
			}
			if err := client.conn.WriteMessage(messageType, body); err != nil {
				log.Printf("[WebSocket] broadcast failed topic=%s err=%v", topic, err)
			}
		}
		client.mu.Unlock()
	}
}
'''
if old not in s:
    raise SystemExit("broadcast anchor missing")
s = s.replace(old, new, 1)
p.write_text(s)

p = Path("backend/order-service/internal/service/handoff_service_test.go")
s = p.read_text()
if "type handoffOrderRepoStub struct" not in s:
    anchor = "type handoffRepoStub struct {"
    stub = r'''type handoffOrderRepoStub struct {
	domain.OrderRepository
	order *domain.Order
	err   error
}

func (s handoffOrderRepoStub) GetByID(ctx context.Context, id string) (*domain.Order, error) {
	if s.err != nil {
		return nil, s.err
	}
	if s.order != nil {
		return s.order, nil
	}
	return &domain.Order{ID: id, ServiceCategory: "food_delivery"}, nil
}

'''
    if anchor not in s:
        raise SystemExit("handoff stub anchor missing")
    s = s.replace(anchor, stub + anchor, 1)

old = "svc := handoffService{repo: repo}"
new = r'''svc := handoffService{
		repo: repo,
		orderRepo: handoffOrderRepoStub{
			order: &domain.Order{ID: "order-1", ServiceCategory: "food_delivery"},
		},
	}'''
if old not in s:
    raise SystemExit("handoff service fixture anchor missing")
s = s.replace(old, new, 1)
p.write_text(s)
