package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"

	"lancar/auth-service/internal/handler"
	"lancar/auth-service/internal/repository"
	"lancar/auth-service/internal/service"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	// Load environment variables
	err := godotenv.Load("../../.env")
	if err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// Database Connection
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal("Could not connect to database:", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatal("Database is unreachable:", err)
	}

	// Dependency Injection
	repo := repository.NewPostgresRepository(db)
	svc := service.NewAuthService(repo, repo)
	h := handler.NewAuthHandler(svc)

	// Routes
	http.HandleFunc("/auth/otp/send", h.RequestOTP)
	http.HandleFunc("/auth/otp/verify", h.VerifyOTP)

	// Start Server
	port := os.Getenv("AUTH_PORT")
	if port == "" {
		port = "8081"
	}

	fmt.Printf("Auth Service starting on port %s...\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
