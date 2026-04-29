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
)

func main() {
	// Centralized .env loading. We go up two directories to find the root .env
	envPath := filepath.Join("..", "..", ".env")
	if err := godotenv.Load(envPath); err != nil {
		log.Printf("Warning: Error loading .env file from %s: %v", envPath, err)
	}

	dbUrl := os.Getenv("DATABASE_URL")
	if dbUrl == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	redisUrl := os.Getenv("REDIS_URL")
	if redisUrl == "" {
		log.Fatal("REDIS_URL is not set")
	}

	// Connect to Database
	db, err := sql.Open("postgres", dbUrl)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}
	log.Println("Successfully connected to Postgres!")

	// Connect to Redis
	opts, err := redis.ParseURL(redisUrl)
	if err != nil {
		log.Fatalf("Failed to parse redis URL: %v", err)
	}
	rdb := redis.NewClient(opts)
	defer rdb.Close()

	log.Println("Successfully connected to Redis!")

	// Initialize FeatureFlag reader
	_ = featureflags.NewFlagReader(db, rdb)

	log.Println("Routing service initialized. Feature flag reader is active.")
	// Ready to plug into HTTP or gRPC server...
}
