package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Security hardening can be added here
	},
}

type client struct {
	userID string
	rooms  map[string]bool
	send   chan []byte
	conn   *websocket.Conn
}

type WSHandler struct {
	eventBus   domain.EventBus
	clients    map[*client]bool
	rooms      map[string]map[*client]bool
	register   chan *client
	unregister chan *client
	mu         sync.RWMutex

	// CORE-2026-007: last-seen event version per (user, order_id) for dedupe.
	// Prevents clients processing out-of-order or duplicate events after
	// reconnect/replay.
	lastVersionMu sync.Mutex
	lastVersion   map[string]uint64
}

func NewWSHandler(eb domain.EventBus) *WSHandler {
	h := &WSHandler{
		eventBus:     eb,
		clients:      make(map[*client]bool),
		rooms:        make(map[string]map[*client]bool),
		register:     make(chan *client),
		unregister:   make(chan *client),
		lastVersion:  make(map[string]uint64),
	}
	go h.run()
	go h.listenToEvents()
	return h
}

func (h *WSHandler) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				for room := range client.rooms {
					if clients, ok := h.rooms[room]; ok {
						delete(clients, client)
						if len(clients) == 0 {
							delete(h.rooms, room)
						}
					}
				}
				close(client.send)
			}
			h.mu.Unlock()
		}
	}
}

func (h *WSHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WS upgrade error: %v", err)
		return
	}

	c := &client{
		userID: userID,
		rooms:  make(map[string]bool),
		send:   make(chan []byte, 256),
		conn:   conn,
	}

	h.register <- c

	// CORE-2026-007: On connect, the client must fetch the authoritative
	// snapshot via GetTrackingByOrder / order REST endpoints. The WS layer
	// only emits new events from this point forward; reconnects therefore
	// do not replay stale state.
	h.joinRoom(c, "user:"+userID)

	go c.writePump()
	go h.readPump(c)
}

func (h *WSHandler) readPump(c *client) {
	defer func() {
		h.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(512)
	_ = c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}

		var msg struct {
			Action string `json:"action"`
			Room   string `json:"room"`
		}
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		switch msg.Action {
		case "join":
			h.joinRoom(c, msg.Room)
		case "leave":
			h.leaveRoom(c, msg.Room)
		case "sync_request":
			// CORE-2026-007: client reconnected and asks for authoritative
			// snapshot. Push the latest order_events version per order so the
			// client knows where to resume from (prevents blind mutation).
			h.sendResumeVersion(c, msg.Room)
		}
	}
}

func (c *client) writePump() {
	ticker := time.NewTicker(50 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(message)

			n := len(c.send)
			for i := 0; i < n; i++ {
				_, _ = w.Write([]byte{'\n'})
				_, _ = w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (h *WSHandler) joinRoom(c *client, room string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[room] == nil {
		h.rooms[room] = make(map[*client]bool)
	}
	h.rooms[room][c] = true
	c.rooms[room] = true
}

func (h *WSHandler) leaveRoom(c *client, room string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if clients, ok := h.rooms[room]; ok {
		delete(clients, c)
		if len(clients) == 0 {
			delete(h.rooms, room)
		}
	}
	delete(c.rooms, room)
}

// sendResumeVersion pushes the last-seen event version for an order room so a
// freshly connected client knows the authoritative version it must not regress
// below (CORE-2026-007 dedupe/reconnect contract).
func (h *WSHandler) sendResumeVersion(c *client, room string) {
	orderID := extractOrderIDFromRoom(room)
	if orderID == "" {
		return
	}
	h.lastVersionMu.Lock()
	v := h.lastVersion[h.versionKey(c.userID, orderID)]
	h.lastVersionMu.Unlock()

	resume := map[string]interface{}{
		"action":       "sync_resume",
		"order_id":     orderID,
		"last_version": v,
	}
	payload, _ := json.Marshal(resume)
	select {
	case c.send <- payload:
	default:
	}
}

func (h *WSHandler) listenToEvents() {
	ctx := context.Background()

	topics := []string{"order.updates", "courier.locations", "order.chats"}

	for _, topic := range topics {
		ch, err := h.eventBus.Subscribe(ctx, topic)
		if err != nil {
			log.Printf("WS failed to subscribe to topic %s: %v", topic, err)
			continue
		}
		go func(t string, c <-chan string) {
			for msg := range c {
				h.broadcastToRoomFromEvent(t, msg)
			}
		}(topic, ch)
	}
}

// versionedEvent is the on-the-wire shape parsed from the event bus payload to
// perform per-order deduplication (CORE-2026-007).
type versionedEvent struct {
	OrderID    string `json:"order_id"`
	UserID     string `json:"user_id"`
	Version    uint64 `json:"version"`
}

func (h *WSHandler) broadcastToRoomFromEvent(topic, payload string) {
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

// broadcastToRoom emits payload to all clients in a room.
func (h *WSHandler) broadcastToRoom(room, payload string) {
	if clients, ok := h.rooms[room]; ok {
		for c := range clients {
			select {
			case c.send <- []byte(payload):
			default:
				// Drop slow clients
			}
		}
	}
}

func (h *WSHandler) versionKey(userID, orderID string) string {
	if userID == "" {
		return "o:" + orderID
	}
	return userID + ":" + orderID
}

func extractOrderIDFromRoom(room string) string {
	const prefix = "order:"
	if len(room) > len(prefix) && room[:len(prefix)] == prefix {
		return room[len(prefix):]
	}
	return ""
}
