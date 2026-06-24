package consumer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/LANCAR/datalake-worker/internal/uploader"
	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	QueueName = "queue.ai.datalake.gps"
	// Flush batch every 1000 messages or every 1 hour, whichever comes first
	BatchSizeLimit = 1000
	FlushInterval  = 1 * time.Hour
)

type GPSMessage struct {
	CourierID string  `json:"courier_id"`
	OrderID   string  `json:"order_id,omitempty"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Timestamp int64   `json:"timestamp"`
}

type GPSConsumer struct {
	conn     *amqp.Connection
	ch       *amqp.Channel
	uploader *uploader.R2Uploader

	buffer []uploader.GPSLog
	mu     sync.Mutex
}

func NewGPSConsumer(rabbitURL string) (*GPSConsumer, error) {
	conn, err := amqp.Dial(rabbitURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to open a channel: %w", err)
	}

	_, err = ch.QueueDeclare(
		QueueName,
		true,  // durable
		false, // delete when unused
		false, // exclusive
		false, // no-wait
		nil,   // arguments
	)
	if err != nil {
		ch.Close()
		conn.Close()
		return nil, fmt.Errorf("failed to declare a queue: %w", err)
	}

	up, err := uploader.NewR2Uploader()
	if err != nil {
		log.Printf("Failed to init R2 Uploader: %v", err)
		// We still return the consumer, it might just fail to upload until configured
	}

	return &GPSConsumer{
		conn:     conn,
		ch:       ch,
		uploader: up,
		buffer:   make([]uploader.GPSLog, 0, BatchSizeLimit),
	}, nil
}

func (c *GPSConsumer) Start(ctx context.Context) error {
	msgs, err := c.ch.Consume(
		QueueName,
		"",    // consumer tag
		false, // auto-ack (we use manual ack to ensure data safety)
		false, // exclusive
		false, // no-local
		false, // no-wait
		nil,   // args
	)
	if err != nil {
		return fmt.Errorf("failed to register a consumer: %w", err)
	}

	ticker := time.NewTicker(FlushInterval)
	defer ticker.Stop()

	log.Printf("Listening for messages on %s...", QueueName)

	for {
		select {
		case <-ctx.Done():
			log.Println("Stopping consumer...")
			c.flushBuffer() // Flush whatever is left
			return nil

		case d, ok := <-msgs:
			if !ok {
				log.Println("RabbitMQ channel closed")
				return nil
			}

			var msg GPSMessage
			if err := json.Unmarshal(d.Body, &msg); err != nil {
				log.Printf("Error unmarshalling message: %v", err)
				d.Nack(false, false) // Reject and drop
				continue
			}

			logEntry := uploader.GPSLog{
				CourierID: msg.CourierID,
				OrderID:   msg.OrderID,
				Latitude:  msg.Latitude,
				Longitude: msg.Longitude,
				Timestamp: msg.Timestamp,
			}

			c.mu.Lock()
			c.buffer = append(c.buffer, logEntry)
			size := len(c.buffer)
			c.mu.Unlock()

			d.Ack(false) // Acknowledge message successfully buffered

			if size >= BatchSizeLimit {
				c.flushBuffer()
			}

		case <-ticker.C:
			c.flushBuffer()
		}
	}
}

func (c *GPSConsumer) flushBuffer() {
	c.mu.Lock()
	if len(c.buffer) == 0 {
		c.mu.Unlock()
		return
	}

	// Copy and clear buffer
	logsToUpload := make([]uploader.GPSLog, len(c.buffer))
	copy(logsToUpload, c.buffer)
	c.buffer = c.buffer[:0]
	c.mu.Unlock()

	log.Printf("Flushing %d records to Datalake...", len(logsToUpload))

	if c.uploader != nil {
		if err := c.uploader.UploadBatch(logsToUpload); err != nil {
			log.Printf("ERROR: Failed to upload batch to R2: %v", err)
			// In a production-ready system, we should save these to a local DLQ file
			// and retry later. For now, we log the error.
		}
	} else {
		log.Println("WARNING: Uploader not configured, dropping data.")
	}
}

func (c *GPSConsumer) Close() {
	if c.ch != nil {
		c.ch.Close()
	}
	if c.conn != nil {
		c.conn.Close()
	}
}
