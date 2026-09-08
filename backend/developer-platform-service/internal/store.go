package platform

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

var ErrNotFound = errors.New("developer resource not found")

type Store struct {
	db        *sql.DB
	secretBox *SecretBox
	outboxMu  sync.Mutex
}

func NewStore(db *sql.DB, secretBox *SecretBox) *Store {
	return &Store{db: db, secretBox: secretBox}
}

type IdempotencyReplay struct {
	Replay   bool
	Status   int
	Response []byte
}

func (s *Store) Authenticate(ctx context.Context, authorization string) (Client, error) {
	environment, clientID, secret, err := parseAPIKey(authorization)
	if err != nil {
		return Client{}, ErrInvalidCredentials
	}
	var client Client
	var secretHash []byte
	var scopes []string
	var status string
	err = s.db.QueryRowContext(ctx, `
		SELECT id::text, client_id, owner_user_id::text, name, environment,
		       secret_hash, scopes, quota_per_minute, status
		FROM developer_api_clients
		WHERE client_id = $1 AND environment = $2
		  AND status = 'active'
		  AND (expires_at IS NULL OR expires_at > NOW())`, clientID, environment).
		Scan(&client.ID, &client.ClientID, &client.OwnerUserID, &client.Name,
			&client.Environment, &secretHash, pq.Array(&scopes), &client.QuotaPerMinute, &status)
	if err != nil || !verifySecret(secretHash, secret) {
		return Client{}, ErrInvalidCredentials
	}
	client.Scopes = scopes
	go func() {
		_, _ = s.db.ExecContext(context.Background(), `UPDATE developer_api_clients SET last_used_at = NOW() WHERE id = $1`, client.ID)
	}()
	return client, nil
}

func (s *Store) CreateClient(ctx context.Context, name, ownerUserID, environment string, scopes []string, quota int) (Client, string, error) {
	clientID, err := newClientID()
	if err != nil {
		return Client{}, "", err
	}
	apiKey, err := GenerateAPIKey(environment, clientID)
	if err != nil {
		return Client{}, "", err
	}
	secretHash, err := hashSecret(apiKey[stringsLastUnderscore(apiKey)+1:])
	if err != nil {
		return Client{}, "", err
	}
	var id string
	err = s.db.QueryRowContext(ctx, `
		INSERT INTO developer_api_clients
		  (client_id, owner_user_id, name, environment, secret_hash, scopes, quota_per_minute)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id::text`, clientID, ownerUserID, name, environment, secretHash, pq.Array(scopes), quota).Scan(&id)
	if err != nil {
		return Client{}, "", fmt.Errorf("create developer client: %w", err)
	}
	return Client{ID: id, ClientID: clientID, OwnerUserID: ownerUserID, Name: name, Environment: environment, Scopes: scopes, QuotaPerMinute: quota}, apiKey, nil
}

// stringsLastUnderscore avoids exposing or logging the generated secret while
// keeping the credential format parseable by the authentication boundary.
func stringsLastUnderscore(value string) int {
	for index := len(value) - 1; index >= 0; index-- {
		if value[index] == '_' {
			return index
		}
	}
	return 0
}

type Subscription struct {
	ID               string
	ClientID         string
	EndpointURL      string
	Events           []string
	SecretCiphertext []byte
	Status           string
	CreatedAt        time.Time
}

