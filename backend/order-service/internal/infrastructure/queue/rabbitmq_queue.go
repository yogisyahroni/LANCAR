package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"tembus/order-service/internal/domain/queue"

	amqp "github.com/rabbitmq/amqp091-go"
)

type RabbitMQQueue struct {
	conn    *amqp.Connection
	channel *amqp.Channel
	url     string
	mu      sync.RWMutex
}

// NewRabbitMQQueue initializes a new RabbitMQ connection and channel.
func NewRabbitMQQueue(url string) (*RabbitMQQueue, error) {
	q := &RabbitMQQueue{url: url}
	if err := q.connect(); err != nil {
		return nil, err
	}
	return q, nil
}

func (q *RabbitMQQueue) connect() error {
	q.mu.Lock()
	defer q.mu.Unlock()

	conn, err := amqp.Dial(q.url)
	if err != nil {
		return fmt.Errorf("failed to connect to rabbitmq: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return fmt.Errorf("failed to open a channel: %w", err)
	}

	// 1. Declare Dead Letter Exchange
	err = ch.ExchangeDeclare(
		"background_tasks_dlx", // name
		"direct",               // type
		true,                   // durable
		false,                  // auto-deleted
		false,                  // internal
		false,                  // no-wait
		nil,                    // arguments
	)
	if err != nil {
		return fmt.Errorf("failed to declare dlx exchange: %w", err)
	}

	// 2. Declare Dead Letter Queue
	_, err = ch.QueueDeclare(
		"background_tasks_dlq", // name
		true,                   // durable
		false,                  // delete when unused
		false,                  // exclusive
		false,                  // no-wait
		nil,                    // arguments
	)
	if err != nil {
		return fmt.Errorf("failed to declare dlq queue: %w", err)
	}

	// 3. Bind DLQ to DLX
	err = ch.QueueBind(
		"background_tasks_dlq", // name
		"background_tasks_dlq", // routing key
		"background_tasks_dlx", // exchange
		false,
		nil,
	)
	if err != nil {
		return fmt.Errorf("failed to bind dlq: %w", err)
	}

	// 4. Declare Primary Queue with DLX configuration
	args := amqp.Table{
		"x-dead-letter-exchange":    "background_tasks_dlx",
		"x-dead-letter-routing-key": "background_tasks_dlq",
	}

	_, err = ch.QueueDeclare(
		"background_tasks", // name
		true,               // durable
		false,              // delete when unused
		false,              // exclusive
		false,              // no-wait
		args,               // arguments
	)
	if err != nil {
		ch.Close()
		conn.Close()
		return fmt.Errorf("failed to declare primary queue: %w", err)
	}

	q.conn = conn
	q.channel = ch
	return nil
}

// Push sends a task to the RabbitMQ queue.
func (q *RabbitMQQueue) Push(ctx context.Context, task queue.Task) error {
	q.mu.RLock()
	ch := q.channel
	q.mu.RUnlock()

	if ch == nil {
		return fmt.Errorf("rabbitmq channel is not initialized")
	}

	body, err := json.Marshal(task)
	if err != nil {
		return fmt.Errorf("failed to marshal task: %w", err)
	}

	err = ch.PublishWithContext(ctx,
		"",                 // exchange
		"background_tasks", // routing key
		false,              // mandatory
		false,              // immediate
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Body:         body,
			Timestamp:    time.Now(),
		})

	if err != nil {
		// Attempt to reconnect if channel is closed
		log.Printf("Failed to publish task, attempting to reconnect: %v", err)
		if reconnectErr := q.connect(); reconnectErr == nil {
			// Retry once
			return q.Push(ctx, task)
		}
		return fmt.Errorf("failed to publish task to rabbitmq: %w", err)
	}

	return nil
}

// Consume listens for tasks and processes them using the provided handler.
func (q *RabbitMQQueue) Consume(ctx context.Context, handler func(queue.Task) error) error {
	q.mu.RLock()
	ch := q.channel
	q.mu.RUnlock()

	if ch == nil {
		return fmt.Errorf("rabbitmq channel is not initialized")
	}

	// Set QoS to ensure fair dispatch
	err := ch.Qos(1, 0, false)
	if err != nil {
		return fmt.Errorf("failed to set qos: %w", err)
	}

	msgs, err := ch.Consume(
		"background_tasks", // queue
		"",                 // consumer
		false,              // auto-ack
		false,              // exclusive
		false,              // no-local
		false,              // no-wait
		nil,                // args
	)
	if err != nil {
		return fmt.Errorf("failed to register consumer: %w", err)
	}

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case d, ok := <-msgs:
				if !ok {
					log.Println("RabbitMQ message channel closed, attempting to reconnect...")
					// In a real scenario, we might want to restart the consumer loop
					return
				}

				var task queue.Task
				if err := json.Unmarshal(d.Body, &task); err != nil {
					log.Printf("Failed to unmarshal task: %v", err)
					d.Nack(false, false) // Move to DLQ
					continue
				}

				if err := handler(task); err != nil {
					log.Printf("Task processing failed: %v", err)
					// Exponential backoff or max retries could be added here
					// For now, move to DLQ after failure
					d.Nack(false, false)
				} else {
					d.Ack(false)
				}
			}
		}
	}()

	return nil
}

// Close closes the RabbitMQ connection and channel.
func (q *RabbitMQQueue) Close() error {
	q.mu.Lock()
	defer q.mu.Unlock()

	if q.channel != nil {
		q.channel.Close()
	}
	if q.conn != nil {
		return q.conn.Close()
	}
	return nil
}
