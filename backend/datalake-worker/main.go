package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/LANCAR/datalake-worker/internal/consumer"
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

	// Start consuming
	go func() {
		if err := gpsConsumer.Start(ctx); err != nil {
			log.Fatalf("Consumer error: %v", err)
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
