package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/LANCAR/datalake-worker/internal/consumer"
	"github.com/LANCAR/datalake-worker/internal/sink"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env if exists (for local development)
	_ = godotenv.Load()

	log.Println("Starting Datalake Worker...")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize RabbitMQ Consumer
	rabbitURL := os.Getenv("RABBITMQ_URL")
	if rabbitURL == "" {
		rabbitURL = "amqp://guest:guest@localhost:5672/"
	}

	gpsConsumer, err := consumer.NewGPSConsumer(rabbitURL)
	if err != nil {
		log.Fatalf("Failed to initialize GPS consumer: %v", err)
	}
	defer gpsConsumer.Close()

	eventSpool, err := sink.NewEventSpool(os.Getenv("CANONICAL_EVENT_SPOOL_DIR"))
	if err != nil {
		log.Fatalf("Failed to initialize canonical event spool: %v", err)
	}
	canonicalEventConsumer, err := consumer.NewCanonicalEventConsumer(rabbitURL, eventSpool)
	if err != nil {
		log.Fatalf("Failed to initialize canonical event consumer: %v", err)
	}
	defer canonicalEventConsumer.Close()

	// Start consuming
	go func() {
		if err := gpsConsumer.Start(ctx); err != nil {
			log.Printf("GPS consumer error: %v", err)
		}
	}()
	go func() {
		if err := canonicalEventConsumer.Start(ctx); err != nil {
			log.Printf("Canonical event consumer error: %v", err)
		}
	}()

	log.Println("Datalake worker is running. Press Ctrl+C to exit.")

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down worker...")
	cancel()
	log.Println("Worker stopped safely.")
}

// trigger security scan
