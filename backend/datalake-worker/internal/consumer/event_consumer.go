package consumer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/LANCAR/datalake-worker/internal/domain"
	"github.com/LANCAR/datalake-worker/internal/service"
	"github.com/LANCAR/datalake-worker/internal/sink"
	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	CanonicalEventQueue    = "queue.ai.datalake.canonical-events"
	CanonicalEventExchange = "tembus.events"
	CanonicalEventDLQ      = "queue.ai.datalake.canonical-events.dlq"
)

type CanonicalEventConsumer struct {
	conn      *amqp.Connection
	ch        *amqp.Channel
	sink      sink.CanonicalEventSink
	validator service.EventValidator
}

func NewCanonicalEventConsumer(rabbitURL string, eventSink sink.CanonicalEventSink) (*CanonicalEventConsumer, error) {
	if eventSink == nil {
		return nil, fmt.Errorf("canonical event sink is required")
	}
	conn, err := amqp.Dial(rabbitURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect canonical event consumer: %w", err)
	}
	ch, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("failed to open canonical event channel: %w", err)
	}
	if err := ch.ExchangeDeclare(CanonicalEventExchange, "topic", true, false, false, false, nil); err != nil {
		_ = ch.Close()
		_ = conn.Close()
		return nil, fmt.Errorf("declare canonical event exchange: %w", err)
	}
	if err := ch.ExchangeDeclare(CanonicalEventExchange+".dlq", "fanout", true, false, false, false, nil); err != nil {
		_ = ch.Close()
		_ = conn.Close()
		return nil, fmt.Errorf("declare canonical event dead-letter exchange: %w", err)
	}
	if _, err := ch.QueueDeclare(CanonicalEventDLQ, true, false, false, false, nil); err != nil {
		_ = ch.Close()
		_ = conn.Close()
		return nil, fmt.Errorf("declare canonical event dead-letter queue: %w", err)
	}
	if err := ch.QueueBind(CanonicalEventDLQ, "", CanonicalEventExchange+".dlq", false, nil); err != nil {
		_ = ch.Close()
		_ = conn.Close()
		return nil, fmt.Errorf("bind canonical event dead-letter queue: %w", err)
	}
	_, err = ch.QueueDeclare(
		CanonicalEventQueue,
		true,
		false,
		false,
		false,
		amqp.Table{"x-dead-letter-exchange": CanonicalEventExchange + ".dlq"},
	)
	if err != nil {
		_ = ch.Close()
		_ = conn.Close()
		return nil, fmt.Errorf("declare canonical event queue: %w", err)
	}
	if err := ch.QueueBind(CanonicalEventQueue, "#", CanonicalEventExchange, false, nil); err != nil {
		_ = ch.Close()
		_ = conn.Close()
		return nil, fmt.Errorf("bind canonical event queue: %w", err)
	}
	if err := ch.Qos(100, 0, false); err != nil {
		_ = ch.Close()
		_ = conn.Close()
		return nil, fmt.Errorf("configure canonical event prefetch: %w", err)
	}
	return &CanonicalEventConsumer{
		conn:      conn,
		ch:        ch,
		sink:      eventSink,
		validator: service.NewEventValidator(),
	}, nil
}

func (c *CanonicalEventConsumer) Start(ctx context.Context) error {
	messages, err := c.ch.Consume(CanonicalEventQueue, "", false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("consume canonical events: %w", err)
	}
	log.Printf("Listening for governed events on %s...", CanonicalEventQueue)
	for {
		select {
		case <-ctx.Done():
			return nil
		case delivery, ok := <-messages:
			if !ok {
				return nil
			}
			var event domain.EventEnvelope
			if err := json.Unmarshal(delivery.Body, &event); err != nil {
				log.Printf("canonical event rejected: invalid JSON")
				_ = delivery.Nack(false, false)
				continue
			}
			if err := c.validator.Validate(event); err != nil {
				log.Printf("canonical event rejected: validation failed: %v", err)
				_ = delivery.Nack(false, false)
				continue
			}
			duplicate, err := c.sink.Write(ctx, event)
			if err != nil {
				log.Printf("canonical event landing failed; retrying: %v", err)
				_ = delivery.Nack(false, true)
				continue
			}
			if err := delivery.Ack(false); err != nil {
				return fmt.Errorf("ack canonical event: %w", err)
			}
			if duplicate {
				log.Printf("canonical event replay suppressed by dedupe identity")
			}
		}
	}
}

func (c *CanonicalEventConsumer) Close() {
	if c.ch != nil {
		_ = c.ch.Close()
	}
	if c.conn != nil {
		_ = c.conn.Close()
	}
}