type SubscriptionView struct {
	ID          string    `json:"id"`
	EndpointURL string    `json:"endpoint_url"`
	Events      []string  `json:"events"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
}

func (s *Store) CreateSubscription(ctx context.Context, clientID, endpoint string, events []string) (Subscription, string, error) {
	secret, err := randomURLToken(32)
	if err != nil {
		return Subscription{}, "", err
	}
	ciphertext, err := s.secretBox.Seal(secret)
	if err != nil {
		return Subscription{}, "", fmt.Errorf("encrypt webhook secret: %w", err)
	}
	var sub Subscription
	var eventValues []string
	err = s.db.QueryRowContext(ctx, `
		INSERT INTO developer_webhook_subscriptions
		  (client_id, endpoint_url, event_types, secret_ciphertext)
		VALUES ($1, $2, $3, $4)
		RETURNING id::text, client_id, endpoint_url, event_types, secret_ciphertext, status, created_at`,
		clientID, endpoint, pq.Array(events), ciphertext).
		Scan(&sub.ID, &sub.ClientID, &sub.EndpointURL, pq.Array(&eventValues), &sub.SecretCiphertext, &sub.Status, &sub.CreatedAt)
	if err != nil {
		return Subscription{}, "", fmt.Errorf("create webhook subscription: %w", err)
	}
	sub.Events = eventValues
	return sub, secret, nil
}

func (s *Store) ListSubscriptions(ctx context.Context, clientID string) ([]SubscriptionView, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id::text, endpoint_url, event_types, status, created_at FROM developer_webhook_subscriptions WHERE client_id = $1 ORDER BY created_at DESC`, clientID)
	if err != nil {
		return nil, fmt.Errorf("list webhook subscriptions: %w", err)
	}
	defer rows.Close()
	result := make([]SubscriptionView, 0)
	for rows.Next() {
		var view SubscriptionView
		if err := rows.Scan(&view.ID, &view.EndpointURL, pq.Array(&view.Events), &view.Status, &view.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan webhook subscription: %w", err)
		}
		result = append(result, view)
	}
	return result, rows.Err()
}

func (s *Store) DeleteSubscription(ctx context.Context, clientID, id string) error {
	result, err := s.db.ExecContext(ctx, `UPDATE developer_webhook_subscriptions SET status = 'revoked', updated_at = NOW() WHERE id = $1 AND client_id = $2 AND status = 'active'`, id, clientID)
	if err != nil {
		return fmt.Errorf("revoke webhook subscription: %w", err)
	}
	count, err := result.RowsAffected()
	if err != nil || count == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ReserveIdempotency(ctx context.Context, clientID, operation, key string, requestHash string) (IdempotencyReplay, error) {
	var id string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO developer_api_idempotency
		  (client_id, operation, idempotency_key, request_hash, state)
		VALUES ($1, $2, $3, $4, 'processing')
		ON CONFLICT (client_id, operation, idempotency_key) DO NOTHING
		RETURNING id::text`, clientID, operation, key, requestHash).Scan(&id)
	if err == nil {
		return IdempotencyReplay{}, nil
	}
	var storedHash, state string
	var status sql.NullInt64
	var response []byte
	if selectErr := s.db.QueryRowContext(ctx, `
		SELECT request_hash, state, status_code, response_body
		FROM developer_api_idempotency
		WHERE client_id = $1 AND operation = $2 AND idempotency_key = $3`, clientID, operation, key).
		Scan(&storedHash, &state, &status, &response); selectErr != nil {
		return IdempotencyReplay{}, fmt.Errorf("read developer idempotency: %w", selectErr)
	}
	if storedHash != requestHash {
		return IdempotencyReplay{}, ErrIdempotencyConflict
	}
	if state == "completed" && status.Valid && len(response) > 0 {
		return IdempotencyReplay{Replay: true, Status: int(status.Int64), Response: response}, nil
	}
	return IdempotencyReplay{}, ErrIdempotencyRunning
}

func (s *Store) CompleteIdempotency(ctx context.Context, clientID, operation, key string, status int, response []byte) {
	_, _ = s.db.ExecContext(ctx, `
		UPDATE developer_api_idempotency
		SET state = CASE WHEN $4 >= 500 THEN 'failed' ELSE 'completed' END,
		    status_code = $4, response_hash = $5, response_body = $6::jsonb, updated_at = NOW()
		WHERE client_id = $1 AND operation = $2 AND idempotency_key = $3`,
		clientID, operation, key, status, sha256Hex(response), jsonOrString(response))
}

func jsonOrString(value []byte) string {
	if json.Valid(value) {
		return string(value)
	}
	encoded, _ := json.Marshal(string(value))
	return string(encoded)
}

func sha256Hex(value []byte) string {
	sum := sha256.Sum256(value)
	return hex.EncodeToString(sum[:])
}

func (s *Store) AllowRate(ctx context.Context, client Client) (bool, int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO developer_rate_limit_windows (client_id, window_start, request_count)
		VALUES ($1, date_trunc('minute', NOW()), 1)
		ON CONFLICT (client_id, window_start)
		DO UPDATE SET request_count = developer_rate_limit_windows.request_count + 1
		RETURNING request_count`, client.ID).Scan(&count)
	if err != nil {
		return false, 0, fmt.Errorf("update developer rate limit: %w", err)
	}
	return count <= client.QuotaPerMinute, count, nil
}

