package main

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"

	"lancar-backend/internal/featureflags"
	"lancar-backend/internal/routing"
	"net/http"
)

func main() {
	// Centralized .env loading. We go up two directories to find the root .env
	envPath := filepath.Join("..", "..", ".env")
	if err := godotenv.Load(envPath); err != nil {
		log.Printf("Info: No .env file found at %s, relying on environment variables", envPath)
	}

	dbUrl := os.Getenv("DATABASE_URL")
	log.Printf("DATABASE_URL present: %v", dbUrl != "")
	if dbUrl == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	readDbUrl := os.Getenv("READ_DATABASE_URL")
	if readDbUrl == "" {
		readDbUrl = dbUrl
	}

	redisUrl := os.Getenv("REDIS_URL")
	log.Printf("REDIS_URL present: %v", redisUrl != "")
	if redisUrl == "" {
		log.Fatal("REDIS_URL is not set")
	}

	// Connect to Primary Database (Writer)
	db, err := sql.Open("postgres", dbUrl)
	if err != nil {
		log.Fatalf("Failed to connect to primary database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping primary database: %v", err)
	}
	log.Println("Successfully connected to Primary Postgres!")

	// Connect to Read Replica Database (Reader)
	readDB, err := sql.Open("postgres", readDbUrl)
	if err != nil {
		log.Fatalf("Failed to connect to read replica database: %v", err)
	}
	defer readDB.Close()

	if err := readDB.Ping(); err != nil {
		log.Fatalf("Failed to ping read replica database: %v", err)
	}
	log.Println("Successfully connected to Read Replica Postgres!")

	// Connect to Redis
	opts, err := redis.ParseURL(redisUrl)
	if err != nil {
		log.Fatalf("Failed to parse redis URL: %v", err)
	}
	rdb := redis.NewClient(opts)
	defer rdb.Close()

	log.Println("Successfully connected to Redis!")

	// Initialize route selector dependencies with database-backed zone resolution.
	flagReader := featureflags.NewFlagReader(db, readDB, rdb)
	defer flagReader.Close()
	routingEngine := routing.NewRoutingEngineWithZoneResolver(flagReader, routing.NewPostgresZoneResolver(readDB))
	_ = routingEngine

	log.Println("Routing service initialized. Feature flag reader is active (Dual-DB mode).")

	// Start minimal HTTP server for health checks
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status": "UP", "service": "routing-service"}`))
	})

	port := os.Getenv("ROUTING_SERVICE_PORT")
	if port == "" {
		port = "8082"
	}

	log.Printf("Routing service is running on port %s...", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Failed to start HTTP server: %v", err)
	}
}
