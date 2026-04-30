package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"

	"lancar/auth-service/internal/handler"
	"lancar/auth-service/internal/middleware"
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
	svc := service.NewAuthService(repo, repo, repo, repo, repo)
	h := handler.NewAuthHandler(svc)


	// Routes
	http.HandleFunc("/auth/otp/send", h.RequestOTP)
	http.HandleFunc("/auth/otp/verify", h.VerifyOTP)
	http.HandleFunc("/auth/refresh", h.RefreshToken)
	http.HandleFunc("/auth/logout", h.Logout)
	
	// Protected Routes
	http.HandleFunc("/auth/register", middleware.AuthMiddleware(h.Register))
	http.HandleFunc("/auth/pin/set", middleware.AuthMiddleware(h.SetPIN))
	http.HandleFunc("/users/me", middleware.AuthMiddleware(h.GetMe))
	http.HandleFunc("/users/me/photo", middleware.AuthMiddleware(h.UpdatePhoto))
	
	// Courier Routes
	http.HandleFunc("/couriers/register", middleware.AuthMiddleware(h.RegisterCourier))
	http.HandleFunc("/couriers/documents", middleware.AuthMiddleware(h.UploadCourierDocument))
	http.HandleFunc("/couriers/me", middleware.AuthMiddleware(h.GetCourierProfile))
	
	// Admin Routes
	http.HandleFunc("/admin/users/role", middleware.AuthMiddleware(middleware.RoleMiddleware("admin", h.UpdateUserRole)))
	http.HandleFunc("/admin/audit-logs", middleware.AuthMiddleware(middleware.RoleMiddleware("admin", h.GetAuditLogs)))
	http.HandleFunc("/admin/couriers", middleware.AuthMiddleware(middleware.RoleMiddleware("admin", h.ListCouriers)))
	http.HandleFunc("/admin/couriers/verify", middleware.AuthMiddleware(middleware.RoleMiddleware("admin", h.VerifyCourier)))
	http.HandleFunc("/admin/couriers/suspend", middleware.AuthMiddleware(middleware.RoleMiddleware("admin", h.SuspendCourier)))
	http.HandleFunc("/admin/couriers/zones", middleware.AuthMiddleware(middleware.RoleMiddleware("admin", h.AssignCourierZone)))

	// Start Server
	port := os.Getenv("AUTH_PORT")
	if port == "" {
		port = "8081"
	}

	fmt.Printf("Auth Service starting on port %s...\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