type SandboxOrder struct {
	ID          string
	ClientID    string
	OwnerUserID string
	Status      string
	Payload     []byte
	CreatedAt   time.Time
}

func (s *Store) CreateSandboxOrder(ctx context.Context, client Client, id string, request, payload []byte) (SandboxOrder, error) {
	var order SandboxOrder
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO developer_sandbox_orders (id, client_id, owner_user_id, status, request_body, response_body)
		VALUES ($1, $2, $3, 'sandbox_created', $4::jsonb, $5::jsonb)
		RETURNING id::text, client_id, owner_user_id::text, status, response_body, created_at`,
		id, client.ID, client.OwnerUserID, jsonOrString(request), jsonOrString(payload)).
		Scan(&order.ID, &order.ClientID, &order.OwnerUserID, &order.Status, &order.Payload, &order.CreatedAt)
	if err != nil {
		return SandboxOrder{}, fmt.Errorf("create sandbox order: %w", err)
	}
	return order, nil
}

func (s *Store) GetSandboxOrder(ctx context.Context, client Client, id string) (SandboxOrder, error) {
	var order SandboxOrder
	err := s.db.QueryRowContext(ctx, `
		SELECT id::text, client_id, owner_user_id::text, status, response_body, created_at
		FROM developer_sandbox_orders WHERE id = $1 AND client_id = $2 AND owner_user_id = $3`, id, client.ID, client.OwnerUserID).
		Scan(&order.ID, &order.ClientID, &order.OwnerUserID, &order.Status, &order.Payload, &order.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return SandboxOrder{}, ErrNotFound
	}
	if err != nil {
		return SandboxOrder{}, fmt.Errorf("get sandbox order: %w", err)
	}
	return order, nil
}

func (s *Store) CancelSandboxOrder(ctx context.Context, client Client, id string) (SandboxOrder, error) {
	result, err := s.db.ExecContext(ctx, `UPDATE developer_sandbox_orders SET status = 'cancelled', response_body = response_body || '{"status":"cancelled"}'::jsonb, updated_at = NOW() WHERE id = $1 AND client_id = $2 AND owner_user_id = $3 AND status = 'sandbox_created'`, id, client.ID, client.OwnerUserID)
	if err != nil {
		return SandboxOrder{}, fmt.Errorf("cancel sandbox order: %w", err)
	}
	if count, _ := result.RowsAffected(); count == 0 {
		return s.GetSandboxOrder(ctx, client, id)
	}
	return s.GetSandboxOrder(ctx, client, id)
}

type EventRecord struct {
	ID           string
	EventType    string
	EventVersion int
	Payload      []byte
	Headers      []byte
	AggregateID  string
	OccurredAt   time.Time
	CreatedAt    time.Time
	MarketCode   string
	ServiceName  string
	EntityID     string
	PIIClass     string
}

func (s *Store) SyncOutboxEvents(ctx context.Context) error {
	s.outboxMu.Lock()
	defer s.outboxMu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	var cursorTime time.Time
	var cursorID string
	if err := tx.QueryRowContext(ctx, `SELECT last_created_at, last_event_id FROM developer_event_cursors WHERE id = 1 FOR UPDATE`).Scan(&cursorTime, &cursorID); err != nil {
		return fmt.Errorf("read developer event cursor: %w", err)
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT id::text, event_type, event_version, payload, headers, COALESCE(aggregate_id::text, ''),
		       COALESCE(occurred_at, created_at), created_at, COALESCE(market_code, 'id-jk'),
		       COALESCE(service_name, 'unknown'), COALESCE(entity_id, ''), COALESCE(pii_classification, 'restricted')
		FROM event_outbox
		WHERE created_at > $1 OR (created_at = $1 AND id::text > $2)
		ORDER BY created_at, id::text
		LIMIT 500`, cursorTime, cursorID)
	if err != nil {
		return fmt.Errorf("read developer event stream: %w", err)
	}
	defer rows.Close()
	var events []EventRecord
	for rows.Next() {
		var event EventRecord
		if err := rows.Scan(&event.ID, &event.EventType, &event.EventVersion, &event.Payload, &event.Headers, &event.AggregateID, &event.OccurredAt, &event.CreatedAt, &event.MarketCode, &event.ServiceName, &event.EntityID, &event.PIIClass); err != nil {
			return fmt.Errorf("scan developer event: %w", err)
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(events) == 0 {
		return tx.Commit()
	}
	var subscriptions []Subscription
	subRows, err := tx.QueryContext(ctx, `SELECT id::text, client_id, endpoint_url, event_types, secret_ciphertext, status, created_at FROM developer_webhook_subscriptions WHERE status = 'active'`)
	if err != nil {
		return fmt.Errorf("read active developer subscriptions: %w", err)
	}
	for subRows.Next() {
		var sub Subscription
		var eventsForSub []string
		if err := subRows.Scan(&sub.ID, &sub.ClientID, &sub.EndpointURL, pq.Array(&eventsForSub), &sub.SecretCiphertext, &sub.Status, &sub.CreatedAt); err != nil {
			subRows.Close()
			return fmt.Errorf("scan active developer subscription: %w", err)
		}
		sub.Events = eventsForSub
		subscriptions = append(subscriptions, sub)
	}
	subRows.Close()
	for _, event := range events {
		payload := webhookEnvelope(event)
		for _, sub := range subscriptions {
			if !matchesEvent(sub.Events, event.EventType) {
				continue
			}
			_, err := tx.ExecContext(ctx, `
				INSERT INTO developer_webhook_deliveries
				  (subscription_id, source_event_id, event_type, payload, status, next_attempt_at)
				VALUES ($1, $2, $3, $4::jsonb, 'pending', NOW())
				ON CONFLICT (subscription_id, source_event_id) DO NOTHING`, sub.ID, event.ID, event.EventType, payload)
			if err != nil {
				return fmt.Errorf("enqueue developer webhook delivery: %w", err)
			}
		}
		cursorTime, cursorID = event.CreatedAt, event.ID
	}
	if _, err := tx.ExecContext(ctx, `UPDATE developer_event_cursors SET last_created_at = $1, last_event_id = $2, updated_at = NOW() WHERE id = 1`, cursorTime, cursorID); err != nil {
		return fmt.Errorf("advance developer event cursor: %w", err)
	}
	return tx.Commit()
}

func matchesEvent(events []string, event string) bool {
	for _, candidate := range events {
		if candidate == "*" || candidate == event {
			return true
		}
	}
	return false
}

func webhookEnvelope(event EventRecord) []byte {
	var payload any
	if json.Unmarshal(event.Payload, &payload) != nil {
		payload = map[string]any{"data": "[REDACTED]"}
	}
	envelope := map[string]any{
		"id": event.ID, "type": event.EventType, "version": event.EventVersion,
		"occurred_at": event.OccurredAt.UTC().Format(time.RFC3339Nano),
		"market":      event.MarketCode, "service": event.ServiceName, "entity_id": event.EntityID,
		"data": sanitizeJSON(payload),
	}
	encoded, _ := json.Marshal(envelope)
	return encoded
}

type Delivery struct {
	ID               string
	SubscriptionID   string
	EndpointURL      string
	SecretCiphertext []byte
	Payload          []byte
	AttemptCount     int
}

func (s *Store) ClaimDelivery(ctx context.Context) (*Delivery, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	var delivery Delivery
	err = tx.QueryRowContext(ctx, `
		SELECT d.id::text, d.subscription_id::text, s.endpoint_url, s.secret_ciphertext, d.payload, d.attempt_count + 1
		FROM developer_webhook_deliveries d
		JOIN developer_webhook_subscriptions s ON s.id = d.subscription_id AND s.status = 'active'
		WHERE d.status IN ('pending', 'retry') AND d.next_attempt_at <= NOW()
		ORDER BY d.next_attempt_at, d.created_at
		FOR UPDATE OF d SKIP LOCKED LIMIT 1`).Scan(&delivery.ID, &delivery.SubscriptionID, &delivery.EndpointURL, &delivery.SecretCiphertext, &delivery.Payload, &delivery.AttemptCount)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, tx.Commit()
	}
	if err != nil {
		return nil, fmt.Errorf("claim developer webhook delivery: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE developer_webhook_deliveries SET status = 'delivering', attempt_count = $2, last_attempt_at = NOW(), updated_at = NOW() WHERE id = $1`, delivery.ID, delivery.AttemptCount); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &delivery, nil
}

func (s *Store) MarkDeliverySuccess(ctx context.Context, id string, status int) error {
	_, err := s.db.ExecContext(ctx, `UPDATE developer_webhook_deliveries SET status = 'succeeded', response_status = $2, delivered_at = NOW(), updated_at = NOW() WHERE id = $1`, id, status)
	return err
}

func (s *Store) MarkDeliveryFailure(ctx context.Context, delivery Delivery, status int, message string) error {
	state := "retry"
	if delivery.AttemptCount >= 8 || !retryableWebhookResponse(status) {
		state = "dead"
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE developer_webhook_deliveries
		SET status = $2, response_status = NULLIF($3, 0), last_error = LEFT($4, 500),
		    next_attempt_at = CASE WHEN $2 = 'retry' THEN $5 ELSE next_attempt_at END, updated_at = NOW()
		WHERE id = $1`, delivery.ID, state, status, message, nextRetry(delivery.AttemptCount, time.Now().UTC()))
	return err
}

type DeliveryView struct {
	ID             string     `json:"id"`
	EventType      string     `json:"event_type"`
	Status         string     `json:"status"`
	AttemptCount   int        `json:"attempt_count"`
	ResponseStatus *int       `json:"response_status,omitempty"`
	LastError      string     `json:"last_error,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	DeliveredAt    *time.Time `json:"delivered_at,omitempty"`
}

func (s *Store) ListDeliveries(ctx context.Context, clientID, subscriptionID string) ([]DeliveryView, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT d.id::text, d.event_type, d.status, d.attempt_count, d.response_status, COALESCE(d.last_error, ''), d.created_at, d.delivered_at
		FROM developer_webhook_deliveries d
		JOIN developer_webhook_subscriptions s ON s.id = d.subscription_id
		WHERE s.client_id = $1 AND d.subscription_id = $2
		ORDER BY d.created_at DESC LIMIT 100`, clientID, subscriptionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]DeliveryView, 0)
	for rows.Next() {
		var view DeliveryView
		if err := rows.Scan(&view.ID, &view.EventType, &view.Status, &view.AttemptCount, &view.ResponseStatus, &view.LastError, &view.CreatedAt, &view.DeliveredAt); err != nil {
			return nil, err
		}
		result = append(result, view)
	}
	return result, rows.Err()
}

func (s *Store) SecretForDelivery(delivery Delivery) (string, error) {
	if s.secretBox == nil {
		return "", errors.New("webhook secret cipher unavailable")
	}
	return s.secretBox.Open(delivery.SecretCiphertext)
}

func (s *Store) CleanupRateWindows(ctx context.Context) {
	_, _ = s.db.ExecContext(ctx, `DELETE FROM developer_rate_limit_windows WHERE window_start < NOW() - INTERVAL '2 hours'`)
}

// Keep uuid imported in this file for compile-time validation of IDs at the
// service boundary without accepting arbitrary values from the public API.
func validUUID(value string) bool { _, err := uuid.Parse(value); return err == nil }
