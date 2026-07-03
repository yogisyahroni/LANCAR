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
}

func NewWSHandler(eb domain.EventBus) *WSHandler {
	h := &WSHandler{
		eventBus:   eb,
		clients:    make(map[*client]bool),
		rooms:      make(map[string]map[*client]bool),
		register:   make(chan *client),
		unregister: make(chan *client),
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

	// Always join user's private room
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
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
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
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
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

func (h *WSHandler) listenToEvents() {
	ctx := context.Background()

	// Topics to listen to
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

func (h *WSHandler) broadcastToRoomFromEvent(topic, payload string) {
	var event struct {
		OrderID string `json:"order_id"`
		UserID  string `json:"user_id"`
	}
	json.Unmarshal([]byte(payload), &event)

	h.mu.RLock()
	defer h.mu.RUnlock()

	// Broadcast to order room if present
	if event.OrderID != "" {
		room := "order:" + event.OrderID
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

	// Also broadcast to user room if present
	if event.UserID != "" {
		room := "user:" + event.UserID
		if clients, ok := h.rooms[room]; ok {
			for c := range clients {
				select {
				case c.send <- []byte(payload):
				default:
				}
			}
		}
	}
}
