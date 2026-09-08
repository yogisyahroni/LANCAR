package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"tembus/order-service/internal/domain"
)

const DatalakeQueueName = "queue.ai.datalake.gps"

type GPSMessage struct {
	CourierID string  `json:"courier_id"`
	OrderID   string  `json:"order_id,omitempty"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Timestamp int64   `json:"timestamp"`
}

type GPSDatalakePublisher struct {
	conn    *amqp.Connection
	channel *amqp.Channel
	url     string
	mu      sync.RWMutex
}

func NewGPSDatalakePublisher(url string) (*GPSDatalakePublisher, error) {
	p := &GPSDatalakePublisher{url: url}
	if err := p.connect(); err != nil {
		return nil, err
	}
	return p, nil
}

func (p *GPSDatalakePublisher) connect() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	conn, err := amqp.Dial(p.url)
	if err != nil {
		return fmt.Errorf("failed to connect to rabbitmq for gps publisher: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return fmt.Errorf("failed to open a channel: %w", err)
	}

	_, err = ch.QueueDeclare(
		DatalakeQueueName,
		true,  // durable
		false, // delete when unused
		false, // exclusive
		false, // no-wait
		nil,   // arguments
	)
	if err != nil {
		ch.Close()
		conn.Close()
		return fmt.Errorf("failed to declare datalake queue: %w", err)
	}

	p.conn = conn
	p.channel = ch
	return nil
}

func (p *GPSDatalakePublisher) Publish(ctx context.Context, msg interface{}) error {
	p.mu.RLock()
	ch := p.channel
	p.mu.RUnlock()

	if ch == nil {
		return fmt.Errorf("rabbitmq channel is not initialized")
	}

	body, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal gps message: %w", err)
	}

	err = ch.PublishWithContext(ctx,
		"",                // exchange
		DatalakeQueueName, // routing key
		false,             // mandatory
		false,             // immediate
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Body:         body,
			Timestamp:    time.Now(),
		})

	if err != nil {
		log.Printf("Failed to publish gps datalake message, attempting reconnect: %v", err)
		if reconnectErr := p.connect(); reconnectErr == nil {
			return p.Publish(ctx, msg)
		}
		return fmt.Errorf("failed to publish gps datalake message: %w", err)
	}

	return nil
}

// PublishCanonical publishes governed analytics events to the durable topic
// exchange. GPS keeps its legacy queue, while canonical events use a separate
// exchange so the datalake validator can reject malformed payloads safely.
func (p *GPSDatalakePublisher) PublishCanonical(ctx context.Context, event domain.CanonicalEventEnvelope) error {
	p.mu.RLock()
	ch := p.channel
	p.mu.RUnlock()
	if ch == nil {
		return fmt.Errorf("rabbitmq channel is not initialized")
	}
	if err := ch.ExchangeDeclare("tembus.events", "topic", true, false, false, false, nil); err != nil {
		return fmt.Errorf("declare canonical event exchange: %w", err)
	}
	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal canonical event: %w", err)
	}
	if err := ch.PublishWithContext(ctx, "tembus.events", event.EventType, false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		MessageId:    event.EventID,
		Timestamp:    event.ProducedAt,
		Headers: amqp.Table{
			"event_id":           event.EventID,
			"schema_version":     event.SchemaVersion,
			"market":             event.Market,
			"service":            event.Service,
			"correlation_id":     event.CorrelationID,
			"trace_id":           event.TraceID,
			"dedupe_key":         event.DedupeKey,
			"pii_classification": event.PIIClassification,
		},
		Body: body,
	}); err != nil {
		return fmt.Errorf("publish canonical event: %w", err)
	}
	return nil
}

func (p *GPSDatalakePublisher) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.channel != nil {
		p.channel.Close()
	}
	if p.conn != nil {
		return p.conn.Close()
	}
	return nil
}
