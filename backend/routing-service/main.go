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

	readDbUrl := os.Getenv("READ_DATABASE_URL")
	if readDbUrl == "" {
		readDbUrl = dbUrl
	}

	redisUrl := os.Getenv("REDIS_URL")
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

	// Initialize FeatureFlag reader with both connections
	_ = featureflags.NewFlagReader(db, readDB, rdb)

	log.Println("Routing service initialized. Feature flag reader is active (Dual-DB mode).")
	// Ready to plug into HTTP or gRPC server...
}
